import { all, one, run, id, now, transaction, audit } from "./db";
import { type User, AppError } from "./auth";
import { type MeliItem, type MeliSeller } from "./mercado-livre";

export function markMeliReview(
  itemId: string,
  sellerId: number,
  reason: string,
  user: User,
  unavailable?: MeliItem,
) {
  transaction(() => {
    const affected = all<{ id: string; listing_id: string }>(
      "SELECT o.id,o.listing_id FROM offers o JOIN listings l ON l.id=o.listing_id JOIN sellers s ON s.id=l.seller_id WHERE o.demo=0 AND l.platform='mercado_livre' AND l.platform_listing_id=? AND s.platform_seller_id=?",
      itemId,
      String(sellerId),
    );
    for (const offer of affected) {
      run(
        "UPDATE offers SET status='draft',version=version+1,updated_at=? WHERE id=?",
        now(),
        offer.id,
      );
      if (unavailable)
        run(
          "UPDATE listings SET availability_status=?,stock_quantity=?,checked_at=?,source='API oficial Mercado Livre',confidence='api' WHERE id=?",
          unavailable.status,
          unavailable.available_quantity ?? null,
          now(),
          offer.listing_id,
        );
      const message = "Revisão exigida pela API: " + reason;
      if (
        !one(
          "SELECT id FROM alerts WHERE offer_id=? AND message=? AND dismissed_at IS NULL",
          offer.id,
          message,
        )
      )
        run(
          "INSERT INTO alerts VALUES (?,?,?,?,NULL)",
          id(),
          offer.id,
          message,
          now(),
        );
      audit(user.id, "api_review_required", "offer", offer.id, {
        reason,
        item_id: itemId,
      });
    }
  });
}

