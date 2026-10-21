import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { db, run, one, all, id } from "../src/lib/db";
import {
  createSession,
  publicUser,
  decryptCredential,
  hashToken,
  type User,
} from "../src/lib/auth";
import { handleMeliOAuth } from "../src/lib/meli-oauth-http";
import {
  beginMeliOAuth,
  finishMeliOAuth,
  meliOAuthStatus,
  meliAccessToken,
  refreshMeliToken,
  saveMeliOAuthConfig,
  MELI_FLOW_COOKIE,
} from "../src/lib/meli-oauth";
import { radarAction, testMeliConnection } from "../src/lib/radar";
import type { ApiTransport } from "../src/lib/mercado-livre";

const folder = mkdtempSync(join(tmpdir(), "radar-oauth-test-"));
process.env.DATABASE_PATH = join(folder, "oauth.sqlite");
process.env.APP_URL = "http://localhost:3000";
process.env.INTEGRATION_ENCRYPTION_KEY = "4".repeat(64);
after(() => {
  db().close();
  rmSync(folder, { recursive: true, force: true });
});
const clientId = "1234567890123456";
const secret = "FIXTURE-SECRET-NAO-REAL-123";
const access = "FIXTURE-ACCESS-NAO-REAL-123";
const refresh = "FIXTURE-REFRESH-NAO-REAL-123";
const callback = "http://localhost:3000/api/oauth/mercado-livre/callback";
const json = (
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
const tokenResult = (extra = {}) => ({
  access_token: access,
  refresh_token: refresh,
  token_type: "Bearer",
  expires_in: 21600,
  user_id: 12345,
  scope: "read offline_access",
  ...extra,
});
function connection() {
  return one<Record<string, string | number | null>>(
    "SELECT * FROM integrations WHERE id='mercado_livre'",
  )!;
}
test("OAuth Mercado Livre — segurança e contratos com respostas controladas", async (t) => {
  const ownerId = id(),
    operatorId = id();
  run(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
    ownerId,
    "Owner OAuth fixture",
    "owner-oauth@example.test",
    "hash-fixture",
    "owner",
  );
  run(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
    operatorId,
    "Operador fixture",
    "operator-oauth@example.test",
    "hash-fixture",
    "operator",
  );
  const owner = publicUser(ownerId)!;
  let session = createSession(ownerId);
  const operatorSession = createSession(operatorId);
  const sessionCookie = () => "radar_session=" + session;
  async function http(
    operation: "config" | "start" | "callback" | "refresh",
    method = "GET",
    payload?: unknown,
    cookie = sessionCookie(),
    query = "",
    transport?: ApiTransport,
    origin = "http://localhost:3000",
  ) {
    return handleMeliOAuth(
      new NextRequest(
        `http://localhost:3000/api/oauth/mercado-livre/${operation}${query}`,
        {
          method,
          headers: { origin, cookie, "content-type": "application/json" },
          body: payload === undefined ? undefined : JSON.stringify(payload),
        },
      ),
      operation,
      transport,
    );
  }
  function start(user: User = owner, token = session) {
    run("DELETE FROM rate_limits WHERE key LIKE 'meli:%'");
    const flow = beginMeliOAuth(user, token);
    const url = new URL(flow.authorization_url);
    return {
      ...flow,
      url,
      params: new URLSearchParams({
        state: url.searchParams.get("state")!,
        code: "FIXTURE-CODE-ONLY-TESTS",
      }),
    };
  }
  const tokenApi: ApiTransport = async (url, init) => {
    assert.equal(url, "https://api.mercadolibre.com/oauth/token");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert.equal(
      (init.headers as Record<string, string>)["Content-Type"],
      "application/x-www-form-urlencoded",
    );
    const data = new URLSearchParams(String(init.body));
    assert.equal(data.get("client_id"), clientId);
    assert.equal(data.get("client_secret"), secret);
    assert.equal(new URL(url).search, "");
    return json(tokenResult());
  };
  async function connect(extra = {}) {
    run("UPDATE integrations SET cooldown_until=NULL WHERE id='mercado_livre'");
    const f = start();
    await finishMeliOAuth(f.params, f.browser, async () =>
      json(tokenResult(extra)),
    );
  }
  await t.test(
    "rotas de configuração exigem administrador, sessão e origem legítima",
    async () => {
      assert.equal((await http("config", "GET", undefined, "")).status, 401);
      assert.equal(
        (
          await http(
            "config",
            "GET",
            undefined,
            "radar_session=" + operatorSession,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await http(
            "config",
            "POST",
            {},
            sessionCookie(),
            "",
            undefined,
            "https://evil.example",
          )
        ).status,
        403,
      );
      assert.equal((await http("start", "POST", {})).status, 422);
      assert.equal(
        (
          await http("config", "POST", {
            client_id: clientId,
            client_secret: secret,
          })
        ).status,
        200,
      );
      const c = one<{ client_secret_ciphertext: string }>(
        "SELECT * FROM meli_oauth_config",
      )!;
      assert.notEqual(c.client_secret_ciphertext, secret);
      assert.equal(decryptCredential(c.client_secret_ciphertext), secret);
      const status = await (await http("config")).json();
      assert.equal(status.redirect_uri, callback);
      assert.equal(status.secret_present, true);
      assert.equal(status.configured, true);
      assert.equal(status.connected, false);
      assert.ok(!JSON.stringify(status).includes(secret));
    },
  );
  await t.test(
    "início cria estado imprevisível, PKCE S256 e cookie temporário Lax/HttpOnly",
    async () => {
      const res = await http("start", "POST", {});
      const body = await res.json(),
        url = new URL(body.authorization_url);
      assert.equal(url.origin, "https://auth.mercadolivre.com.br");
      assert.equal(url.pathname, "/authorization");
      assert.equal(url.searchParams.get("response_type"), "code");
      assert.equal(url.searchParams.get("redirect_uri"), callback);
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.match(url.searchParams.get("state")!, /^[A-Za-z0-9_-]{43}$/);
      assert.match(res.headers.get("set-cookie")!, /HttpOnly/i);
      assert.match(res.headers.get("set-cookie")!, /SameSite=lax/i);
      assert.match(res.headers.get("set-cookie")!, /Max-Age=600/i);
      const saved = one<{ state_hash: string; verifier_ciphertext: string }>(
        "SELECT * FROM meli_oauth_states",
      )!;
      assert.equal(saved.state_hash, hashToken(url.searchParams.get("state")!));
      assert.notEqual(
        saved.verifier_ciphertext,
        decryptCredential(saved.verifier_ciphertext),
      );
      assert.equal(
        createHash("sha256")
          .update(decryptCredential(saved.verifier_ciphertext))
          .digest("base64url"),
        url.searchParams.get("code_challenge"),
      );
      assert.ok(!JSON.stringify(body).includes(secret));
    },
  );
  await t.test(
    "estado errado, cookie ausente, duplicação e expiração não consultam o provedor",
    async () => {
      const f = start();
      let calls = 0;
      const forbidden: ApiTransport = async () => {
        calls++;
        throw new Error();
      };
      await assert.rejects(finishMeliOAuth(f.params, undefined, forbidden));
      await assert.rejects(
        finishMeliOAuth(
          new URLSearchParams({ state: "x".repeat(43), code: "x" }),
          f.browser,
          forbidden,
        ),
      );
      await assert.rejects(
        finishMeliOAuth(f.params, "x".repeat(43), forbidden),
      );
      const duplicate = new URLSearchParams(f.params);
      duplicate.append("state", f.params.get("state")!);
      await assert.rejects(finishMeliOAuth(duplicate, f.browser, forbidden));
      run("UPDATE meli_oauth_states SET expires_at='2000-01-01T00:00:00Z'");
      await assert.rejects(finishMeliOAuth(f.params, f.browser, forbidden));
      assert.equal(calls, 0);
    },
  );
  await t.test(
    "retorno vinculado à sessão ativa e à configuração que iniciou a autorização",
    async () => {
      let f = start();
      run("DELETE FROM sessions WHERE token_hash=?", hashToken(session));
      await assert.rejects(
        finishMeliOAuth(f.params, f.browser, tokenApi),
        /sessão/i,
      );
      session = createSession(ownerId);
      f = start();
      saveMeliOAuthConfig(owner, {
        client_id: clientId,
        client_secret: secret,
      });
      await assert.rejects(
        finishMeliOAuth(f.params, f.browser, tokenApi),
        /Estado OAuth/,
      );
      f = start();
      run("UPDATE users SET active=0 WHERE id=?", ownerId);
      await assert.rejects(
        finishMeliOAuth(f.params, f.browser, tokenApi),
        /Administrador/,
      );
      run("UPDATE users SET active=1 WHERE id=?", ownerId);
    },
  );
  await t.test(
    "callback sem cookie de login Strict troca código uma vez, cifra tokens e limpa URL",
    async () => {
      const f = start();
      let calls = 0;
      const res = await http(
        "callback",
        "GET",
        undefined,
        `${MELI_FLOW_COOKIE}=${f.browser}`,
        "?" + f.params,
        async (url, init) => {
          calls++;
          const body = new URLSearchParams(String(init.body));
          assert.equal(body.get("grant_type"), "authorization_code");
          assert.equal(body.get("code"), f.params.get("code"));
          assert.equal(body.get("redirect_uri"), callback);
          assert.equal(
            createHash("sha256")
              .update(body.get("code_verifier")!)
              .digest("base64url"),
            f.url.searchParams.get("code_challenge"),
          );
          return tokenApi(url, init);
        },
      );
      assert.equal(res.status, 303);
      assert.equal(
        res.headers.get("location"),
        "http://localhost:3000/?meli_oauth=connected",
      );
      assert.equal(res.headers.get("referrer-policy"), "no-referrer");
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.match(res.headers.get("set-cookie")!, /Max-Age=0/i);
      const saved = connection();
      assert.equal(
        decryptCredential(String(saved.credential_ciphertext)),
        access,
      );
      assert.equal(
        decryptCredential(String(saved.refresh_ciphertext)),
        refresh,
      );
      assert.equal(saved.oauth_user_id, "12345");
      assert.equal(saved.status, "configured");
      assert.equal(saved.verified_at, null);
      assert.equal(saved.automation_authorized, 0);
      assert.ok(Date.parse(String(saved.token_expires_at)) > Date.now());
      assert.equal(
        one<{ total: number }>("SELECT count(*) total FROM meli_oauth_states")!
          .total,
        0,
      );
      await assert.rejects(finishMeliOAuth(f.params, f.browser, tokenApi));
      assert.equal(calls, 1);
    },
  );
  await t.test(
    "cancelamento consome estado e preserva a conexão anterior sem ecoar erro externo",
    async () => {
      const before = connection().credential_ciphertext;
      const f = start();
      f.params.delete("code");
      f.params.set("error", "access_denied");
      f.params.set("error_description", secret);
      const res = await http(
        "callback",
        "GET",
        undefined,
        `${MELI_FLOW_COOKIE}=${f.browser}`,
        "?" + f.params,
        tokenApi,
      );
      assert.equal(
        res.headers.get("location"),
        "http://localhost:3000/?meli_oauth=cancelled",
      );
      assert.equal(connection().credential_ciphertext, before);
      const invalid = await http(
        "callback",
        "GET",
        undefined,
        "",
        "?code=" + secret,
      );
      assert.equal(
        invalid.headers.get("location"),
        "http://localhost:3000/?meli_oauth=failed",
      );
      assert.ok(!(await invalid.text()).includes(secret));
    },
  );
  await t.test(
    "renovação rotaciona ambos os tokens e não devolve segredos na API",
    async () => {
      const before = Number(connection().token_revision);
      const res = await http(
        "refresh",
        "POST",
        {},
        sessionCookie(),
        "",
        async (url, init) => {
          assert.equal(url, "https://api.mercadolibre.com/oauth/token");
          const data = new URLSearchParams(String(init.body));
          assert.equal(data.get("grant_type"), "refresh_token");
          assert.equal(data.get("refresh_token"), refresh);
          return json(
            tokenResult({
              access_token: access + "-2",
              refresh_token: refresh + "-2",
            }),
          );
        },
      );
      assert.equal(res.status, 200);
      assert.equal(Number(connection().token_revision), before + 1);
      assert.equal(
        decryptCredential(String(connection().credential_ciphertext)),
        access + "-2",
      );
      assert.equal(
        decryptCredential(String(connection().refresh_ciphertext)),
        refresh + "-2",
      );
      assert.ok(!(await res.text()).includes(access));
      const status = JSON.stringify(meliOAuthStatus(owner));
      for (const value of [access, refresh, secret])
        assert.ok(!status.includes(value));
    },
  );
  await t.test(
    "consulta renova token próximo de expirar antes de testar perfil e busca",
    async () => {
      run(
        "UPDATE integrations SET token_expires_at=? WHERE id='mercado_livre'",
        new Date(Date.now() + 30000).toISOString(),
      );
      const calls: string[] = [];
      await testMeliConnection(owner, async (url, init) => {
        const path = new URL(url).pathname;
        calls.push(path);
        if (path === "/oauth/token")
          return json(
            tokenResult({
              access_token: access + "-3",
              refresh_token: refresh + "-3",
            }),
          );
        assert.equal(
          (init.headers as Record<string, string>).Authorization,
          `Bearer ${access}-3`,
        );
        return path === "/users/me"
          ? json({ id: 12345, site_id: "MLB" })
          : json({ site_id: "MLB", paging: { total: 0 }, results: [] });
      });
      assert.deepEqual(calls, [
        "/oauth/token",
        "/users/me",
        "/sites/MLB/search",
      ]);
      assert.equal(connection().status, "active");
    },
  );
  await t.test(
    "401 renova uma vez; novo 401 exige reconexão e nunca repete indefinidamente",
    async () => {
      let refreshCalls = 0,
        profileCalls = 0;
      await assert.rejects(
        testMeliConnection(owner, async (url) => {
          if (url.endsWith("/oauth/token")) {
            refreshCalls++;
            return json(tokenResult());
          }
          profileCalls++;
          return json({ error: "invalid_token" }, 401);
        }),
      );
      assert.equal(refreshCalls, 1);
      assert.equal(profileCalls, 2);
      assert.equal(connection().status, "reauthorization_required");
    },
  );
  await t.test(
    "lock durável impede renovação simultânea e substituição/desconexão no meio da troca",
    async () => {
      await connect();
      let release!: (r: Response) => void;
      const pending = refreshMeliToken(
        async () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      );
      await assert.rejects(refreshMeliToken(tokenApi), /andamento/);
      await assert.rejects(
        radarAction(owner, "disconnect", undefined, "POST", {}),
        /andamento/,
      );
      assert.throws(
        () =>
          saveMeliOAuthConfig(owner, {
            client_id: clientId,
            client_secret: secret,
          }),
        /andamento/,
      );
      release(json(tokenResult({ refresh_token: refresh + "-rotated" })));
      await pending;
      assert.equal(connection().refresh_lease_owner, null);
    },
  );
  await t.test(
    "429 respeita espera, preserva refresh token e não dispara nova chamada",
    async () => {
      const before = connection().refresh_ciphertext;
      let calls = 0;
      await assert.rejects(
        refreshMeliToken(async () => {
          calls++;
          return json({}, 429, { "retry-after": "600" });
        }),
      );
      assert.equal(connection().refresh_ciphertext, before);
      assert.ok(
        Date.parse(String(connection().cooldown_until)) >= Date.now() + 590000,
      );
      await assert.rejects(
        refreshMeliToken(async () => {
          calls++;
          return json(tokenResult());
        }),
      );
      assert.equal(calls, 1);
      run(
        "UPDATE integrations SET cooldown_until=NULL WHERE id='mercado_livre'",
      );
    },
  );
  await t.test(
    "invalid_grant, rede incerta e conta divergente suspendem renovação sem reutilizar token",
    async () => {
      for (const api of [
        (async () =>
          json(
            { error: "invalid_grant", error_description: secret },
            400,
          )) as ApiTransport,
        (async () => {
          throw new Error(secret);
        }) as ApiTransport,
        (async () => json(tokenResult({ user_id: 999 }))) as ApiTransport,
      ]) {
        await connect();
        const old = connection().credential_ciphertext;
        await assert.rejects(refreshMeliToken(api));
        assert.equal(connection().status, "reauthorization_required");
        assert.equal(connection().refresh_ciphertext, null);
        assert.equal(connection().credential_ciphertext, old);
        assert.ok(!String(connection().oauth_error).includes(secret));
      }
    },
  );
  await t.test(
    "ausência de refresh token é explícita e bloqueia token expirado",
    async () => {
      await connect({ refresh_token: undefined });
      assert.equal(meliOAuthStatus(owner).refresh_supported, false);
      run(
        "UPDATE integrations SET token_expires_at='2000-01-01T00:00:00Z' WHERE id='mercado_livre'",
      );
      await assert.rejects(meliAccessToken(tokenApi), /sem renovação/);
    },
  );
  await t.test(
    "renovação interrompida não reutiliza refresh token potencialmente consumido",
    async () => {
      await connect();
      run(
        "UPDATE integrations SET refresh_lease_owner='processo-interrompido',refresh_lease_until='2000-01-01T00:00:00Z' WHERE id='mercado_livre'",
      );
      let calls = 0;
      await assert.rejects(
        refreshMeliToken(async () => {
          calls++;
          return json(tokenResult());
        }),
        /interrompida/,
      );
      assert.equal(calls, 0);
      assert.equal(connection().refresh_ciphertext, null);
    },
  );
  await t.test(
    "origem é configurada pelo servidor; HTTPS gera cookie Secure e callback correspondente",
    async () => {
      process.env.APP_URL = "https://localhost:3443";
      const res = await handleMeliOAuth(
        new NextRequest(
          "https://localhost:3443/api/oauth/mercado-livre/start",
          {
            method: "POST",
            headers: {
              origin: "https://localhost:3443",
              cookie: sessionCookie(),
            },
          },
        ),
        "start",
      );
      assert.equal(res.status, 200);
      assert.match(res.headers.get("set-cookie")!, /Secure/);
      const url = new URL((await res.json()).authorization_url);
      assert.equal(
        url.searchParams.get("redirect_uri"),
        "https://localhost:3443/api/oauth/mercado-livre/callback",
      );
      process.env.APP_URL = "http://evil.example";
      assert.throws(() => meliOAuthStatus(owner), /HTTPS/);
      process.env.APP_URL = "http://localhost:3000";
    },
  );
  await t.test(
    "desconexão apaga tokens e estados, preserva aplicação cifrada e não vaza segredos na auditoria",
    async () => {
      await connect();
      start();
      await radarAction(owner, "disconnect", undefined, "POST", {});
      assert.equal(connection().credential_ciphertext, null);
      assert.equal(connection().refresh_ciphertext, null);
      assert.equal(connection().oauth_client_id, null);
      assert.equal(
        one<{ total: number }>("SELECT count(*) total FROM meli_oauth_states")!
          .total,
        0,
      );
      assert.equal(meliOAuthStatus(owner).configured, true);
      const logs = JSON.stringify(all("SELECT * FROM audit_logs"));
      for (const value of [secret, access, refresh])
        assert.ok(!logs.includes(value));
    },
  );
});
