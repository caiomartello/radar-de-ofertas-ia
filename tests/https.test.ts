import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { db, run, one, id } from "../src/lib/db";
import {
  publicUser,
  createSession,
  decryptCredential,
  hashToken,
} from "../src/lib/auth";
import {
  saveMeliOAuthConfig,
  beginMeliOAuth,
  meliOAuthStatus,
} from "../src/lib/meli-oauth";
import { gatewayProof, markTunnelVerified } from "../src/lib/meli-https";
import { createHandoff, consumeHandoff } from "../src/lib/meli-handoff";
import { handleMeliOAuth } from "../src/lib/meli-oauth-http";
import {
  GET as tunnelGET,
  POST as tunnelPOST,
} from "../src/app/api/oauth/mercado-livre/tunnel/route";
import type { ApiTransport } from "../src/lib/mercado-livre";
const require = createRequire(import.meta.url);
const { parseTunnelOrigin } = require("../iniciar-radar-https.cjs");
const {
  createCallbackGateway,
  verifyCallback,
  checkOrigin,
  CALLBACK_PATH,
  INTERNAL_PATH,
} = require("../callback-https.cjs");
const root = mkdtempSync(join(tmpdir(), "radar-https-tests-"));
process.env.DATABASE_PATH = join(root, "radar.sqlite");
process.env.APP_URL = "http://localhost:3000";
process.env.INTEGRATION_ENCRYPTION_KEY = "5".repeat(64);
const origin = "https://radar-https-fixture.trycloudflare.com",
  key = "6".repeat(64);
