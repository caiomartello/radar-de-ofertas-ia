import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/[...path]/route";
import { db, run, one, all, id, now } from "../src/lib/db";
import { hashPassword, publicUser, decryptCredential } from "../src/lib/auth";
import {
  executeRadarJob,
  testMeliConnection,
  radarAction,
  workerTick,
} from "../src/lib/radar";
import {
  MercadoLivreClient,
  validItem,
  type ApiTransport,
} from "../src/lib/mercado-livre";
import { getOffer, seedDemo } from "../src/lib/repository";
const directory = mkdtempSync(join(tmpdir(), "radar-connector-test-"));
process.env.DATABASE_PATH = join(directory, "test.sqlite");
process.env.APP_URL = "http://localhost:3000";
process.env.INTEGRATION_ENCRYPTION_KEY = "2".repeat(64);
after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});
const token = "FIXTURE-SEM-ACESSO-REAL-123456";
const item = {
  id: "MLB123456789",
  site_id: "MLB",
  title: "Produto fixture somente para testes",
  seller_id: 321,
  price: 300,
  currency_id: "BRL",
  status: "active",
  permalink: "https://produto.mercadolivre.com.br/MLB-123456789",
  secure_thumbnail: "https://http2.mlstatic.com/fixture.jpg",
  original_price: 400,
  category_id: "MLB1234",
  available_quantity: 7,
  variations: [] as unknown[],
};
const seller = {
  id: 321,
  nickname: "Vendedor fixture",
  seller_reputation: {
    level_id: "5_green",
    transactions: { total: 1000, completed: 950, canceled: 50 },
  },
};
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
let currentItem = { ...item };
const calls: string[] = [];
const transport: ApiTransport = async (url, init) => {
  assert.equal(new URL(url).origin, "https://api.mercadolibre.com");
  assert.equal(init.redirect, "error");
  assert.equal(
    (init.headers as Record<string, string>).Authorization,
    `Bearer ${token}`,
  );
  calls.push(url);
  const path = new URL(url).pathname;
  if (path === "/users/me") return json({ id: 999, site_id: "MLB" });
  if (path === "/sites/MLB/search")
    return json({
      site_id: "MLB",
      paging: { total: 1 },
      results: [{ id: item.id, seller: { id: 321 } }],
    });
  if (path === "/items") return json([{ code: 200, body: currentItem }]);
  if (path === "/users/321") return json(seller);
  throw new Error("O conector tentou consultar um recurso fora do teste.");
};
test("conector ML — respostas controladas, não um teste ao vivo", async (t) => {
  const ownerId = id(),
    operatorId = id();
  run(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
    ownerId,
    "Owner fixture",
    "owner@radar.test",
    hashPassword("Fixture-password-123!"),
    "owner",
  );
  run(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
    operatorId,
    "Operador fixture",
    "operator@radar.test",
    hashPassword("Fixture-password-123!"),
    "operator",
  );
  const owner = publicUser(ownerId)!,
    operator = publicUser(operatorId)!;
  let jobId = "",
    offerId = "",
    ownerCookie = "";
  async function http(
    path: string,
    method = "GET",
    payload?: unknown,
    cookie = ownerCookie,
  ) {
    const req = new NextRequest("http://localhost:3000/api/" + path, {
      method,
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        cookie,
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const res = await (method === "GET" ? GET : POST)(req, {
      params: Promise.resolve({ path: path.split("?")[0].split("/") }),
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0] || "",
    };
  }
  await t.test(
    "API exige autenticação; operadores não podem guardar tokens",
    async () => {
      assert.equal((await http("radar/state")).status, 401);
      ownerCookie = (
        await http(
          "auth/login",
          "POST",
          { email: "owner@radar.test", password: "Fixture-password-123!" },
          "",
        )
      ).cookie;
      await assert.rejects(
        () =>
          radarAction(operator, "credentials", undefined, "POST", {
            access_token: token,
            authorized: true,
          }),
        { status: 403 },
      );
    },
  );
  await t.test(
    "salva busca desligada e impede busca sem credencial",
    async () => {
      const created = (await radarAction(owner, "jobs", undefined, "POST", {
        query: "cafeteira",
        interval_minutes: 60,
      })) as { id: string };
      jobId = created.id;
      assert.equal(
        one<{ enabled: number }>(
          "SELECT enabled FROM radar_jobs WHERE id=?",
          jobId,
        )!.enabled,
        0,
      );
      await assert.rejects(() => executeRadarJob(jobId, owner, transport), {
        status: 422,
      });
      assert.equal(calls.length, 0);
      await assert.rejects(() =>
        radarAction(owner, "jobs", undefined, "POST", {
          query: "x",
          interval_minutes: 1,
        }),
      );
    },
  );
  await t.test(
    "token fica cifrado e guardá-lo não ativa a integração",
    async () => {
      await radarAction(owner, "credentials", undefined, "POST", {
        access_token: token,
        authorized: true,
      });
      const conn = one<{ status: string; credential_ciphertext: string }>(
        "SELECT * FROM integrations WHERE id='mercado_livre'",
      )!;
      assert.equal(conn.status, "configured");
      assert.notEqual(conn.credential_ciphertext, token);
      assert.equal(decryptCredential(conn.credential_ciphertext), token);
      assert.equal(
        JSON.stringify((await http("radar/state")).data).includes(token),
        false,
      );
      await assert.rejects(() => executeRadarJob(jobId, owner, transport), {
        status: 422,
      });
    },
  );
  await t.test(
    "token válido mas busca 403 não se torna integração ativa",
    async () => {
      const denied: ApiTransport = async (url) =>
        new URL(url).pathname === "/users/me"
          ? json({ id: 999, site_id: "MLB" })
          : json({ error: "forbidden" }, 403);
      await assert.rejects(
        () => testMeliConnection(owner, denied),
        (e) => e instanceof Error && e.message.includes("negou"),
      );
      assert.equal(
        one<{ status: string }>(
          "SELECT status FROM integrations WHERE id='mercado_livre'",
        )!.status,
        "permission_denied",
      );
      assert.equal(all("SELECT id FROM offers").length, 0);
    },
  );
  await t.test(
    "resposta de rede ou HTML nunca vira oferta fictícia",
    async () => {
      await assert.rejects(() =>
        new MercadoLivreClient(token, async () => {
          throw new Error("network");
        }).search("cafeteira"),
      );
      await assert.rejects(() =>
        new MercadoLivreClient(
          token,
          async () =>
            new Response("<html>blocked</html>", {
              headers: { "content-type": "text/html" },
            }),
        ).search("cafeteira"),
      );
      assert.equal(all("SELECT id FROM offers").length, 0);
    },
  );
  await t.test("formato inválido de busca impede ativação", async () => {
    await assert.rejects(() =>
      testMeliConnection(owner, async (url) =>
        new URL(url).pathname === "/users/me"
          ? json({ id: 999, site_id: "MLB" })
          : json({ results: [] }),
      ),
    );
    assert.equal(
      one<{ status: string }>(
        "SELECT status FROM integrations WHERE id='mercado_livre'",
      )!.status,
      "contract_error",
    );
  });
  await t.test(
    "teste de autorização exige perfil e busca válidos; não importa resultados",
    async () => {
      const result = await testMeliConnection(owner, transport);
      assert.equal(result.ok, true);
      assert.equal(
        one<{ status: string }>(
          "SELECT status FROM integrations WHERE id='mercado_livre'",
        )!.status,
        "active",
      );
      assert.equal(all("SELECT id FROM offers").length, 0);
    },
  );
  await t.test(
    "importa anúncio, vendedor e observação pela API, sem afiliação ou autenticidade inventadas",
    async () => {
      const result = await executeRadarJob(jobId, owner, transport);
      assert.equal(result.imported, 1);
      offerId = one<{ id: string }>("SELECT id FROM offers")!.id;
      const offer = getOffer(offerId);
      assert.equal(offer.demo, 0);
      assert.equal(offer.price_cents, 30000);
      assert.equal(offer.confidence, "api");
      assert.equal(offer.status, "draft");
      assert.equal(offer.affiliate_url, null);
      assert.equal(offer.seller.platform_seller_id, "321");
      assert.equal(offer.seller.authenticity, "unknown");
      assert.equal(offer.seller.trust_status, "review");
      assert.equal(offer.opportunity?.sufficient, false);
      assert.match(offer.reference_source!, /não comprova preço habitual/);
      assert.equal(
        JSON.parse(offer.seller.api_metrics!).transactions.total,
        1000,
      );
      assert.equal(JSON.parse(offer.api_metadata!).sold_quantity, null);
    },
  );
  await t.test(
    "nova execução atualiza sem duplicar e preserva links, grupos e listas manuais",
    async () => {
      const offer = getOffer(offerId);
      const groupId = id();
      run(
        "INSERT INTO groups VALUES (?,?,'whatsapp','geral','','',1,0)",
        groupId,
        "Grupo fixture",
      );
      run("INSERT INTO offer_groups VALUES (?,?)", offerId, groupId);
      run(
        "INSERT INTO affiliate_links VALUES (?,?,?,?,?,?,?,?,?)",
        id(),
        offer.listing_id,
        offer.seller_id,
        "mercado_livre",
        "https://example.com/afiliado",
        "Colado manualmente",
        "unverified",
        ownerId,
        now(),
      );
      run(
        "UPDATE sellers SET trust_status='blocked',evidence='Bloqueio humano de teste que deve ser preservado' WHERE id=?",
        offer.seller_id,
      );
      run("UPDATE offers SET status='approved' WHERE id=?", offerId);
      currentItem = { ...item, price: 290 };
      const result = await executeRadarJob(jobId, owner, transport);
      assert.equal(result.imported, 0);
      assert.equal(result.updated, 1);
      assert.equal(all("SELECT id FROM offers").length, 1);
      const updated = getOffer(offerId);
      assert.equal(updated.price_cents, 29000);
      assert.equal(updated.affiliate_url, "https://example.com/afiliado");
      assert.deepEqual(updated.group_ids, [groupId]);
      assert.equal(updated.seller.trust_status, "blocked");
      assert.equal(updated.status, "draft");
      assert.equal(updated.score.blocked, true);
      assert.equal(all("SELECT id FROM price_observations").length, 2);
    },
  );
  await t.test(
    "não importa variação ambígua, moeda estrangeira ou seller ID divergente",
    () => {
      for (const bad of [
        { ...item, variations: [{ id: 1 }] },
        { ...item, currency_id: "USD" },
        { ...item, seller_id: 999 },
        { ...item, available_quantity: 0 },
        { ...item, permalink: "https://attacker.test/product" },
      ])
        assert.equal(validItem(bad, item.id, 321).item, null);
    },
  );
  await t.test("execução com anúncios ignorados explica o motivo", async () => {
    currentItem = { ...item, variations: [{ id: 1 }] };
    const result = await executeRadarJob(jobId, owner, transport);
    assert.equal(result.imported, 0);
    assert.equal(result.updated, 0);
    assert.equal(result.skipped, 1);
    assert.ok(result.notes[0].includes("variações"));
    currentItem = { ...item };
  });
  await t.test(
    "anúncio sem estoque volta para revisão e não permite aprovação",
    async () => {
      run(
        "UPDATE sellers SET trust_status='review' WHERE id=?",
        getOffer(offerId).seller_id,
      );
      run("UPDATE offers SET status='approved' WHERE id=?", offerId);
      currentItem = { ...item, available_quantity: 0 };
      const result = await executeRadarJob(jobId, owner, transport);
      assert.equal(result.skipped, 1);
      assert.equal(getOffer(offerId).stock_quantity, 0);
      assert.equal(getOffer(offerId).status, "draft");
      assert.equal(
        (await http(`offers/${offerId}/status`, "POST", { status: "approved" }))
          .status,
        400,
      );
      assert.ok(
        one(
          "SELECT id FROM alerts WHERE offer_id=? AND dismissed_at IS NULL",
          offerId,
        ),
      );
      currentItem = { ...item };
      await executeRadarJob(jobId, owner, transport);
      assert.equal(getOffer(offerId).stock_quantity, 7);
      assert.equal(
        all(
          "SELECT id FROM alerts WHERE offer_id=? AND dismissed_at IS NULL",
          offerId,
        ).length,
        0,
      );
    },
  );
  await t.test(
    "Retry-After em data é respeitado, sem reduzir espera para uma hora",
    async () => {
      const future = new Date(Date.now() + 7200000).toUTCString();
      await assert.rejects(
        () =>
          new MercadoLivreClient(token, async () =>
            json({}, 429, { "retry-after": future }),
          ).search("teste"),
        (e: unknown) =>
          typeof e === "object" &&
          e !== null &&
          "retryAfterSeconds" in e &&
          Number(e.retryAfterSeconds) > 7000,
      );
    },
  );
  await t.test(
    "lease bloqueia execução simultânea e expirada é recuperável",
    async () => {
      run(
        "UPDATE radar_jobs SET lease_until=?,lease_owner=? WHERE id=?",
        new Date(Date.now() + 60000).toISOString(),
        "fixture-lease",
        jobId,
      );
      const before = calls.length;
      await assert.rejects(() => executeRadarJob(jobId, owner, transport), {
        status: 409,
      });
      assert.equal(calls.length, before);
      run(
        "UPDATE radar_jobs SET lease_until=? WHERE id=?",
        "2020-01-01T00:00:00Z",
        jobId,
      );
      await executeRadarJob(jobId, owner, transport);
      assert.equal(
        one<{ lease_owner: string | null }>(
          "SELECT lease_owner FROM radar_jobs WHERE id=?",
          jobId,
        )!.lease_owner,
        null,
      );
    },
  );
  await t.test(
    "429 persiste cooldown e bloqueia nova tentativa sem requisição",
    async () => {
      await assert.rejects(
        () =>
          executeRadarJob(jobId, owner, async () =>
            json({}, 429, { "retry-after": "120" }),
          ),
        { kind: "rate_limited" },
      );
      const conn = one<{ cooldown_until: string }>(
        "SELECT cooldown_until FROM integrations WHERE id='mercado_livre'",
      )!;
      assert.ok(Date.parse(conn.cooldown_until) > Date.now());
      const before = calls.length;
      await assert.rejects(() => executeRadarJob(jobId, owner, transport), {
        status: 429,
      });
      assert.equal(calls.length, before);
      run(
        "UPDATE integrations SET cooldown_until=NULL WHERE id='mercado_livre'",
      );
    },
  );
  await t.test(
    "token expirado registra falha e exige nova autorização",
    async () => {
      await assert.rejects(
        () => executeRadarJob(jobId, owner, async () => json({}, 401)),
        { kind: "unauthorized" },
      );
      assert.equal(
        one<{ status: string }>(
          "SELECT status FROM integrations WHERE id='mercado_livre'",
        )!.status,
        "reauthorization_required",
      );
      await testMeliConnection(owner, transport);
    },
  );
  await t.test(
    "agendamento exige confirmação e executa somente busca habilitada e vencida",
    async (t) => {
      await assert.rejects(() =>
        radarAction(owner, "jobs", jobId, "PATCH", {
          enabled: true,
          authorized: false,
        }),
      );
      await workerTick();
      assert.ok(
        one("SELECT value FROM radar_runtime WHERE key='worker_last_seen'"),
      );
      await radarAction(owner, "jobs", jobId, "PATCH", {
        enabled: true,
        authorized: true,
      });
      assert.equal(
        one<{ enabled: number }>(
          "SELECT enabled FROM radar_jobs WHERE id=?",
          jobId,
        )!.enabled,
        1,
      );
      t.mock.method(globalThis, "fetch", transport);
      const beforeRuns = all(
        "SELECT id FROM integration_runs WHERE job_id=?",
        jobId,
      ).length;
      await workerTick();
      assert.equal(
        all("SELECT id FROM integration_runs WHERE job_id=?", jobId).length,
        beforeRuns + 1,
      );
      await workerTick();
      assert.equal(
        all("SELECT id FROM integration_runs WHERE job_id=?", jobId).length,
        beforeRuns + 1,
      );
      await radarAction(owner, "jobs", jobId, "PATCH", { enabled: false });
    },
  );
  await t.test(
    "dados reais e exemplos ficam em visualizações separadas",
    async () => {
      seedDemo(owner);
      const real = (await http("state")).data;
      const demo = (await http("state?dataset=demo")).data;
      assert.ok(real.offers.length);
      assert.ok(real.offers.every((o: { demo: number }) => o.demo === 0));
      assert.equal(demo.offers.length, 3);
      assert.ok(demo.offers.every((o: { demo: number }) => o.demo === 1));
      assert.ok(real.sellers.every((s: { demo: number }) => s.demo === 0));
      assert.ok(demo.sellers.every((s: { demo: number }) => s.demo === 1));
      assert.equal(
        (await http("radar/test?dataset=demo", "POST", {})).status,
        400,
      );
    },
  );
  await t.test(
    "desconectar preserva ofertas, mas remove credencial e desliga agendamentos",
    async () => {
      const count = all("SELECT id FROM offers").length;
      await radarAction(owner, "disconnect", undefined, "POST", {});
      assert.equal(
        one<{ credential_ciphertext: null }>(
          "SELECT credential_ciphertext FROM integrations WHERE id='mercado_livre'",
        )!.credential_ciphertext,
        null,
      );
      assert.equal(all("SELECT id FROM offers").length, count);
      assert.equal(all("SELECT id FROM radar_jobs WHERE enabled=1").length, 0);
    },
  );
});
