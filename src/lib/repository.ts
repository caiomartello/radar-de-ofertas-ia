import { all, one, run, id, now, audit, transaction, type Row } from "./db";
import { AppError, type User } from "./auth";
import {
  calculateCoupon,
  rankOffer,
  type Coupon,
  type Seller,
  type Offer,
  type Group,
} from "./domain";
import {
  offerSchema,
  couponSchema,
  sellerSchema,
  groupSchema,
  type CouponInput,
  type OfferInput,
} from "./schemas";

export function coupons(): Coupon[] {
  return all<
    Coupon & {
      categories: string;
      seller_ids: string;
      excluded_seller_ids: string;
      unknown_conditions: string;
    }
  >(
    "SELECT c.*,(SELECT MAX(verified_at) FROM coupon_verifications cv WHERE cv.coupon_id=c.id) last_verification_at,r.categories,r.seller_ids,r.excluded_seller_ids,r.official_only,r.payment,r.audience,r.unknown_conditions FROM coupons c JOIN coupon_rules r ON r.coupon_id=c.id ORDER BY c.created_at DESC",
  ).map((c) => ({
    ...c,
    categories: JSON.parse(c.categories),
    seller_ids: JSON.parse(c.seller_ids),
    excluded_seller_ids: JSON.parse(c.excluded_seller_ids),
    unknown_conditions: JSON.parse(c.unknown_conditions),
  }));
}
export const sellers = () => all<Seller>("SELECT * FROM sellers ORDER BY name");
export const groups = () => all<Group>("SELECT * FROM groups ORDER BY name");
export function offers(): Offer[] {
  const sellerList = sellers(),
    couponList = coupons();
  return all<
    Omit<Offer, "seller" | "coupon" | "score" | "calculation" | "group_ids">
  >(`SELECT o.*,l.platform,l.platform_listing_id,l.seller_id,l.url,l.image_url,l.price_cents,l.reference_cents,l.reference_source,l.shipping_cents,l.checked_at,l.source,l.confidence,p.title,p.category,p.variation,
    (SELECT url FROM affiliate_links a WHERE a.listing_id=l.id ORDER BY a.created_at DESC LIMIT 1) affiliate_url,
    (SELECT created_at FROM affiliate_links a WHERE a.listing_id=l.id ORDER BY a.created_at DESC LIMIT 1) affiliate_checked_at
    FROM offers o JOIN listings l ON l.id=o.listing_id JOIN products p ON p.id=l.product_id ORDER BY o.created_at DESC`).map(
    (o) => {
      const seller = sellerList.find((s) => s.id === o.seller_id)!;
      const coupon = couponList.find((c) => c.id === o.coupon_id) || null;
      const calculation = calculateCoupon(
        o.price_cents,
        o.category,
        seller,
        coupon,
      );
      return {
        ...o,
        seller,
        coupon,
        calculation,
        score: rankOffer({ ...o, seller, calculation }),
        group_ids: all<{ group_id: string }>(
          "SELECT group_id FROM offer_groups WHERE offer_id=?",
          o.id,
        ).map((g) => g.group_id),
      };
    },
  );
}
export function getOffer(offerId: string) {
  const offer = offers().find((o) => o.id === offerId);
  if (!offer) throw new AppError("Oferta não encontrada.", 404);
  return offer;
}
export function saveSeller(
  user: User,
  raw: unknown,
  sellerId?: string,
  demo = false,
) {
  const data = sellerSchema.parse(raw),
    key = sellerId || id();
  if (sellerId && !one("SELECT id FROM sellers WHERE id=?", key))
    throw new AppError("Vendedor não encontrado.", 404);
  transaction(() => {
    if (sellerId) {
      const old = one<Seller>("SELECT * FROM sellers WHERE id=?", key)!;
      if (
        old.platform !== data.platform ||
        old.platform_seller_id !== data.platform_seller_id
      )
        throw new AppError(
          "Para outro ID de vendedor, cadastre um novo vendedor. A identidade histórica é preservada.",
        );
      run(
        "UPDATE sellers SET name=?,reputation=?,official=?,authenticity=?,trust_status=?,evidence=? WHERE id=?",
        data.name,
        data.reputation,
        +data.official,
        data.authenticity,
        data.trust_status,
        data.evidence,
        key,
      );
      run(
        "UPDATE offers SET status='draft',updated_at=?,version=version+1 WHERE listing_id IN (SELECT id FROM listings WHERE seller_id=?)",
        now(),
        key,
      );
    } else
      run(
        "INSERT INTO sellers VALUES (?,?,?,?,?,?,?,?,?,?)",
        key,
        data.platform,
        data.platform_seller_id,
        data.name,
        data.reputation,
        +data.official,
        data.authenticity,
        data.trust_status,
        data.evidence,
        +demo,
      );
    audit(user.id, sellerId ? "updated" : "created", "seller", key, data);
  });
  return key;
}
export function saveGroup(
  user: User,
  raw: unknown,
  groupId?: string,
  demo = false,
) {
  const data = groupSchema.parse(raw),
    key = groupId || id();
  if (groupId && !one("SELECT id FROM groups WHERE id=?", key))
    throw new AppError("Grupo não encontrado.", 404);
  transaction(() => {
    if (groupId)
      run(
        "UPDATE groups SET name=?,channel=?,category=?,description=?,audience=?,active=? WHERE id=?",
        data.name,
        data.channel,
        data.category,
        data.description,
        data.audience,
        +data.active,
        key,
      );
    else
      run(
        "INSERT INTO groups VALUES (?,?,?,?,?,?,?,?)",
        key,
        data.name,
        data.channel,
        data.category,
        data.description,
        data.audience,
        +data.active,
        +demo,
      );
    audit(user.id, groupId ? "updated" : "created", "group", key, data);
  });
  return key;
}
// A importação sempre exige confirmação explícita; parser nunca grava nem verifica cupons.
export function saveCoupon(
  user: User,
  raw: unknown,
  couponId?: string,
  demo = false,
) {
  const data = couponSchema.parse(raw),
    key = couponId || id();
  if (couponId && !one("SELECT id FROM coupons WHERE id=?", key))
    throw new AppError("Cupom não encontrado.", 404);
  transaction(() => insertCoupon(user, key, data, couponId, demo));
  return key;
}
function insertCoupon(
  user: User,
  key: string,
  data: CouponInput,
  existing?: string,
  demo = false,
) {
  if (existing) {
    run(
      "UPDATE coupons SET code=?,platform=?,type=?,value=?,cap_cents=?,minimum_cents=?,starts_at=?,ends_at=?,status=?,rules_reviewed=?,source=?,original_text=? WHERE id=?",
      data.code,
      data.platform,
      data.type,
      data.value,
      data.cap_cents,
      data.minimum_cents,
      data.starts_at,
      data.ends_at,
      data.status,
      +data.rules_reviewed,
      data.source,
      data.original_text,
      key,
    );
    run(
      "UPDATE offers SET status='draft',updated_at=?,version=version+1 WHERE coupon_id=?",
      now(),
      key,
    );
  } else
    run(
      "INSERT INTO coupons VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      key,
      data.code,
      data.platform,
      data.type,
      data.value,
      data.cap_cents,
      data.minimum_cents,
      data.starts_at,
      data.ends_at,
      data.status,
      +data.rules_reviewed,
      data.source,
      data.original_text,
      +demo,
      now(),
    );
  run(
    "INSERT INTO coupon_rules VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(coupon_id) DO UPDATE SET categories=excluded.categories,seller_ids=excluded.seller_ids,excluded_seller_ids=excluded.excluded_seller_ids,official_only=excluded.official_only,payment=excluded.payment,audience=excluded.audience,unknown_conditions=excluded.unknown_conditions",
    key,
    JSON.stringify(data.categories),
    JSON.stringify(data.seller_ids),
    JSON.stringify(data.excluded_seller_ids),
    +data.official_only,
    data.payment,
    data.audience,
    JSON.stringify(data.unknown_conditions),
  );
  run(
    "INSERT INTO coupon_sources VALUES (?,?,?,?,?)",
    id(),
    key,
    data.original_text,
    data.source,
    now(),
  );
  audit(user.id, existing ? "updated" : "created", "coupon", key, data);
}
export function saveOffer(
  user: User,
  raw: unknown,
  offerId?: string,
  demo = false,
) {
  const data = offerSchema.parse(raw),
    key = offerId || id(),
    timestamp = now();
  const seller = one<Seller>(
    "SELECT * FROM sellers WHERE id=?",
    data.seller_id,
  );
  if (!seller || seller.platform !== data.platform)
    throw new AppError("Escolha um vendedor da mesma plataforma da oferta.");
  if (
    data.coupon_id &&
    !one("SELECT id FROM coupons WHERE id=?", data.coupon_id)
  )
    throw new AppError("Cupom não encontrado.");
  for (const group of data.group_ids)
    if (!one("SELECT id FROM groups WHERE id=? AND active=1", group))
      throw new AppError("Escolha grupos ativos.");
  const existing = offerId ? getOffer(offerId) : null;
  const usesDemo =
    demo ||
    existing?.demo === 1 ||
    seller.demo === 1 ||
    !!(
      data.coupon_id &&
      one<{ demo: number }>(
        "SELECT demo FROM coupons WHERE id=?",
        data.coupon_id,
      )?.demo
    ) ||
    data.group_ids.some(
      (group) =>
        !!one<{ demo: number }>("SELECT demo FROM groups WHERE id=?", group)
          ?.demo,
    );
  transaction(() =>
    insertOffer(user, key, data, timestamp, existing, usesDemo),
  );
  return key;
}
function insertOffer(
  user: User,
  key: string,
  data: OfferInput,
  timestamp: string,
  existing: Offer | null,
  demo: boolean,
) {
  const identity = [
    data.platform,
    data.platform_listing_id,
    data.variation.trim().toLowerCase(),
  ].join("|");
  let product = one<{ id: string }>(
    "SELECT id FROM products WHERE identity_key=?",
    identity,
  );
  if (!product) {
    product = { id: id() };
    run(
      "INSERT INTO products (id,identity_key,title,category,variation) VALUES (?,?,?,?,?)",
      product.id,
      identity,
      data.title,
      data.category,
      data.variation,
    );
  }
  // Produto existente só muda por esta edição explícita; aprovações relacionadas são invalidadas.
  else {
    run(
      "UPDATE products SET title=?,category=? WHERE id=?",
      data.title,
      data.category,
      product.id,
    );
    run(
      "UPDATE offers SET status='draft',updated_at=?,version=version+1 WHERE listing_id IN (SELECT id FROM listings WHERE product_id=?)",
      timestamp,
      product.id,
    );
  }
  let listing = one<{ id: string }>(
    "SELECT id FROM listings WHERE platform=? AND platform_listing_id=? AND seller_id=? AND product_id=?",
    data.platform,
    data.platform_listing_id,
    data.seller_id,
    product.id,
  );
  if (!listing) {
    listing = { id: id() };
    run(
      "INSERT INTO listings (id,platform,platform_listing_id,product_id,seller_id,url,image_url,price_cents,reference_cents,reference_source,shipping_cents,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      listing.id,
      data.platform,
      data.platform_listing_id,
      product.id,
      data.seller_id,
      data.url,
      data.image_url || null,
      data.price_cents,
      data.reference_cents,
      data.reference_source || null,
      data.shipping_cents,
      timestamp,
    );
  } else {
    run(
      "UPDATE listings SET url=?,image_url=?,price_cents=?,reference_cents=?,reference_source=?,shipping_cents=?,checked_at=? WHERE id=?",
      data.url,
      data.image_url || null,
      data.price_cents,
      data.reference_cents,
      data.reference_source || null,
      data.shipping_cents,
      timestamp,
      listing.id,
    );
    run(
      "UPDATE offers SET status='draft',updated_at=?,version=version+1 WHERE listing_id=?",
      timestamp,
      listing.id,
    );
  }
  // Janela UTC de 24h: identidade, vendedor e variação não se repetem no mesmo dia.
  const fingerprint = [
    identity,
    data.seller_id,
    existing ? existing.created_at.slice(0, 10) : timestamp.slice(0, 10),
  ].join("|");
  if (existing) {
    run(
      "UPDATE offers SET listing_id=?,coupon_id=?,status=?,fingerprint=?,updated_at=?,version=version+1,demo=? WHERE id=?",
      listing.id,
      data.coupon_id,
      "draft",
      fingerprint,
      timestamp,
      +demo,
      key,
    );
    run("DELETE FROM offer_groups WHERE offer_id=?", key);
  } else
    run(
      "INSERT INTO offers (id,listing_id,coupon_id,status,fingerprint,created_by,demo,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      key,
      listing.id,
      data.coupon_id,
      "draft",
      fingerprint,
      user.id,
      +demo,
      timestamp,
      timestamp,
    );
  for (const group of [...new Set(data.group_ids)])
    run("INSERT INTO offer_groups VALUES (?,?)", key, group);
  run("DELETE FROM affiliate_links WHERE listing_id=?", listing.id);
  if (data.affiliate_url)
    run(
      "INSERT INTO affiliate_links VALUES (?,?,?,?,?,?,?,?,?)",
      id(),
      listing.id,
      data.seller_id,
      data.platform,
      data.affiliate_url,
      "Colado manualmente pelo operador",
      "unverified",
      user.id,
      timestamp,
    );
  run(
    "INSERT INTO price_observations VALUES (?,?,?,?,?,?,?)",
    id(),
    listing.id,
    data.price_cents,
    data.shipping_cents,
    "Cadastro/conferência manual",
    "manual",
    timestamp,
  );
  audit(
    user.id,
    existing ? "updated" : "created",
    "offer",
    key,
    data as unknown as Row,
  );
}

