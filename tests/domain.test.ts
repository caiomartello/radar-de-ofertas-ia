import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCoupon,
  parseCoupons,
  couponState,
  rankOffer,
  priceHistory,
  sellerMismatch,
  generateMessage,
  type Coupon,
  type Seller,
  type Offer,
} from "../src/lib/domain";
import { safeUrl } from "../src/lib/schemas";
const timestamp = Date.parse("2026-10-21T15:00:00Z");
const seller: Seller = {
  id: "s",
  platform: "mercado_livre",
  platform_seller_id: "123",
  name: "Vendedor de teste",
  reputation: "excellent",
  official: 0,
  authenticity: "unknown",
  trust_status: "review",
  evidence: "",
  demo: 0,
};
const coupon: Coupon = {
  id: "c",
  code: "CASA30",
  platform: "mercado_livre",
  type: "percent",
  value: 30,
  cap_cents: 6000,
  minimum_cents: 10000,
  starts_at: "2026-10-20T00:00:00Z",
  ends_at: "2026-10-22T00:00:00Z",
  status: "apparently_active",
  rules_reviewed: 1,
  source: "Fixture de teste",
  original_text: "",
  demo: 0,
  created_at: "2026-10-20T00:00:00Z",
  categories: ["casa"],
  seller_ids: [],
  excluded_seller_ids: [],
  official_only: 0,
  payment: "",
  audience: "",
  unknown_conditions: [],
};
test("separa quatro cupons e preserva condições desconhecidas", () => {
  const result = parseCoupons(
    "Cupom CASA30: 30% limitado a R$ 60 mínimo R$ 100\nCupom PET10: 10%\nCupom BELEZA20: 20%\nCupom FIXO15: R$ 15 de desconto",
  );
  assert.equal(result.length, 4);
  assert.deepEqual(
    result.map((c) => c.code),
    ["CASA30", "PET10", "BELEZA20", "FIXO15"],
  );
  assert.equal(result[0].cap_cents, 6000);
  assert.equal(result[0].minimum_cents, 10000);
  assert.equal(result[3].value, 1500);
  assert.ok(result.every((c) => c.unknown_conditions.length));
});
test("cupom de beleza não é elegível para celular", () => {
  assert.equal(
    calculateCoupon(
      30000,
      "eletronicos",
      seller,
      { ...coupon, categories: ["beleza"] },
      timestamp,
    ).state,
    "ineligible",
  );
});
test("cupom de loja oficial não se aplica a independente", () => {
  assert.equal(
    calculateCoupon(
      30000,
      "casa",
      seller,
      { ...coupon, official_only: 1 },
      timestamp,
    ).state,
    "ineligible",
  );
});
test("30% em R$ 300 limitado a R$ 60 resulta em R$ 240 teóricos", () => {
  const result = calculateCoupon(30000, "casa", seller, coupon, timestamp);
  assert.equal(result.discount_cents, 6000);
  assert.equal(result.final_cents, 24000);
  assert.equal(result.confirmed, false);
});
test("cupom futuro nunca aparece como ativo", () => {
  const future = {
    ...coupon,
    starts_at: "2026-10-22T00:00:00Z",
    ends_at: "2026-10-23T00:00:00Z",
  };
  assert.equal(couponState(future, timestamp), "scheduled");
  assert.equal(
    calculateCoupon(30000, "casa", seller, future, timestamp).state,
    "ineligible",
  );
});
test("cupom expirado ou com condições desconhecidas não calcula desconto", () => {
  assert.equal(
    calculateCoupon(
      30000,
      "casa",
      seller,
      { ...coupon, ends_at: "2026-10-21T12:00:00Z" },
      timestamp,
    ).state,
    "ineligible",
  );
  assert.equal(
    calculateCoupon(
      30000,
      "casa",
      seller,
      { ...coupon, unknown_conditions: ["somente contas selecionadas"] },
      timestamp,
    ).final_cents,
    null,
  );
});
test("pagamento e público não confirmados impedem afirmar elegibilidade", () => {
  for (const rule of [{ payment: "Pix" }, { audience: "Primeira compra" }])
    assert.equal(
      calculateCoupon(30000, "casa", seller, { ...coupon, ...rule }, timestamp)
        .state,
      "unknown",
    );
});
test("cruza plataforma, mínimo e IDs permitidos e excluídos", () => {
  for (const rule of [
    { platform: "amazon" as const },
    { minimum_cents: 40000 },
    { seller_ids: ["999"] },
    { excluded_seller_ids: ["123"] },
  ])
    assert.equal(
      calculateCoupon(30000, "casa", seller, { ...coupon, ...rule }, timestamp)
        .state,
      "ineligible",
    );
});
test("desconto fixo nunca produz preço negativo e arredonda para centavos", () => {
  assert.equal(
    calculateCoupon(
      30000,
      "casa",
      seller,
      { ...coupon, type: "fixed", value: 50000, cap_cents: null },
      timestamp,
    ).final_cents,
    0,
  );
  assert.equal(
    calculateCoupon(
      10001,
      "casa",
      seller,
      { ...coupon, value: 13, cap_cents: null },
      timestamp,
    ).discount_cents,
    1300,
  );
});
test("reputação excelente não comprova originalidade", () => {
  const score = rankOffer(
    {
      seller,
      category: "perfumes",
      reference_cents: null,
      reference_source: null,
      price_cents: 30000,
      calculation: calculateCoupon(30000, "perfumes", seller, null, timestamp),
      checked_at: new Date(timestamp).toISOString(),
    },
    timestamp,
  );
  assert.equal(score.confidence, "baixa");
  assert.ok(
    score.warnings.some((w) => w.includes("Autenticidade não verificada")),
  );
});
test("vendedor bloqueado impede aprovação independentemente do desconto", () => {
  const score = rankOffer(
    {
      seller: { ...seller, trust_status: "blocked" },
      category: "casa",
      reference_cents: 100000,
      reference_source: "manual",
      price_cents: 10000,
      calculation: calculateCoupon(10000, "casa", seller, null, timestamp),
      checked_at: new Date(timestamp).toISOString(),
    },
    timestamp,
  );
  assert.equal(score.blocked, true);
});
test("detecta troca de seller ID sem substituir vendedor", () => {
  assert.equal(sellerMismatch("123", "456"), true);
  assert.equal(sellerMismatch("123", "123"), false);
});
test("histórico insuficiente não recebe selo nem estatísticas enganosas", () => {
  const result = priceHistory(
    [{ price_cents: 10000, observed_at: new Date(timestamp).toISOString() }],
    30,
    timestamp,
  );
  assert.equal(result.sufficient, false);
  assert.equal(result.minimum, null);
  assert.equal(result.median, null);
});
test("estatísticas só usam observações da janela e amostra suficiente", () => {
  const observations = Array.from({ length: 10 }, (_, i) => ({
    price_cents: 10000 + i * 100,
    observed_at: new Date(timestamp - i * 86400000).toISOString(),
  }));
  const result = priceHistory(observations, 30, timestamp);
  assert.equal(result.sufficient, true);
  assert.equal(result.minimum, 10000);
  assert.equal(result.median, 10450);
});
test("mensagem não inventa preço antigo, escassez, estoque ou desconto", () => {
  const offer = {
    title: "Produto de teste",
    variation: "",
    price_cents: 30000,
    reference_cents: null,
    reference_source: null,
    coupon: null,
    seller,
    url: "https://example.com/item",
    affiliate_url: null,
    checked_at: new Date(timestamp).toISOString(),
    calculation: calculateCoupon(30000, "casa", seller, null, timestamp),
  } as Offer;
  const result = generateMessage(offer);
  assert.doesNotMatch(
    result,
    /últimas unidades|menor preço|histórico|de R\$|%|original garantido|estoque baixo/i,
  );
  assert.match(result, /Vendedor de teste/);
  assert.match(result, /Confira o vendedor/);
});
test("URLs perigosas são rejeitadas", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://user:pass@example.com",
    "https://127.0.0.1",
    "https://localhost",
  ])
    assert.equal(safeUrl.safeParse(url).success, false);
  assert.equal(
    safeUrl.safeParse("https://www.mercadolivre.com.br/item").success,
    true,
  );
});
