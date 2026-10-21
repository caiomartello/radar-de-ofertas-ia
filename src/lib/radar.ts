import { z } from "zod";
import { all, one, run, transaction, id, now, audit } from "./db";
import {
  AppError,
  requirePermission,
  encryptCredential,
  decryptCredential,
  limit,
  publicUser,
  type User,
} from "./auth";
import {
  MercadoLivreClient,
  ConnectorError,
  validItem,
  type ApiTransport,
} from "./mercado-livre";
import { importMeliItem, markMeliReview } from "./radar-import";

type Connection = {
  status: string;
  credential_ciphertext: string | null;
  verified_at: string | null;
  cooldown_until: string | null;
  automation_authorized: number;
};
export type RadarJob = {
  id: string;
  query: string;
  interval_minutes: number;
  enabled: number;
  created_by: string;
  created_at: string;
  next_run_at: string;
  last_run_at: string | null;
  lease_until: string | null;
  lease_owner: string | null;
};
const connection = () =>
  one<Connection>("SELECT * FROM integrations WHERE id='mercado_livre'")!;
function ready() {
  const c = connection();
  if (!c.credential_ciphertext)
    throw new AppError(
      "Cadastre um token autorizado em Integrações → Mercado Livre. Conta de afiliado não fornece esse acesso automaticamente.",
      422,
    );
  if (c.cooldown_until && c.cooldown_until > now())
    throw new AppError(
      "O conector está em espera por limite de requisições. Tente após " +
        new Date(c.cooldown_until).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        }) +
        ".",
      429,
    );
  if (c.status !== "active" || !c.verified_at)
    throw new AppError(
      "O administrador precisa testar a autorização de busca antes de executar o radar.",
      422,
    );
  return c;
}
function client(
  c: Connection,
  onRequest: () => void,
  transport?: ApiTransport,
) {
  if (!c.credential_ciphertext)
    throw new AppError("Token não configurado.", 422);
  let token: string;
  try {
    token = decryptCredential(c.credential_ciphertext);
  } catch {
    throw new AppError(
      "A credencial não pôde ser aberta. Confira a chave de criptografia preservada e cadastre novamente o token, se necessário.",
      503,
    );
  }
  return new MercadoLivreClient(token, transport, () => {
    limit("ml:requests", 120, 3600000);
    onRequest();
  });
}
function recordFailure(error: unknown) {
  const kind = error instanceof ConnectorError ? error.kind : "internal";
  const message =
    error instanceof AppError
      ? error.message
      : "A execução não foi concluída. Consulte o administrador; nenhum resultado foi simulado.";
  let status = connection().status;
  if (kind === "unauthorized") status = "reauthorization_required";
  if (kind === "forbidden") status = "permission_denied";
  if (kind === "invalid_response") status = "contract_error";
  // Uma falha de rede não apaga a credencial nem a última autorização conhecida.
  const cooldown =
    kind === "rate_limited" ||
    (error instanceof AppError && error.status === 429)
      ? new Date(
          Date.now() +
            (error instanceof ConnectorError ? error.retryAfterSeconds : 3600) *
              1000,
        ).toISOString()
      : null;
  run(
    "UPDATE integrations SET status=?,error_message=?,cooldown_until=? WHERE id='mercado_livre'",
    status,
    message,
    cooldown,
  );
  return { message, kind };
}
export async function testMeliConnection(user: User, transport?: ApiTransport) {
  requirePermission(user, "integrations.manage");
  const c = connection();
  if (c.cooldown_until && c.cooldown_until > now())
    throw new AppError(
      "Aguarde o término do período de espera antes de testar novamente.",
      429,
    );
  const runId = id();
  let requests = 0;
  run(
    "INSERT INTO integration_runs(id,integration_id,status,started_at) VALUES (?,'mercado_livre','running',?)",
    runId,
    now(),
  );
  try {
    const api = client(
      c,
      () => {
        requests++;
      },
      transport,
    );
    await api.profile();
    const result = await api.search("cafeteira");
    transaction(() => {
      run(
        "UPDATE integrations SET status='active',verified_at=?,error_message=NULL,cooldown_until=NULL WHERE id='mercado_livre'",
        now(),
      );
      run(
        "UPDATE integration_runs SET status='success',finished_at=?,found_count=?,requests_count=?,details=? WHERE id=?",
        now(),
        result.results.length,
        requests,
        JSON.stringify({
          operation: "authorization_probe",
          notice: "Consulta real de autorização. Resultados não importados.",
        }),
        runId,
      );
      audit(user.id, "api_access_verified", "integration", "mercado_livre");
    });
    return {
      ok: true,
      message:
        "A API aceitou o token e a consulta de busca. Você já pode executar uma busca salva. Nenhum link de afiliado foi gerado.",
    };
  } catch (error) {
    const failure = recordFailure(error);
    run(
      "UPDATE integration_runs SET status='failed',finished_at=?,requests_count=?,error_message=?,details=? WHERE id=?",
      now(),
      requests,
      failure.message,
      JSON.stringify({ operation: "authorization_probe", kind: failure.kind }),
      runId,
    );
    throw error;
  }
}
export async function executeRadarJob(
  jobId: string,
  user: User,
  transport?: ApiTransport,
) {
  requirePermission(user, "offers.manage");
  const c = ready();
  const job = one<RadarJob>("SELECT * FROM radar_jobs WHERE id=?", jobId);
  if (!job) throw new AppError("Busca salva não encontrada.", 404);
  const runId = id();
  transaction(() => {
    const taken = run(
      "UPDATE radar_jobs SET lease_until=?,lease_owner=? WHERE id=? AND (lease_until IS NULL OR lease_until<=?)",
      new Date(Date.now() + 10 * 60000).toISOString(),
      runId,
      jobId,
      now(),
    );
    if (!taken.changes)
      throw new AppError(
        "Esta busca já está em execução. Aguarde o resultado.",
        409,
      );
    run(
      "UPDATE integration_runs SET status='interrupted',finished_at=?,error_message='A execução anterior perdeu o prazo e foi encerrada.' WHERE job_id=? AND status='running'",
      now(),
      jobId,
    );
    run(
      "INSERT INTO integration_runs(id,integration_id,status,started_at,job_id) VALUES (?,'mercado_livre','running',?,?)",
      runId,
      now(),
      jobId,
    );
  });
  let requests = 0,
    imported = 0,
    updated = 0,
    skipped = 0,
    found = 0;
  const notes: string[] = [];
  try {
    const api = client(
      c,
      () => {
        requests++;
      },
      transport,
    );
    const search = await api.search(job.query);
    found = search.results.length;
    const unique = [
      ...new Map(search.results.map((item) => [item.id, item])).values(),
    ].slice(0, 10);
    const items = await api.items(unique.map((i) => i.id));
    const sellerCache = new Map<
      number,
      Awaited<ReturnType<MercadoLivreClient["seller"]>>
    >();
    for (let index = 0; index < unique.length; index++) {
      const expected = unique[index];
      // Localizar por ID, sem confiar na ordem da resposta em lote.
      const response = items.find(
        (i) =>
          i.code === 200 &&
          typeof i.body === "object" &&
          i.body !== null &&
          "id" in i.body &&
          i.body.id === expected.id,
      );
      if (!response) {
        markMeliReview(
          expected.id,
          expected.seller.id,
          "Consulta detalhada não retornou anúncio válido.",
          user,
        );
        skipped++;
        notes.push(
          `${expected.id}: consulta detalhada não retornou anúncio válido.`,
        );
        continue;
      }
      const validated = validItem(
        response.body,
        expected.id,
        expected.seller.id,
      );
      if (!validated.item) {
        markMeliReview(
          expected.id,
          expected.seller.id,
          validated.reason || "Dados inconclusivos.",
          user,
          validated.unavailable,
        );
        skipped++;
        notes.push(`${expected.id}: ${validated.reason}`);
        continue;
      }
      const item = validated.item;
      let seller = sellerCache.get(item.seller_id);
      if (!seller) {
        seller = await api.seller(item.seller_id);
        sellerCache.set(item.seller_id, seller);
      }
      const result = importMeliItem(item, seller, user);
      if (result.inserted) imported++;
      else updated++;
    }
    transaction(() => {
      run(
        "UPDATE integration_runs SET status='success',finished_at=?,found_count=?,imported_count=?,updated_count=?,skipped_count=?,requests_count=?,details=? WHERE id=?",
        now(),
        found,
        imported,
        updated,
        skipped,
        requests,
        JSON.stringify({
          notes,
          source: "API oficial Mercado Livre",
          price_kind:
            "Preço do anúncio; cupom, frete e comissão não confirmados.",
        }),
        runId,
      );
      run(
        "UPDATE integrations SET last_sync_at=?,error_message=NULL,cooldown_until=NULL WHERE id='mercado_livre'",
        now(),
      );
      audit(user.id, "radar_completed", "radar_job", jobId, {
        found,
        imported,
        updated,
        skipped,
        requests,
      });
    });
    return {
      ok: true,
      run_id: runId,
      found,
      imported,
      updated,
      skipped,
      notes,
      message: `${imported} novas ofertas e ${updated} atualizações recebidas da API. ${skipped} anúncios não importados. Todas as ofertas exigem revisão humana.`,
    };
  } catch (error) {
    const failure = recordFailure(error);
    run(
      "UPDATE integration_runs SET status='failed',finished_at=?,found_count=?,imported_count=?,updated_count=?,skipped_count=?,requests_count=?,error_message=?,details=? WHERE id=?",
      now(),
      found,
      imported,
      updated,
      skipped,
      requests,
      failure.message,
      JSON.stringify({
        notes,
        kind: failure.kind,
        partial: imported + updated > 0,
      }),
      runId,
    );
    throw error;
  } finally {
    run(
      "UPDATE radar_jobs SET lease_until=NULL,lease_owner=NULL,last_run_at=?,next_run_at=? WHERE id=? AND lease_owner=?",
      now(),
      new Date(Date.now() + job.interval_minutes * 60000).toISOString(),
      jobId,
      runId,
    );
  }
}
export function radarState(user: User) {
  requirePermission(user, "offers.view");
  return {
    connection: one(
      "SELECT status,verified_at,last_sync_at,error_message,cooldown_until,automation_authorized,rate_limit,CASE WHEN credential_ciphertext IS NULL THEN 0 ELSE 1 END credential_present FROM integrations WHERE id='mercado_livre'",
    ),
    jobs: all<RadarJob>("SELECT * FROM radar_jobs ORDER BY created_at DESC"),
    runs: all(
      "SELECT r.*,j.query FROM integration_runs r LEFT JOIN radar_jobs j ON j.id=r.job_id WHERE r.integration_id=? ORDER BY r.started_at DESC LIMIT 30",
      "mercado_livre",
    ),
    worker_last_seen:
      one<{ value: string }>(
        "SELECT value FROM radar_runtime WHERE key='worker_last_seen'",
      )?.value ?? null,
    server_time: now(),
  };
}
const jobSchema = z.object({
  query: z.string().trim().min(2).max(100),
  interval_minutes: z.number().int().min(30).max(1440).default(60),
});
export async function radarAction(
  user: User,
  key: string | undefined,
  action: string | undefined,
  method: string,
  payload: unknown,
) {
  if (key === "state" && method === "GET") return radarState(user);
  if (key === "credentials" && method === "POST") {
    requirePermission(user, "integrations.manage");
    if (one("SELECT id FROM radar_jobs WHERE lease_until>?", now()))
      throw new AppError(
        "Aguarde a busca em andamento antes de substituir o token.",
        409,
      );
    const input = z
      .object({
        access_token: z
          .string()
          .trim()
          .min(10)
          .max(10000)
          .regex(/^\S+$/, "Cole somente o token, sem espaços."),
        authorized: z.literal(true),
      })
      .parse(payload);
    transaction(() => {
      run(
        "UPDATE integrations SET credential_ciphertext=?,status='configured',verified_at=NULL,error_message='Token guardado. Execute o teste de autorização; busca e geração de afiliados não são presumidas.',cooldown_until=NULL,automation_authorized=0 WHERE id='mercado_livre'",
        encryptCredential(input.access_token),
      );
      run("UPDATE radar_jobs SET enabled=0");
      audit(user.id, "credential_stored", "integration", "mercado_livre");
    });
    return {
      ok: true,
      message:
        "Token cifrado e guardado. A autorização de busca ainda não foi testada.",
    };
  }
  if (key === "disconnect" && method === "POST") {
    requirePermission(user, "integrations.manage");
    if (one("SELECT id FROM radar_jobs WHERE lease_until>?", now()))
      throw new AppError(
        "Aguarde a busca em andamento antes de desconectar.",
        409,
      );
    transaction(() => {
      run(
        "UPDATE integrations SET credential_ciphertext=NULL,status='not_configured',verified_at=NULL,error_message=NULL,automation_authorized=0 WHERE id='mercado_livre'",
      );
      run("UPDATE radar_jobs SET enabled=0");
      audit(user.id, "disconnected", "integration", "mercado_livre");
    });
    return { ok: true };
  }
  if (key === "test" && method === "POST") return testMeliConnection(user);
  if (key === "jobs" && !action && method === "POST") {
    requirePermission(user, "integrations.manage");
    const input = jobSchema.parse(payload),
      key = id();
    transaction(() => {
      run(
        "INSERT INTO radar_jobs(id,query,interval_minutes,created_by,created_at,next_run_at) VALUES (?,?,?,?,?,?)",
        key,
        input.query,
        input.interval_minutes,
        user.id,
        now(),
        now(),
      );
      audit(user.id, "radar_job_created", "radar_job", key, input);
    });
    return { id: key, message: "Busca salva. Agendamento começa desligado." };
  }
  if (key === "jobs" && action && method === "PATCH") {
    requirePermission(user, "integrations.manage");
    const input = z
      .object({ enabled: z.boolean(), authorized: z.boolean().default(false) })
      .parse(payload);
    if (!one("SELECT id FROM radar_jobs WHERE id=?", action))
      throw new AppError("Busca não encontrada.", 404);
    if (input.enabled) {
      ready();
      if (!input.authorized)
        throw new AppError(
          "Confirme que sua aplicação está autorizada a executar consultas recorrentes.",
        );
    }
    transaction(() => {
      run(
        "UPDATE radar_jobs SET enabled=?,next_run_at=? WHERE id=?",
        +input.enabled,
        now(),
        action,
      );
      if (input.enabled)
        run(
          "UPDATE integrations SET automation_authorized=1 WHERE id='mercado_livre'",
        );
      audit(user.id, "radar_schedule_changed", "radar_job", action, {
        enabled: input.enabled,
      });
    });
    return { ok: true };
  }
  if (key === "run" && action && method === "POST")
    return executeRadarJob(action, user);
  throw new AppError("Operação do radar não encontrada.", 404);
}
let ticking = false;
export async function workerTick() {
  if (ticking) return;
  ticking = true;
  try {
    run(
      "INSERT INTO radar_runtime VALUES ('worker_last_seen',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      now(),
    );
    const c = connection();
    if (
      c.status !== "active" ||
      !c.automation_authorized ||
      !c.credential_ciphertext ||
      (c.cooldown_until && c.cooldown_until > now())
    )
      return;
    const job = one<RadarJob>(
      "SELECT * FROM radar_jobs WHERE enabled=1 AND next_run_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY next_run_at LIMIT 1",
      now(),
      now(),
    );
    if (!job) return;
    const user = publicUser(job.created_by);
    if (!user || user.role !== "owner") {
      run("UPDATE radar_jobs SET enabled=0 WHERE id=?", job.id);
      return;
    }
    try {
      await executeRadarJob(job.id, user);
    } catch {
      /* O erro já está persistido no histórico; não imprimir credenciais. */
    }
  } finally {
    ticking = false;
  }
}