export function importMeliItem(item: MeliItem, seller: MeliSeller, user: User) {
  if (item.seller_id !== seller.id) throw new AppError("Vendedor divergente.");
  return transaction(() => {
    const timestamp = now(),
      platformSellerId = String(seller.id);
    const reputation =
      seller.seller_reputation?.level_id === "5_green"
        ? "excellent"
        : seller.seller_reputation?.level_id === "4_light_green"
          ? "good"
          : seller.seller_reputation?.level_id &&
              ["1_red", "2_orange"].includes(seller.seller_reputation.level_id)
            ? "poor"
            : "unknown";
    const metrics = JSON.stringify({
      source: "API oficial Mercado Livre",
      level_id: seller.seller_reputation?.level_id ?? null,
      power_seller_status:
        seller.seller_reputation?.power_seller_status ?? null,
      transactions: seller.seller_reputation?.transactions ?? null,
      registration_date: seller.registration_date ?? null,
      originality: "Não comprovada pela reputação",
    });
    let currentSeller = one<{
      id: string;
      demo: number;
      name: string;
      reputation: string;
    }>(
      "SELECT id,demo,name,reputation FROM sellers WHERE platform=? AND platform_seller_id=?",
      "mercado_livre",
      platformSellerId,
    );
    if (currentSeller?.demo)
      throw new AppError(
        "Identidade de exemplo conflitou com um vendedor real; importação bloqueada.",
      );
    if (!currentSeller) {
      currentSeller = { id: id(), demo: 0, name: seller.nickname, reputation };
      run(
        "INSERT INTO sellers(id,platform,platform_seller_id,name,reputation,official,authenticity,trust_status,evidence,demo,api_metrics,api_checked_at) VALUES (?,?,?,?,?,0,?,?,?,?,?,?)",
        currentSeller.id,
        "mercado_livre",
        platformSellerId,
        seller.nickname,
        reputation,
        "unknown",
        "review",
        "Dados obtidos da API. Autenticidade não verificada.",
        0,
        metrics,
        timestamp,
      );
    } else {
      const changed =
        currentSeller.name !== seller.nickname ||
        currentSeller.reputation !== reputation;
      // Listas confiáveis/bloqueadas e evidências humanas não são sobrescritas.
      run(
        "UPDATE sellers SET name=?,reputation=?,api_metrics=?,api_checked_at=? WHERE id=?",
        seller.nickname,
        reputation,
        metrics,
        timestamp,
        currentSeller.id,
      );
      if (changed)
        run(
          "UPDATE offers SET status='draft',version=version+1,updated_at=? WHERE listing_id IN(SELECT id FROM listings WHERE seller_id=?)",
          timestamp,
          currentSeller.id,
        );
    }
    const identity = `mercado_livre|${item.id}|`;
    let product = one<{ id: string }>(
      "SELECT id FROM products WHERE identity_key=?",
      identity,
    );
    if (!product) {
      product = { id: id() };
      run(
        "INSERT INTO products(id,identity_key,title,category,variation) VALUES (?,?,?,'geral','')",
        product.id,
        identity,
        item.title,
      );
    }
    run("UPDATE products SET title=? WHERE id=?", item.title, product.id);
    // Categorias de interesse/keyword não são tratadas como classificação comprovada do produto.
    const price = Math.round(item.price * 100),
      reference =
        item.original_price && item.original_price > item.price
          ? Math.round(item.original_price * 100)
          : null;
    const referenceSource = reference
      ? `Preço original anunciado pela API Mercado Livre (${timestamp}); não comprova preço habitual`
      : null;
    const metadata = JSON.stringify({
      source: "API oficial Mercado Livre",
      item_id: item.id,
      seller_id: item.seller_id,
      category_id: item.category_id ?? null,
      catalog_product_id: item.catalog_product_id ?? null,
      sold_quantity: item.sold_quantity ?? null,
      official_store_id: item.official_store_id ?? null,
      reference_kind: reference ? "platform_original_price" : null,
      collected_at: timestamp,
      original_price_cents: reference,
      title: item.title,
      permalink: item.permalink,
    });
    let listing = one<{
      id: string;
      price_cents: number;
      stock_quantity: number | null;
      api_metadata: string | null;
    }>(
      "SELECT id,price_cents,stock_quantity,api_metadata FROM listings WHERE platform=? AND platform_listing_id=? AND seller_id=? AND product_id=?",
      "mercado_livre",
      item.id,
      currentSeller.id,
      product.id,
    );
    const otherListings = all<{ offer_id: string; seller_id: string }>(
      "SELECT o.id offer_id,l.seller_id FROM listings l JOIN offers o ON o.listing_id=l.id WHERE l.platform='mercado_livre' AND l.platform_listing_id=? AND l.seller_id<>? AND o.demo=0",
      item.id,
      currentSeller.id,
    );
    for (const other of otherListings) {
      if (
        !one(
          "SELECT id FROM alerts WHERE offer_id=? AND dismissed_at IS NULL",
          other.offer_id,
        )
      )
        run(
          "INSERT INTO alerts VALUES (?,?,?,?,NULL)",
          id(),
          other.offer_id,
          `A API retornou outro vendedor para ${item.id}: ID ${platformSellerId}. O vendedor anterior foi preservado; confira o anúncio.`,
          timestamp,
        );
      run(
        "UPDATE offers SET status='draft',version=version+1,updated_at=? WHERE id=?",
        timestamp,
        other.offer_id,
      );
    }
    if (!listing) {
      listing = {
        id: id(),
        price_cents: price,
        stock_quantity: item.available_quantity ?? null,
        api_metadata: metadata,
      };
      run(
        "INSERT INTO listings(id,platform,platform_listing_id,product_id,seller_id,url,image_url,price_cents,reference_cents,reference_source,checked_at,source,confidence,api_metadata,stock_quantity,availability_status) VALUES (?,'mercado_livre',?,?,?,?,?,?,?,?,?,'API oficial Mercado Livre','api',?,?,'active')",
        listing.id,
        item.id,
        product.id,
        currentSeller.id,
        item.permalink,
        item.secure_thumbnail || null,
        price,
        reference,
        referenceSource,
        timestamp,
        metadata,
        item.available_quantity ?? null,
      );
    } else {
      const prior = listing.api_metadata
        ? JSON.parse(listing.api_metadata)
        : {};
      const changed =
        listing.price_cents !== price ||
        listing.stock_quantity !== (item.available_quantity ?? null) ||
        prior.official_store_id !== (item.official_store_id ?? null) ||
        prior.original_price_cents !== reference ||
        prior.title !== item.title ||
        prior.permalink !== item.permalink;
      run(
        "UPDATE listings SET url=?,image_url=?,price_cents=?,reference_cents=?,reference_source=?,checked_at=?,source='API oficial Mercado Livre',confidence='api',api_metadata=?,stock_quantity=?,availability_status='active' WHERE id=?",
        item.permalink,
        item.secure_thumbnail || null,
        price,
        reference,
        referenceSource,
        timestamp,
        metadata,
        item.available_quantity ?? null,
        listing.id,
      );
      if (changed)
        run(
          "UPDATE offers SET status='draft',version=version+1,updated_at=? WHERE listing_id=?",
          timestamp,
          listing.id,
        );
    }
    // Reutilizar a oferta mais recente preserva cupom, grupos e link de afiliado manuais.
    let offer = one<{ id: string; demo: number }>(
      "SELECT id,demo FROM offers WHERE listing_id=? ORDER BY created_at DESC LIMIT 1",
      listing.id,
    );
    const inserted = !offer;
    if (offer?.demo)
      throw new AppError(
        "Não é permitido atualizar um exemplo com dados reais.",
      );
    if (!offer) {
      offer = { id: id(), demo: 0 };
      run(
        "INSERT INTO offers(id,listing_id,coupon_id,status,fingerprint,created_by,demo,created_at,updated_at) VALUES (?,?,NULL,'draft',?,?,0,?,?)",
        offer.id,
        listing.id,
        `${identity}|${currentSeller.id}|${timestamp.slice(0, 10)}`,
        user.id,
        timestamp,
        timestamp,
      );
    }
    run(
      "UPDATE alerts SET dismissed_at=? WHERE offer_id=? AND dismissed_at IS NULL AND message LIKE 'Revisão exigida pela API:%'",
      timestamp,
      offer.id,
    );
    run(
      "INSERT INTO price_observations VALUES (?,?,?,?,?,'api',?)",
      id(),
      listing.id,
      price,
      null,
      "API oficial Mercado Livre",
      timestamp,
    );
    audit(
      user.id,
      inserted ? "api_imported" : "api_updated",
      "offer",
      offer.id,
      {
        item_id: item.id,
        seller_id: platformSellerId,
        price_cents: price,
        source: "API oficial Mercado Livre",
      },
    );
    return { offer_id: offer.id, inserted };
  });
}
