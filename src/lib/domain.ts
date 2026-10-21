export const platforms = {
  mercado_livre: "Mercado Livre",
  amazon: "Amazon",
  shopee: "Shopee",
  other: "Outra fonte",
};
export type Platform = keyof typeof platforms;
export const categories = [
  "geral",
  "beleza",
  "perfumes",
  "eletronicos",
  "ferramentas",
  "pet",
  "casa",
  "moda",
] as const;
export const categoryNames: Record<string, string> = {
  geral: "Geral",
  beleza: "Beleza",
  perfumes: "Perfumes",
  eletronicos: "Eletrônicos",
  ferramentas: "Ferramentas",
  pet: "Pet",
  casa: "Casa",
  moda: "Moda",
};
export const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dateTime = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
export const statusNames: Record<string, string> = {
  draft: "Em revisão",
  approved: "Aprovada",
  rejected: "Rejeitada",
  saved: "Salva",
  unknown: "Desconhecido",
  announced: "Anunciado",
  scheduled: "Agendado",
  apparently_active: "Aparentemente ativo",
  verified: "Verificado com evidência",
  expired: "Expirado",
  exhausted: "Esgotado",
  invalid: "Inválido",
};
export type Seller = {
  id: string;
  platform: Platform;
  platform_seller_id: string;
  name: string;
  reputation: "unknown" | "good" | "excellent" | "poor";
  official: number;
  authenticity: "unknown" | "evidence";
  trust_status: "review" | "trusted" | "blocked";
  evidence: string;
  demo: number;
  api_metrics?: string | null;
  api_checked_at?: string | null;
};
export type Coupon = {
  last_verification_at?: string | null;
  id: string;
  code: string;
  platform: Platform;
  type: "percent" | "fixed";
  value: number;
  cap_cents: number | null;
  minimum_cents: number;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  rules_reviewed: number;
  source: string;
  original_text: string;
  demo: number;
  created_at: string;
  categories: string[];
  seller_ids: string[];
  excluded_seller_ids: string[];
  official_only: number;
  payment: string;
  audience: string;
  unknown_conditions: string[];
};
export type Group = {
  id: string;
  name: string;
  channel: string;
  category: string;
  description: string;
  audience: string;
  active: number;
  demo: number;
};
export type Offer = {
  opportunity?: {
    sufficient: boolean;
    count: number;
    days: number;
    median: number | null;
    below_percent: number | null;
  };
  api_metadata?: string | null;
  stock_quantity?: number | null;
  availability_status?: string | null;
  version: number;
  id: string;
  listing_id: string;
  coupon_id: string | null;
  status: string;
  demo: number;
  created_at: string;
  updated_at: string;
  platform: Platform;
  platform_listing_id: string;
  title: string;
  category: string;
  variation: string;
  seller_id: string;
  url: string;
  image_url: string | null;
  price_cents: number;
  reference_cents: number | null;
  reference_source: string | null;
  shipping_cents: number | null;
  checked_at: string;
  source: string;
  confidence: string;
  seller: Seller;
  coupon: Coupon | null;
  affiliate_url: string | null;
  affiliate_checked_at: string | null;
  group_ids: string[];
  score: Score;
  calculation: Calculation;
};
export type Calculation = {
  state: "eligible" | "unknown" | "ineligible";
  discount_cents: number;
  final_cents: number | null;
  confirmed: false;
  reasons: string[];
};
export type Score = {
  value: number;
  confidence: "baixa" | "moderada";
  factors: { label: string; points: number; maximum: number }[];
  warnings: string[];
  blocked: boolean;
};
export type CouponCandidate = {
  code: string;
  type: "percent" | "fixed";
  value: number;
  cap_cents: number | null;
  minimum_cents: number;
  original_text: string;
  unknown_conditions: string[];
};