after(() => {
  db().close();
  rmSync(root, { recursive: true, force: true });
});
test("HTTPS e retorno local — transporte controlado, sem túnel público real", async (t) => {
  assert.equal(
    parseTunnelOrigin('Post "https://api.trycloudflare.com/tunnel": denied'),
    null,
  );
  assert.equal(
    parseTunnelOrigin(
      "Your quick Tunnel has been created!\nhttps://radar-https-fixture.trycloudflare.com",
    ),
    origin,
  );
  const uid = id();
  run(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
    uid,
    "Owner HTTPS fixture",
    "https@example.test",
    "hash-fixture",
    "owner",
  );
  const owner = publicUser(uid)!,
    session = createSession(uid);
  saveMeliOAuthConfig(owner, {
    client_id: "1234567890123456",
    client_secret: "FIXTURE-SECRET-SEM-ACESSO-REAL",
  });
  let publicUrl: string = "";
  await t.test(
    "HTTP local não é anunciado como URI válida e não inicia OAuth",
    () => {
      assert.equal(meliOAuthStatus(owner).redirect_uri, null);
      assert.throws(
        () => beginMeliOAuth(owner, session),
        /DevCenter exige HTTPS/,
      );
    },
  );
  process.env.MELI_OAUTH_CALLBACK_ORIGIN = origin;
  process.env.MELI_OAUTH_GATEWAY_KEY = key;
  async function localRequest(url: string, init: RequestInit = {}) {
    const req = new NextRequest(url, {
      ...init,
      signal: init.signal ?? undefined,
    });
    if (new URL(url).pathname === CALLBACK_PATH)
      return handleMeliOAuth(req, "callback");
    return init.method === "POST" ? tunnelPOST(req) : tunnelGET(req);
  }
  const gateway = createCallbackGateway({
    appOrigin: "http://localhost:3000",
    key,
    request: localRequest,
  });
  await new Promise<void>((r) => gateway.listen(0, "127.0.0.1", r));
  const port = gateway.address().port;
  const edge: typeof fetch = (url, init) =>
    fetch(
      `http://127.0.0.1:${port}` +
        new URL(String(url)).pathname +
        new URL(String(url)).search,
      init,
    );
  try {
    await t.test(
      "receptor interno exige chave; domínio público sozinho não libera a conexão",
      async () => {
        assert.equal(
          (
            await tunnelGET(
              new NextRequest(
                "http://localhost:3000" +
                  INTERNAL_PATH +
                  "?nonce=" +
                  "1".repeat(64),
              ),
            )
          ).status,
          403,
        );
        assert.equal(meliOAuthStatus(owner).redirect_uri, null);
        assert.throws(
          () => beginMeliOAuth(owner, session),
          /DevCenter exige HTTPS/,
        );
        await assert.rejects(
          verifyCallback({
            origin,
            appOrigin: "http://localhost:3000",
            key,
            publicRequest: async () => new Response("<html>erro</html>"),
            localRequest,
          }),
        );
        assert.equal(meliOAuthStatus(owner).https_ready, false);
      },
    );
    await t.test(
      "prova HTTPS percorre gateway e backend antes de liberar a URI",
      async () => {
        publicUrl = await verifyCallback({
          origin,
          appOrigin: "http://localhost:3000",
          key,
          publicRequest: edge,
          localRequest,
        });
        assert.equal(publicUrl, origin + CALLBACK_PATH);
        assert.equal(meliOAuthStatus(owner).redirect_uri, publicUrl);
        assert.equal(meliOAuthStatus(owner).https_ready, true);
      },
    );
    await t.test(
      "túnel não expõe dashboard, login, APIs ou outros métodos",
      async () => {
        for (const path of [
          "/",
          "/api/state",
          "/api/auth/login",
          INTERNAL_PATH,
        ])
          assert.equal((await edge(origin + path)).status, 404);
        assert.equal(
          (await edge(publicUrl, { method: "POST", body: "x" })).status,
          405,
        );
        assert.equal((await edge(publicUrl + "?code=sem-estado")).status, 400);
      },
    );
    await t.test(
      "callback público cria ticket cifrado, sem trocar código nem enviar cookies ao túnel",
      async () => {
        const flow = beginMeliOAuth(owner, session),
          auth = new URL(flow.authorization_url);
        assert.equal(auth.searchParams.get("redirect_uri"), publicUrl);
        const params = new URLSearchParams({
          state: auth.searchParams.get("state")!,
          code: "FIXTURE-CODE-ORIGINAL",
        });
        const response = await edge(publicUrl + "?" + params, {
          redirect: "manual",
          headers: { Cookie: "radar_session=NAO-ENCAMINHAR" },
        });
        assert.equal(response.status, 303);
        const target = new URL(response.headers.get("location")!);
        assert.equal(target.origin, "http://localhost:3000");
        assert.equal(target.pathname, CALLBACK_PATH);
        assert.equal(target.searchParams.has("code"), false);
        assert.equal(target.searchParams.has("state"), false);
        const saved = one<{ ticket_hash: string; params_ciphertext: string }>(
          "SELECT * FROM meli_oauth_handoffs",
        )!;
        assert.equal(
          saved.ticket_hash,
          hashToken(target.searchParams.get("handoff")!),
        );
        assert.ok(!saved.params_ciphertext.includes("FIXTURE-CODE"));
        assert.equal(
          new URLSearchParams(decryptCredential(saved.params_ciphertext)).get(
            "code",
          ),
          "FIXTURE-CODE-ORIGINAL",
        );
        assert.throws(() =>
          consumeHandoff(target.searchParams.get("handoff")!, "wrong"),
        );
        assert.equal(
          one<{ total: number }>(
            "SELECT count(*) total FROM meli_oauth_handoffs",
          )!.total,
          1,
        );
        let exchanges = 0;
        const tokenApi: ApiTransport = async (url, init) => {
          exchanges++;
          assert.equal(url, "https://api.mercadolibre.com/oauth/token");
          const body = new URLSearchParams(String(init.body));
          assert.equal(body.get("redirect_uri"), publicUrl);
          assert.equal(body.get("code"), "FIXTURE-CODE-ORIGINAL");
          return new Response(
            JSON.stringify({
              access_token: "FIXTURE-ACCESS-123456",
              refresh_token: "FIXTURE-REFRESH-123456",
              token_type: "Bearer",
              expires_in: 21600,
              user_id: 321,
            }),
            { headers: { "content-type": "application/json" } },
          );
        };
        const done = await handleMeliOAuth(
          new NextRequest(target, {
            headers: { cookie: "radar_meli_oauth=" + flow.browser },
          }),
          "callback",
          tokenApi,
        );
        assert.equal(done.status, 303);
        assert.equal(
          done.headers.get("location"),
          "http://localhost:3000/?meli_oauth=connected",
        );
        assert.equal(exchanges, 1);
        assert.equal(
          one<{ total: number }>(
            "SELECT count(*) total FROM meli_oauth_handoffs",
          )!.total,
          0,
        );
        const again = await handleMeliOAuth(
          new NextRequest(target, {
            headers: { cookie: "radar_meli_oauth=" + flow.browser },
          }),
          "callback",
          tokenApi,
        );
        assert.match(again.headers.get("location")!, /failed/);
        assert.equal(exchanges, 1);
      },
    );
    await t.test(
      "cancelamento também volta ao navegador local e não reflete descrição externa",
      async () => {
        const flow = beginMeliOAuth(owner, session),
          state = new URL(flow.authorization_url).searchParams.get("state")!;
        const r = await edge(
          publicUrl +
            "?" +
            new URLSearchParams({
              state,
              error: "access_denied",
              error_description: "NAO-REFLETIR",
            }),
          { redirect: "manual" },
        );
        assert.equal(r.status, 303);
        const done = await handleMeliOAuth(
          new NextRequest(r.headers.get("location")!, {
            headers: { cookie: "radar_meli_oauth=" + flow.browser },
          }),
          "callback",
        );
        assert.match(done.headers.get("location")!, /cancelled/);
        assert.ok(!(await done.text()).includes("NAO-REFLETIR"));
      },
    );
    await t.test(
      "ticket expirado, estado duplicado e origem diferente são recusados",
      () => {
        const flow = beginMeliOAuth(owner, session),
          state = new URL(flow.authorization_url).searchParams.get("state")!;
        assert.throws(() =>
          createHandoff(
            new URLSearchParams(
              "state=" + state + "&state=" + state + "&code=x",
            ),
            publicUrl,
          ),
        );
        assert.throws(() =>
          createHandoff(
            new URLSearchParams({ state, code: "x" }),
            origin + "/outro",
          ),
        );
        const ticket = createHandoff(
          new URLSearchParams({ state, code: "x" }),
          publicUrl,
        );
        run("UPDATE meli_oauth_handoffs SET expires_at='2000-01-01T00:00:00Z'");
        assert.throws(() => consumeHandoff(ticket, flow.browser));
      },
    );
    await t.test(
      "verificação expirada ou túnel reiniciado esconde a URI e bloqueia nova autorização",
      () => {
        run(
          "UPDATE radar_runtime SET value=? WHERE key='meli_https_verified'",
          JSON.stringify({
            origin,
            key_hash: hashToken(key),
            checked_at: "2000-01-01T00:00:00Z",
          }),
        );
        assert.equal(meliOAuthStatus(owner).redirect_uri, null);
        assert.throws(
          () => beginMeliOAuth(owner, session),
          /DevCenter exige HTTPS/,
        );
        const nonce = "a".repeat(64);
        markTunnelVerified(nonce, gatewayProof(nonce));
        process.env.MELI_OAUTH_GATEWAY_KEY = "7".repeat(64);
        assert.equal(meliOAuthStatus(owner).https_ready, false);
        process.env.MELI_OAUTH_GATEWAY_KEY = key;
        for (const url of [
          "http://x.trycloudflare.com",
          "https://x.trycloudflare.com.evil.test",
          "https://evil.test",
          "https://x.trycloudflare.com/path",
        ])
          assert.throws(() => checkOrigin(url));
      },
    );
  } finally {
    gateway.closeAllConnections();
    await new Promise<void>((r) => gateway.close(r));
  }
});