export function seedDemo(user: User) {
  return transaction(() => {
    if (one("SELECT id FROM offers WHERE demo=1"))
      throw new AppError("Os exemplos já foram carregados.", 409);
    const sellerId = saveSeller(
      user,
      {
        platform: "mercado_livre",
        platform_seller_id: "EXEMPLO-LOJA-01",
        name: "Loja Aurora • Exemplo",
        reputation: "excellent",
        official: false,
        authenticity: "unknown",
        trust_status: "review",
        evidence: "Dados fictícios para demonstrar o fluxo.",
      },
      undefined,
      true,
    );
    const groupId = saveGroup(
      user,
      {
        name: "Achadinhos do dia • Exemplo",
        category: "geral",
        description: "Grupo demonstrativo. Não conectado ao WhatsApp.",
      },
      undefined,
      true,
    );
    const couponId = saveCoupon(
      user,
      {
        code: "EXEMPLO30",
        platform: "mercado_livre",
        type: "percent",
        value: 30,
        cap_cents: 6000,
        minimum_cents: 10000,
        starts_at: new Date(Date.now() - 3600000).toISOString(),
        ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        status: "apparently_active",
        rules_reviewed: true,
        source: "Exemplo fictício criado pelo aplicativo",
        categories: ["casa"],
        unknown_conditions: [],
      },
      undefined,
      true,
    );
    const products = [
      {
        title: "Cafeteira compacta para o seu café de todo dia",
        category: "casa",
        price: 30000,
        reference: 39900,
        coupon: couponId,
      },
      {
        title: "Fone sem fio com estojo de recarga",
        category: "eletronicos",
        price: 14990,
        reference: 19990,
        coupon: null,
      },
      {
        title: "Kit de ferramentas para pequenos reparos",
        category: "ferramentas",
        price: 8990,
        reference: 12990,
        coupon: null,
      },
    ];
    for (const [i, p] of products.entries())
      saveOffer(
        user,
        {
          title: p.title,
          category: p.category,
          platform: "mercado_livre",
          platform_listing_id: `EXEMPLO-${i + 1}`,
          seller_id: sellerId,
          url: "https://www.mercadolivre.com.br/",
          price_cents: p.price,
          reference_cents: p.reference,
          reference_source: "Valor fictício, apenas demonstração",
          coupon_id: p.coupon,
          group_ids: [groupId],
        },
        undefined,
        true,
      );
    audit(user.id, "demo_loaded", "system", null);
  });
}
