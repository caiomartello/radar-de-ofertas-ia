import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { one, run, transaction, now, id, audit } from "./db";
import {
  AppError,
  authenticate,
  requirePermission,
  hashToken,
  encryptCredential,
  decryptCredential,
  limit,
  publicUser,
  type User,
} from "./auth";
import { ConnectorError, ML_API, type ApiTransport } from "./mercado-livre";

export const MELI_CALLBACK_PATH = "/api/oauth/mercado-livre/callback";
export const MELI_FLOW_COOKIE = "radar_meli_oauth";
const random = () => randomBytes(32).toString("base64url");
type Config = {
  client_id: string;
  client_secret_ciphertext: string;
  revision: number;
};
type Tokens = {
  status: string;
  credential_ciphertext: string | null;
  refresh_ciphertext: string | null;
  token_expires_at: string | null;
  oauth_user_id: string | null;
  oauth_client_id: string | null;
  token_revision: number;
  refresh_lease_until: string | null;
  cooldown_until: string | null;
  refresh_lease_owner: string | null;
};
const config = () => one<Config>("SELECT * FROM meli_oauth_config WHERE id=1");
const tokens = () =>
  one<Tokens>("SELECT * FROM integrations WHERE id='mercado_livre'")!;
export function meliAppUrl() {
  let url: URL;
  try {
    url = new URL(process.env.APP_URL || "http://localhost:3000");
  } catch {
    throw new AppError("APP_URL inválida no servidor.", 503);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  )
    throw new AppError(
      "APP_URL deve ser uma origem HTTPS, ou HTTP local para desenvolvimento.",
      503,
    );
  return url;
}
export const meliRedirectUri = () =>
  new URL(MELI_CALLBACK_PATH, meliAppUrl()).href;
