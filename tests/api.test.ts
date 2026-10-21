import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { backup, DatabaseSync } from "node:sqlite";
import { GET, POST, PATCH } from "../src/app/api/[...path]/route";
import { run, one, all, id, db } from "../src/lib/db";
import { hashPassword, decryptCredential, publicUser } from "../src/lib/auth";
import type { Coupon, Offer } from "../src/lib/domain";
const directory = mkdtempSync(join(tmpdir(), "radar-test-"));
process.env.DATABASE_PATH = join(directory, "test.sqlite");
process.env.APP_URL = "http://localhost:3000";
process.env.INTEGRATION_ENCRYPTION_KEY = "1".repeat(64);
const password = "Somente-fixture-de-teste-123!";
const ownerId = id();
async function request(
  path: string,
  method = "GET",
  payload?: unknown,
  cookie = "",
  origin = "http://localhost:3000",
) {
  const headers: Record<string, string> = {
    origin,
    "content-type": "application/json",
  };
  if (cookie) headers.cookie = cookie;
  const req = new NextRequest(`http://localhost:3000/api/${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const handler = method === "GET" ? GET : method === "PATCH" ? PATCH : POST;
  const response = await handler(req, {
    params: Promise.resolve({ path: path.split("?")[0].split("/") }),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
after(() => {
  db().close();
  rmSync(directory, { recursive: true, force: true });
});
test("fluxo real de API, banco, três contas e segurança", async (t) => {
  run(
    "INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)",
    ownerId,
    "Administrador de teste",
    "owner@example.test",
    hashPassword(password),
    "owner",
  );
  let ownerCookie = "",
    operatorCookie = "",
    operatorId = "",
    couponId = "",
    sellerId = "",
    groupId = "",
    offerId = "",
    draftId = "";
  await t.test("exige autenticação e origem legítima", async () => {
    assert.equal((await request("state")).status, 401);
    assert.equal(
      (
        await request(
          "auth/login",
          "POST",
          { email: "owner@example.test", password },
          "",
          "https://evil.test",
        )
      ).status,
      403,
    );
  });
  await t.test(
    "login cria cookie HttpOnly e não devolve hash de senha",
    async () => {
      const result = await request("auth/login", "POST", {
        email: "owner@example.test",
        password,
      });
      assert.equal(result.status, 200);
      ownerCookie = result.cookie;
      assert.ok(ownerCookie);
      assert.equal(
        JSON.stringify(result.data).includes("password_hash"),
        false,
      );
    },
  );
  await t.test(
    "convites criam dois operadores e não podem ser reutilizados",
    async () => {
      for (let index = 1; index <= 2; index++) {
        const invite = await request(
          "users/invite",
          "POST",
          { name: `Sócio ${index}`, email: `socio${index}@example.test` },
          ownerCookie,
        );
        assert.equal(invite.status, 201);
        const token = new URL(invite.data.url).searchParams.get("convite");
        const accept = await request("auth/accept", "POST", {
          token,
          password,
        });
        assert.equal(accept.status, 201);
        if (index === 1) {
          operatorCookie = accept.cookie;
          operatorId = accept.data.user.id;
        }
        assert.equal(
          (await request("auth/accept", "POST", { token, password })).status,
          400,
        );
      }
      assert.equal(
        one<{ count: number }>("SELECT COUNT(*) count FROM users")?.count,
        3,
      );
    },
  );
  await t.test(
    "operador não acessa credenciais nem eleva privilégios",
    async () => {
      assert.equal(
        (
          await request(
            `users/${operatorId}/permissions`,
            "PATCH",
            {
              active: true,
              permissions: [{ permission: "users.manage", allowed: true }],
            },
            operatorCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            "integrations/amazon",
            "PATCH",
            { credential: "segredo-de-teste" },
            operatorCookie,
          )
        ).status,
        403,
      );
      const state = await request("state", "GET", undefined, operatorCookie);
      assert.deepEqual(state.data.users, []);
      assert.deepEqual(state.data.audit, []);
    },
  );
  await t.test(
    "parser encontra quatro candidatos e não os grava automaticamente",
    async () => {
      const result = await request(
        "coupons/parse",
        "POST",
        {
          text: "Cupom CASA30: 30% limitado a R$ 60 mínimo R$ 100\nCupom PET10: 10%\nCupom BELEZA20: 20%\nCupom FIXO15: R$ 15 de desconto",
        },
        operatorCookie,
      );
      assert.equal(result.status, 200);
      assert.equal(result.data.candidates.length, 4);
      assert.equal(all("SELECT id FROM coupons").length, 0);
    },
  );
  await t.test("cadastra vendedor independente e grupo", async () => {
    const seller = await request(
      "sellers",
      "POST",
      {
        platform: "mercado_livre",
        platform_seller_id: "SELLER-1",
        name: "Vendedor de teste",
        reputation: "excellent",
      },
      operatorCookie,
    );
    assert.equal(seller.status, 201);
    sellerId = seller.data.id;
    const group = await request(
      "groups",
      "POST",
      { name: "Grupo de teste", category: "casa" },
      operatorCookie,
    );
    assert.equal(group.status, 201);
    groupId = group.data.id;
  });
  await t.test(
    "salva quatro cupons revisados sem declará-los verificados",
    async () => {
      for (const [code, category] of [
        ["CASA30", "casa"],
        ["PET10", "pet"],
        ["BELEZA20", "beleza"],
        ["FIXO15", "casa"],
      ]) {
        const result = await request(
          "coupons",
          "POST",
          {
            code,
            platform: "mercado_livre",
            type: "percent",
            value: 30,
            cap_cents: 6000,
            minimum_cents: 10000,
            starts_at: new Date(Date.now() - 3600000).toISOString(),
            ends_at: new Date(Date.now() + 86400000).toISOString(),
            status: "apparently_active",
            rules_reviewed: true,
            source: "Fonte de teste revisada",
            categories: [category],
            unknown_conditions: [],
          },
          operatorCookie,
        );
        assert.equal(result.status, 201);
        if (code === "CASA30") couponId = result.data.id;
      }
      const state = await request("state", "GET", undefined, operatorCookie);
      assert.equal(state.data.coupons.length, 4);
      assert.ok(
        state.data.coupons.every((c: Coupon) => c.status !== "verified"),
      );
    },
  );
  await t.test(
    "cria oferta com preço teórico e impede duplicidade sem efeitos parciais",
    async () => {
      const payload = {
        title: "Cafeteira de teste",
        category: "casa",
        platform: "mercado_livre",
        platform_listing_id: "ITEM-1",
        seller_id: sellerId,
        url: "https://www.mercadolivre.com.br/item",
        price_cents: 30000,
        coupon_id: couponId,
        group_ids: [groupId],
        affiliate_url: "https://example.com/afiliado",
      };
      const result = await request("offers", "POST", payload, operatorCookie);
      assert.equal(result.status, 201);
      offerId = result.data.id;
      assert.equal(
        (await request("offers", "POST", payload, operatorCookie)).status,
        409,
      );
      assert.equal(all("SELECT id FROM price_observations").length, 1);
      const state = await request("state", "GET", undefined, operatorCookie);
      const offer = state.data.offers[0] as Offer;
      assert.equal(offer.calculation.final_cents, 24000);
      assert.equal(offer.calculation.confirmed, false);
      assert.ok(offer.affiliate_checked_at);
      assert.ok(offer.checked_at);
      assert.equal(offer.seller.authenticity, "unknown");
    },
  );
  await t.test("aprova, gera e edita mensagem persistente", async () => {
    assert.equal(
      (
        await request(
          `offers/${offerId}/status`,
          "POST",
          { status: "approved", reason: "Dados conferidos manualmente." },
          operatorCookie,
        )
      ).status,
      200,
    );
    const draft = await request(
      "drafts",
      "POST",
      { offer_id: offerId, group_id: groupId, style: "informativo" },
      operatorCookie,
    );
    assert.equal(draft.status, 201);
    draftId = draft.data.id;
    const content = one<{ content: string }>(
      "SELECT content FROM message_drafts WHERE id=?",
      draftId,
    )!.content;
    assert.match(content, /240,00/);
    assert.match(content, /estimativa/);
    assert.equal(
      (
        await request(
          `drafts/${draftId}`,
          "PATCH",
          { content: content + "\nTexto revisado pela equipe." },
          operatorCookie,
        )
      ).status,
      200,
    );
  });
  await t.test(
    "copiar nunca marca publicação; publicar exige declaração e repetir exige confirmação",
    async () => {
      assert.equal(
        (await request(`drafts/${draftId}/copy`, "POST", {}, operatorCookie))
          .status,
        200,
      );
      assert.equal(all("SELECT id FROM publications").length, 0);
      assert.equal(
        (
          await request(
            "publications",
            "POST",
            { draft_id: draftId, confirm: true },
            operatorCookie,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await request(
            "publications",
            "POST",
            { draft_id: draftId, confirm: true },
            operatorCookie,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await request(
            "publications",
            "POST",
            { draft_id: draftId, confirm: true, allow_repeat: true },
            operatorCookie,
          )
        ).status,
        201,
      );
      assert.equal(all("SELECT id FROM publications").length, 2);
    },
  );
  await t.test(
    "troca de seller ID gera alerta e bloqueia aprovação",
    async () => {
      const check = await request(
        `offers/${offerId}/check`,
        "POST",
        {
          observed_seller_id: "OUTRO-SELLER",
          price_cents: 10000,
          evidence: "Conferência no anúncio de teste",
        },
        operatorCookie,
      );
      assert.equal(check.status, 200);
      assert.equal(check.data.mismatch, true);
      assert.equal(
        (
          await request(
            `offers/${offerId}/status`,
            "POST",
            { status: "approved" },
            operatorCookie,
          )
        ).status,
        400,
      );
      assert.equal(
        one<{ price_cents: number }>("SELECT price_cents FROM listings")
          ?.price_cents,
        30000,
      );
    },
  );
  await t.test(
    "conferência correta registra histórico e rascunho antigo fica inválido",
    async () => {
      assert.equal(
        (
          await request(
            `offers/${offerId}/check`,
            "POST",
            {
              observed_seller_id: "SELLER-1",
              price_cents: 30000,
              evidence: "Conferência correta no anúncio de teste",
            },
            operatorCookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            `drafts/${draftId}`,
            "PATCH",
            { content: "Tentativa de reutilizar rascunho desatualizado" },
            operatorCookie,
          )
        ).status,
        400,
      );
      const history = await request(
        `history/${offerId}`,
        "GET",
        undefined,
        operatorCookie,
      );
      assert.equal(history.status, 200);
      assert.equal(history.data.summary[0].sufficient, false);
      assert.equal(history.data.summary[0].minimum, null);
    },
  );
  await t.test(
    "não permite declarar verificado no cadastro de cupom",
    async () => {
      assert.equal(
        (
          await request(
            "coupons",
            "POST",
            {
              code: "FALSO",
              platform: "amazon",
              type: "percent",
              value: 10,
              source: "teste",
              status: "verified",
            },
            operatorCookie,
          )
        ).status,
        400,
      );
    },
  );
  await t.test(
    "credencial é cifrada, ausente de respostas e não ativa conector",
    async () => {
      const secret = "segredo-ficticio-exclusivo-de-teste";
      assert.equal(
        (
          await request(
            "integrations/amazon",
            "PATCH",
            { credential: secret },
            ownerCookie,
          )
        ).status,
        200,
      );
      const stored = one<{ credential_ciphertext: string }>(
        "SELECT credential_ciphertext FROM integrations WHERE id=?",
        "amazon",
      )!.credential_ciphertext;
      assert.notEqual(stored, secret);
      assert.equal(decryptCredential(stored), secret);
      const state = await request("state", "GET", undefined, ownerCookie);
      assert.equal(JSON.stringify(state.data).includes(secret), false);
      const integration = state.data.integrations.find(
        (i: { id: string }) => i.id === "amazon",
      );
      assert.equal(integration.status, "configured");
      assert.equal(integration.last_sync_at, null);
      assert.equal(integration.credential_present, 1);
    },
  );
  await t.test(
    "administrador retira aprovação e a API aplica a restrição",
    async () => {
      assert.equal(
        (
          await request(
            `users/${operatorId}/permissions`,
            "PATCH",
            {
              active: true,
              permissions: [{ permission: "offers.approve", allowed: false }],
            },
            ownerCookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("state", "GET", undefined, operatorCookie)).status,
        401,
      );
      operatorCookie = (
        await request("auth/login", "POST", {
          email: "socio1@example.test",
          password,
        })
      ).cookie;
      assert.equal(
        (
          await request(
            `offers/${offerId}/status`,
            "POST",
            { status: "approved" },
            operatorCookie,
          )
        ).status,
        403,
      );
      assert.equal(
        publicUser(operatorId)!.permissions.includes("offers.approve"),
        false,
      );
    },
  );
  await t.test("auditoria registra ações sem senhas ou tokens", () => {
    const logs = all("SELECT * FROM audit_logs");
    assert.ok(logs.length > 15);
    assert.equal(JSON.stringify(logs).includes(password), false);
    assert.ok(logs.some((a) => a.action === "manual_publication_declared"));
  });
  await t.test(
    "seed de demonstração funciona uma vez e rotula todos os registros",
    async () => {
      assert.equal(
        (await request("demo", "POST", {}, ownerCookie)).status,
        201,
      );
      const state = await request(
        "state?dataset=demo",
        "GET",
        undefined,
        ownerCookie,
      );
      assert.equal(
        state.data.offers.filter((o: Offer) => o.demo === 1).length,
        3,
      );
      assert.equal(
        (await request("demo", "POST", {}, ownerCookie)).status,
        409,
      );
    },
  );
  await t.test(
    "backup restaura contas, ofertas e integridade do banco",
    async () => {
      const target = join(directory, "restored.sqlite");
      await backup(db(), target);
      const restored = new DatabaseSync(target, { readOnly: true });
      assert.equal(
        (
          restored.prepare("SELECT COUNT(*) count FROM users").get() as {
            count: number;
          }
        ).count,
        3,
      );
      assert.equal(
        (
          restored.prepare("PRAGMA integrity_check").get() as {
            integrity_check: string;
          }
        ).integrity_check,
        "ok",
      );
      assert.equal(
        (
          restored.prepare("SELECT COUNT(*) count FROM publications").get() as {
            count: number;
          }
        ).count,
        2,
      );
      restored.close();
    },
  );
});