export function parseCoupons(text: string): CouponCandidate[] {
  const matches = [
    ...text.matchAll(/(?:cupom|c[oó]digo)\s*[:\-]?\s*([a-z0-9_-]{3,32})\b/gi),
  ];
  const fallback = matches.length
    ? matches.map((m) => ({ code: m[1].toUpperCase(), index: m.index! }))
    : [...text.matchAll(/\b[A-Z][A-Z0-9_-]{2,31}\b/g)]
        .filter((m) => /\d/.test(m[0]))
        .map((m) => ({ code: m[0], index: m.index! }));
  return fallback
    .filter((m, i, arr) => arr.findIndex((x) => x.code === m.code) === i)
    .map((m, index, arr) => {
      const segment = text
        .slice(m.index, arr[index + 1]?.index ?? text.length)
        .trim();
      const amount = (s: string | undefined) =>
        s
          ? Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100)
          : null;
      const percent = segment.match(/(\d{1,2}(?:[,.]\d{1,2})?)\s*%/);
      const fixed =
        segment.match(/(?:desconto\s*(?:de\s*)?|menos\s*)R\$\s*([\d.,]+)/i) ||
        segment.match(/R\$\s*([\d.,]+)\s*(?:de\s*)?(?:desconto|off)/i);
      const cap = segment.match(
        /(?:teto|limitad[oa]\s*a|at[eé])\s*(?:R\$\s*)?([\d.,]+)/i,
      );
      const minimum = segment.match(
        /(?:m[ií]nim[oa]|acima de|a partir de)\s*(?:de\s*)?(?:R\$\s*)?([\d.,]+)/i,
      );
      return {
        code: m.code,
        type: percent ? "percent" : "fixed",
        value: percent
          ? Number(percent[1].replace(",", "."))
          : (amount(fixed?.[1]) ?? 0),
        cap_cents: amount(cap?.[1]),
        minimum_cents: amount(minimum?.[1]) ?? 0,
        original_text: segment,
        unknown_conditions: [
          "Plataforma, validade, público, pagamento e restrições precisam de revisão humana.",
        ],
      };
    });
}
export function couponState(coupon: Coupon, timestamp = Date.now()) {
  if (["invalid", "exhausted", "expired"].includes(coupon.status))
    return coupon.status;
  if (coupon.starts_at && Date.parse(coupon.starts_at) > timestamp)
    return "scheduled";
  if (coupon.ends_at && Date.parse(coupon.ends_at) <= timestamp)
    return "expired";
  return coupon.status;
}
export function calculateCoupon(
  price: number,
  category: string,
  seller: Seller,
  coupon: Coupon | null,
  timestamp = Date.now(),
): Calculation {
  if (!coupon)
    return {
      state: "eligible",
      discount_cents: 0,
      final_cents: price,
      confirmed: false,
      reasons: ["Preço informado manualmente; confirme no checkout."],
    };
  const reject: string[] = [],
    unknown: string[] = [];
  if (["unknown", "announced"].includes(coupon.status))
    unknown.push(
      "Disponibilidade do cupom ainda desconhecida ou apenas anunciada.",
    );
  if (coupon.platform !== seller.platform)
    reject.push("Cupom de outra plataforma.");
  if (
    ["scheduled", "expired", "invalid", "exhausted"].includes(
      couponState(coupon, timestamp),
    )
  )
    reject.push("Cupom fora da validade ou indisponível.");
  if (coupon.categories.length && !coupon.categories.includes(category))
    reject.push("Categoria não elegível.");
  if (
    coupon.seller_ids.length &&
    !coupon.seller_ids.includes(seller.platform_seller_id)
  )
    reject.push("Vendedor não está na lista elegível.");
  if (coupon.excluded_seller_ids.includes(seller.platform_seller_id))
    reject.push("Vendedor excluído deste cupom.");
  if (coupon.official_only && !seller.official)
    reject.push("Cupom exclusivo de loja oficial.");
  if (price < coupon.minimum_cents)
    reject.push("Valor abaixo da compra mínima.");
  if (seller.trust_status === "blocked") reject.push("Vendedor bloqueado.");
  if (!coupon.rules_reviewed || coupon.unknown_conditions.length)
    unknown.push("Há condições desconhecidas ou regras ainda não revisadas.");
  if (!coupon.starts_at || !coupon.ends_at)
    unknown.push("Validade incompleta.");
  if (coupon.payment)
    unknown.push(
      `Pagamento exigido: ${coupon.payment}. Não confirmado para esta compra.`,
    );
  if (coupon.audience)
    unknown.push(
      `Público exigido: ${coupon.audience}. Não confirmado para esta compra.`,
    );
  if (reject.length)
    return {
      state: "ineligible",
      discount_cents: 0,
      final_cents: null,
      confirmed: false,
      reasons: reject,
    };
  if (unknown.length)
    return {
      state: "unknown",
      discount_cents: 0,
      final_cents: null,
      confirmed: false,
      reasons: unknown,
    };
  let discount =
    coupon.type === "percent"
      ? Math.floor((price * coupon.value) / 100)
      : coupon.value;
  if (coupon.cap_cents !== null)
    discount = Math.min(discount, coupon.cap_cents);
  discount = Math.min(discount, price);
  return {
    state: "eligible",
    discount_cents: discount,
    final_cents: price - discount,
    confirmed: false,
    reasons: [
      "Cálculo teórico, sem confirmação no checkout. Frete e cashback não incluídos.",
    ],
  };
}
export function rankOffer(
  input: {
    seller: Seller;
    category: string;
    reference_cents: number | null;
    reference_source: string | null;
    price_cents: number;
    calculation: Calculation;
    checked_at: string;
    confidence?: string;
  },
  timestamp = Date.now(),
): Score {
  const warnings: string[] = [];
  const sensitive = ["perfumes", "beleza", "eletronicos"].includes(
    input.category,
  );
  if (input.seller.authenticity === "unknown")
    warnings.push(
      "Autenticidade não verificada. Reputação não comprova originalidade.",
    );
  if (input.seller.trust_status === "blocked")
    warnings.push("Vendedor bloqueado: aprovação impedida.");
  if (!input.reference_cents || !input.reference_source)
    warnings.push("Sem referência de preço documentada.");
  else
    warnings.push(
      input.confidence === "api"
        ? "Preço original anunciado pela plataforma; não comprova preço habitual."
        : "Referência informada manualmente; não é histórico de mercado.",
    );
  warnings.push(
    "Interesse e popularidade do público não medidos. Vendas e estoque dependem dos dados disponibilizados pela fonte.",
  );
  if (timestamp - Date.parse(input.checked_at) > 24 * 3600000)
    warnings.push("Última conferência tem mais de 24 horas.");
  const factors = [
    {
      label: "Referência documentada (fonte informada)",
      points:
        input.reference_cents &&
        input.reference_source &&
        input.reference_cents > input.price_cents
          ? Math.min(
              20,
              Math.round((1 - input.price_cents / input.reference_cents) * 40),
            )
          : 0,
      maximum: 30,
    },
    {
      label: "Reputação informada do vendedor",
      points:
        input.seller.reputation === "excellent"
          ? 20
          : input.seller.reputation === "good"
            ? 12
            : 0,
      maximum: 25,
    },
    {
      label: "Qualidade das regras do cupom",
      points: input.calculation.state === "eligible" ? 10 : 0,
      maximum: 15,
    },
    {
      label:
        input.confidence === "api"
          ? "Dados recentes da API oficial"
          : "Dados e conferência manual recente",
      points: timestamp - Date.parse(input.checked_at) < 86400000 ? 10 : 2,
      maximum: 15,
    },
    {
      label: "Evidência de autenticidade",
      points:
        input.seller.authenticity === "evidence" && input.seller.evidence
          ? 15
          : 0,
      maximum: 15,
    },
  ];
  return {
    value: factors.reduce((sum, f) => sum + f.points, 0),
    confidence:
      sensitive && input.seller.authenticity === "unknown"
        ? "baixa"
        : "moderada",
    factors,
    warnings,
    blocked:
      input.seller.trust_status === "blocked" ||
      input.seller.reputation === "poor",
  };
}
export function priceHistory(
  observations: { price_cents: number; observed_at: string }[],
  days = 30,
  timestamp = Date.now(),
) {
  const samples = observations.filter(
    (o) =>
      Date.parse(o.observed_at) >= timestamp - days * 86400000 &&
      Date.parse(o.observed_at) <= timestamp,
  );
  const values = samples.map((o) => o.price_cents).sort((a, b) => a - b);
  const dates = new Set(samples.map((o) => o.observed_at.slice(0, 10)));
  const sufficient = values.length >= 10 && dates.size >= 7;
  return {
    count: values.length,
    days,
    distinct_days: dates.size,
    sufficient,
    minimum: sufficient ? values[0] : null,
    mean: sufficient
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : null,
    median: sufficient
      ? Math.round(
          (values[Math.floor((values.length - 1) / 2)] +
            values[Math.ceil((values.length - 1) / 2)]) /
            2,
        )
      : null,
  };
}
export function sellerMismatch(expected: string, observed: string) {
  return expected !== observed;
}
export function generateMessage(offer: Offer, style = "informativo") {
  const lines = [
    style === "empolgado"
      ? "✨ Oferta para conferir!"
      : style === "comercial"
        ? "🛍️ Uma oportunidade para você:"
        : "🔎 Oferta em análise:",
    offer.title,
  ];
  if (offer.variation) lines.push(`Variação: ${offer.variation}`);
  if (offer.reference_cents && offer.reference_source)
    lines.push(
      `Referência informada: ${money(offer.reference_cents)} (${offer.reference_source})`,
    );
  lines.push(`Preço informado: ${money(offer.price_cents)}`);
  if (
    offer.coupon &&
    offer.calculation.state === "eligible" &&
    offer.calculation.final_cents !== null
  ) {
    lines.push(
      `🎟️ Cupom: ${offer.coupon.code}`,
      `Com cupom: ${money(offer.calculation.final_cents)} (estimativa; confirme as regras e o checkout)`,
    );
  } else if (offer.coupon)
    lines.push(
      `Cupom ${offer.coupon.code}: aplicação não confirmada; revisar condições.`,
    );
  lines.push(
    `🏬 Vendedor recomendado: ${offer.seller.name} (ID: ${offer.seller.platform_seller_id})`,
  );
  lines.push(
    `${offer.affiliate_url ? "🔗 Link informado como afiliado (rastreamento não verificado)" : "🔗 Link comum do produto; sem afiliação confirmada"}: ${offer.affiliate_url || offer.url}`,
  );
  if (offer.affiliate_url)
    lines.push(
      "Link de afiliado informado manualmente; comissão depende das regras e do rastreamento do programa.",
    );
  lines.push(
    `${offer.confidence === "api" ? "Consulta à API oficial" : "Conferência manual"}: ${dateTime(offer.checked_at)} (horário de Brasília).`,
    "⚠️ Confira o vendedor e o preço no checkout. Frete não incluído na estimativa.",
  );
  if (offer.demo)
    lines.unshift(
      "🧪 EXEMPLO FICTÍCIO — apenas para testar; não divulgar como oferta real.",
    );
  return lines.join("\n");
}