function idle() {
  if (
    one("SELECT id FROM radar_jobs WHERE lease_until>?", now()) ||
    (tokens().refresh_lease_until || "") > now()
  )
    throw new AppError(
      "Aguarde a consulta ou renovação em andamento antes de alterar a conexão.",
      409,
    );
}
export function meliOAuthStatus(user: User) {
  requirePermission(user, "integrations.manage");
  const c = config();
  const t = tokens();
  return {
    configured: !!c,
    client_id: c?.client_id || "",
    secret_present: !!c,
    redirect_uri: meliRedirectUri(),
    local_http: meliAppUrl().protocol === "http:",
    connected: !!t.oauth_client_id && !!t.credential_ciphertext,
    needs_reconnection: t.status === "reauthorization_required",
    account_id: t.oauth_user_id,
    expires_at: t.token_expires_at,
    refresh_supported: !!t.refresh_ciphertext,
    error: one<{ oauth_error: string | null }>(
      "SELECT oauth_error FROM integrations WHERE id='mercado_livre'",
    )?.oauth_error,
  };
}
export function saveMeliOAuthConfig(user: User, payload: unknown) {
  requirePermission(user, "integrations.manage");
  const input = z
    .object({
      client_id: z
        .string()
        .trim()
        .regex(/^\d{5,30}$/),
      client_secret: z.string().trim().min(10).max(1000).regex(/^\S+$/),
    })
    .parse(payload);
  transaction(() => {
    idle();
    const t = tokens();
    if (t.oauth_client_id && t.oauth_client_id !== input.client_id)
      throw new AppError(
        "Desconecte o Mercado Livre antes de trocar o Client ID.",
        409,
      );
    run(
      "INSERT INTO meli_oauth_config(id,client_id,client_secret_ciphertext,updated_at) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,client_secret_ciphertext=excluded.client_secret_ciphertext,revision=revision+1,updated_at=excluded.updated_at",
      input.client_id,
      encryptCredential(input.client_secret),
      now(),
    );
    run("DELETE FROM meli_oauth_states");
    audit(user.id, "oauth_app_configured", "integration", "mercado_livre");
  });
  return {
    message:
      "Aplicação salva com Client Secret cifrado. Agora conecte sua conta.",
  };
}
export function beginMeliOAuth(user: User, sessionToken: string) {
  requirePermission(user, "integrations.manage");
  const sessionUser = authenticate(sessionToken);
  if (sessionUser.id !== user.id) throw new AppError("Sessão inválida.", 401);
  limit(`meli:oauth:start:${user.id}`, 10, 600000);
  const c = config();
  if (!c)
    throw new AppError(
      "Salve o Client ID e Client Secret em Integrações antes de conectar.",
      422,
    );
  idle();
  const state = random(),
    browser = random(),
    verifier = random();
  const redirect = meliRedirectUri();
  transaction(() => {
    run(
      "DELETE FROM meli_oauth_states WHERE expires_at<=? OR user_id=?",
      now(),
      user.id,
    );
    run(
      "INSERT INTO meli_oauth_states VALUES (?,?,?,?,?,?,?,?)",
      hashToken(state),
      hashToken(browser),
      hashToken(sessionToken),
      user.id,
      c.revision,
      redirect,
      encryptCredential(verifier),
      new Date(Date.now() + 600000).toISOString(),
    );
  });
  const url = new URL("https://auth.mercadolivre.com.br/authorization");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: c.client_id,
    redirect_uri: redirect,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return { authorization_url: url.href, browser };
}
const responseSchema = z.object({
  access_token: z.string().min(10).max(10000).regex(/^\S+$/),
  token_type: z.string().refine((v) => v.toLowerCase() === "bearer"),
  expires_in: z.number().int().positive().max(31536000),
  user_id: z.number().int().positive(),
  refresh_token: z.string().min(10).max(10000).regex(/^\S+$/).optional(),
  scope: z.string().max(3000).optional(),
});
type TokenResponse = z.infer<typeof responseSchema>;
async function requestTokens(
  c: Config,
  fields: Record<string, string>,
  transport: ApiTransport = fetch,
  onRequest: () => void = () => {},
) {
  const t = tokens();
  if (t.cooldown_until && t.cooldown_until > now())
    throw new AppError(
      "Aguarde o período de espera da API antes de conectar ou renovar.",
      429,
    );
  limit("ml:requests", 120, 3600000);
  onRequest();
  let response: Response;
  try {
    response = await transport(ML_API + "/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        ...fields,
        client_id: c.client_id,
        client_secret: decryptCredential(c.client_secret_ciphertext),
      }).toString(),
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
  } catch {
    throw new ConnectorError(
      "Não foi possível concluir a troca de credenciais com a API. Por segurança, uma troca incerta não será repetida automaticamente.",
      "network",
    );
  }
  if (response.status === 429) {
    const header = response.headers.get("retry-after") || "";
    const duration =
      Number(header) > 0
        ? Number(header)
        : (Date.parse(header) - Date.now()) / 1000;
    const wait =
      Number.isFinite(duration) && duration > 0
        ? Math.min(2147483647, Math.ceil(duration))
        : 60;
    run(
      "UPDATE integrations SET cooldown_until=? WHERE id='mercado_livre'",
      new Date(Date.now() + wait * 1000).toISOString(),
    );
    throw new ConnectorError(
      "Limite do serviço OAuth atingido. Aguarde antes de reconectar.",
      "rate_limited",
      429,
      wait,
    );
  }
  if (response.status === 400 || response.status === 401)
    throw new ConnectorError(
      "O Mercado Livre recusou a autorização ou a renovação. Confira a aplicação e reconecte a conta; nenhum segredo foi exibido.",
      "unauthorized",
      response.status,
    );
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new ConnectorError(
      "A troca OAuth não retornou uma resposta válida. Confira o acesso da aplicação.",
      "invalid_response",
      response.status,
    );
  const reader = response.body?.getReader();
  if (!reader)
    throw new ConnectorError("Resposta OAuth vazia.", "invalid_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 65536) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(chunk.value);
    }
    return responseSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    throw new ConnectorError(
      "Resposta OAuth incompleta ou incompatível; reconecte para evitar reutilizar uma credencial já consumida.",
      "invalid_response",
    );
  }
}
function storeTokens(t: TokenResponse, c: Config) {
  run(
    "UPDATE integrations SET credential_ciphertext=?,refresh_ciphertext=?,token_expires_at=?,oauth_user_id=?,oauth_client_id=?,oauth_scope=?,token_revision=token_revision+1,oauth_error=NULL WHERE id='mercado_livre'",
    encryptCredential(t.access_token),
    t.refresh_token ? encryptCredential(t.refresh_token) : null,
    new Date(Date.now() + t.expires_in * 1000).toISOString(),
    String(t.user_id),
    c.client_id,
    t.scope || null,
  );
}
export async function finishMeliOAuth(
  params: URLSearchParams,
  browser: string | undefined,
  transport?: ApiTransport,
) {
  const states = params.getAll("state");
  if (
    states.length !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(states[0]) ||
    !browser ||
    !/^[A-Za-z0-9_-]{43}$/.test(browser)
  )
    throw new AppError(
      "Retorno OAuth inválido. Inicie a conexão novamente pelo Radar.",
    );
  const claimed = transaction(() => {
    const saved = one<{
      user_id: string;
      session_hash: string;
      config_revision: number;
      redirect_uri: string;
      verifier_ciphertext: string;
    }>(
      "DELETE FROM meli_oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *",
      hashToken(states[0]),
      hashToken(browser),
      now(),
    );
    if (!saved)
      throw new AppError("Estado OAuth inválido, expirado ou já utilizado.");
    return saved;
  });
  // Cookie OAuth SameSite=Lax identifica o navegador no retorno externo. O cookie de login continua Strict.
  const session = one<{ user_id: string }>(
    "SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?",
    claimed.session_hash,
    now(),
  );
  if (!session || session.user_id !== claimed.user_id)
    throw new AppError(
      "A sessão que iniciou a conexão terminou. Entre novamente.",
      401,
    );
  const user = publicUser(claimed.user_id);
  if (!user) throw new AppError("Administrador indisponível.", 403);
  requirePermission(user, "integrations.manage");
  const c = config();
  if (
    !c ||
    c.revision !== claimed.config_revision ||
    claimed.redirect_uri !== meliRedirectUri()
  )
    throw new AppError("A configuração mudou. Inicie uma nova conexão.");
  if (params.has("error")) {
    audit(user.id, "oauth_cancelled", "integration", "mercado_livre");
    return "cancelled";
  }
  const codes = params.getAll("code");
  if (
    codes.length !== 1 ||
    !codes[0] ||
    codes[0].length > 4096 ||
    /\s/.test(codes[0])
  )
    throw new AppError("Código OAuth ausente ou inválido. Inicie novamente.");
  const lease = id();
  transaction(() => {
    idle();
    run(
      "UPDATE integrations SET refresh_lease_owner=?,refresh_lease_until=? WHERE id='mercado_livre'",
      lease,
      new Date(Date.now() + 60000).toISOString(),
    );
  });
  try {
    const result = await requestTokens(
      c,
      {
        grant_type: "authorization_code",
        code: codes[0],
        redirect_uri: claimed.redirect_uri,
        code_verifier: decryptCredential(claimed.verifier_ciphertext),
      },
      transport,
    );
    transaction(() => {
      const currentUser = publicUser(user.id);
      if (
        config()?.revision !== c.revision ||
        !one(
          "SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?",
          claimed.session_hash,
          now(),
        ) ||
        !currentUser
      )
        throw new AppError(
          "A sessão ou configuração mudou durante a conexão. Inicie novamente.",
        );
      requirePermission(currentUser, "integrations.manage");
      storeTokens(result, c);
      run(
        "UPDATE integrations SET status='configured',verified_at=NULL,automation_authorized=0,cooldown_until=NULL,error_message='Conta conectada por OAuth. Teste a autorização de busca antes de executar o radar.' WHERE id='mercado_livre'",
      );
      run("UPDATE radar_jobs SET enabled=0");
      audit(user.id, "oauth_connected", "integration", "mercado_livre", {
        refresh_supported: !!result.refresh_token,
      });
    });
    return "connected";
  } catch (e) {
    run(
      "UPDATE integrations SET oauth_error=? WHERE id='mercado_livre'",
      e instanceof AppError
        ? e.message
        : "A conexão não foi concluída. Tente autorizar novamente.",
    );
    throw e;
  } finally {
    run(
      "UPDATE integrations SET refresh_lease_owner=NULL,refresh_lease_until=NULL WHERE id='mercado_livre' AND refresh_lease_owner=?",
      lease,
    );
  }
}
export async function refreshMeliToken(
  transport?: ApiTransport,
  onRequest?: () => void,
) {
  const lease = id();
  const previous = tokens();
  if (
    previous.refresh_lease_owner &&
    previous.refresh_lease_until &&
    previous.refresh_lease_until <= now()
  ) {
    run(
      "UPDATE integrations SET status='reauthorization_required',verified_at=NULL,refresh_ciphertext=NULL,refresh_lease_owner=NULL,refresh_lease_until=NULL,oauth_error='Renovação anterior interrompida. Reconecte para evitar reutilizar um token consumido.' WHERE id='mercado_livre' AND refresh_lease_owner=?",
      previous.refresh_lease_owner,
    );
    throw new AppError(
      "Renovação anterior interrompida. Reconecte a conta por segurança.",
      422,
    );
  }
  const snapshot = transaction(() => {
    const c = config(),
      t = tokens();
    if (!c || !t.refresh_ciphertext || c.client_id !== t.oauth_client_id)
      throw new AppError(
        "A plataforma não forneceu renovação utilizável. Reconecte sua conta por OAuth.",
        422,
      );
    const taken = run(
      "UPDATE integrations SET refresh_lease_owner=?,refresh_lease_until=? WHERE id='mercado_livre' AND (refresh_lease_until IS NULL OR refresh_lease_until<=?)",
      lease,
      new Date(Date.now() + 60000).toISOString(),
      now(),
    );
    if (!taken.changes)
      throw new AppError(
        "A renovação já está em andamento. Aguarde e tente novamente.",
        409,
      );
    return { c, t };
  });
  try {
    const result = await requestTokens(
      snapshot.c,
      {
        grant_type: "refresh_token",
        refresh_token: decryptCredential(snapshot.t.refresh_ciphertext!),
      },
      transport,
      onRequest,
    );
    transaction(() => {
      const current = tokens();
      if (
        current.token_revision !== snapshot.t.token_revision ||
        config()?.revision !== snapshot.c.revision
      )
        throw new AppError(
          "A conexão mudou durante a renovação. Reconecte sua conta.",
          409,
        );
      if (String(result.user_id) !== snapshot.t.oauth_user_id)
        throw new ConnectorError(
          "A renovação retornou outra conta e foi recusada. Reconecte o Mercado Livre.",
          "invalid_response",
        );
      // Gravar o novo refresh token atomicamente; nunca presumir que o anterior continua válido.
      storeTokens(result, snapshot.c);
    });
    return result.access_token;
  } catch (e) {
    const message =
      e instanceof AppError
        ? e.message
        : "Falha de renovação; reconecte sua conta.";
    // Uma resposta perdida pode ter consumido um refresh token rotativo. Não repetir silenciosamente.
    if (e instanceof AppError && e.status === 429)
      run(
        "UPDATE integrations SET oauth_error=? WHERE id='mercado_livre'",
        message,
      );
    else
      run(
        "UPDATE integrations SET oauth_error=?,status='reauthorization_required',verified_at=NULL,refresh_ciphertext=NULL WHERE id='mercado_livre' AND token_revision=?",
        message,
        snapshot.t.token_revision,
      );
    throw e;
  } finally {
    run(
      "UPDATE integrations SET refresh_lease_owner=NULL,refresh_lease_until=NULL WHERE id='mercado_livre' AND refresh_lease_owner=?",
      lease,
    );
  }
}
export async function meliAccessToken(
  transport?: ApiTransport,
  onRequest?: () => void,
) {
  const t = tokens();
  if (t.refresh_lease_until && t.refresh_lease_until > now())
    throw new AppError("Conexão ou renovação em andamento. Aguarde.", 409);
  if (!t.credential_ciphertext)
    throw new AppError("Token não configurado.", 422);
  if (
    t.oauth_client_id &&
    t.token_expires_at &&
    Date.parse(t.token_expires_at) <= Date.now() + 90000
  ) {
    if (t.refresh_ciphertext) return refreshMeliToken(transport, onRequest);
    run(
      "UPDATE integrations SET status='reauthorization_required',verified_at=NULL WHERE id='mercado_livre'",
    );
    throw new AppError(
      "Token OAuth expirado ou próximo de expirar, sem renovação disponível. Reconecte a conta.",
      422,
    );
  }
  try {
    return decryptCredential(t.credential_ciphertext);
  } catch {
    throw new AppError(
      "Não foi possível abrir a credencial. Preserve a chave de criptografia e reconecte a conta.",
      503,
    );
  }
}
export const canRefreshMeli = () => !!tokens().refresh_ciphertext;
