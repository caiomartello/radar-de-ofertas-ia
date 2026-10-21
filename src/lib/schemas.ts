import { z } from "zod";
import { categories, platforms } from "./domain";
const text = (max = 200) => z.string().trim().min(1).max(max);
const platform = z.enum(
  Object.keys(platforms) as ["mercado_livre", "amazon", "shopee", "other"],
);
export const safeUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/.test(
          url.hostname,
        )
      );
    } catch {
      return false;
    }
  }, "Use uma URL HTTPS pública, sem usuário ou senha.");
const optionalUrl = z.union([safeUrl, z.literal("")]).default("");
const cents = z.number().int().min(0).max(1000000000);
const date = z.iso.datetime({ offset: true }).nullable().default(null);
export const sellerSchema = z
  .object({
    platform,
    platform_seller_id: text(100),
    name: text(),
    reputation: z
      .enum(["unknown", "good", "excellent", "poor"])
      .default("unknown"),
    official: z.boolean().default(false),
    authenticity: z.enum(["unknown", "evidence"]).default("unknown"),
    trust_status: z.enum(["review", "trusted", "blocked"]).default("review"),
    evidence: z.string().trim().max(4000).default(""),
  })
  .refine(
    (v) => v.authenticity !== "evidence" || v.evidence.length >= 10,
    "Descreva a evidência de autenticidade.",
  )
  .refine(
    (v) => v.trust_status !== "blocked" || v.evidence.length >= 10,
    "Descreva o motivo do bloqueio.",
  );
export const groupSchema = z.object({
  name: text(100),
  channel: z.enum(["whatsapp", "telegram"]).default("whatsapp"),
  category: z.enum(categories).default("geral"),
  description: z.string().max(1000).default(""),
  audience: z.string().max(500).default(""),
  active: z.boolean().default(true),
});
export const couponSchema = z
  .object({
    code: text(32).transform((s) => s.toUpperCase()),
    platform,
    type: z.enum(["percent", "fixed"]),
    value: z.number().positive().max(1000000000),
    cap_cents: cents.nullable().default(null),
    minimum_cents: cents.default(0),
    starts_at: date,
    ends_at: date,
    status: z
      .enum([
        "unknown",
        "announced",
        "apparently_active",
        "expired",
        "exhausted",
        "invalid",
      ])
      .default("unknown"),
    rules_reviewed: z.boolean().default(false),
    source: text(1000),
    original_text: z.string().max(20000).default(""),
    categories: z.array(z.enum(categories)).max(20).default([]),
    seller_ids: z.array(text(100)).max(100).default([]),
    excluded_seller_ids: z.array(text(100)).max(100).default([]),
    official_only: z.boolean().default(false),
    payment: z.string().max(200).default(""),
    audience: z.string().max(500).default(""),
    unknown_conditions: z.array(text(500)).max(30).default([]),
  })
  .refine(
    (v) => v.type !== "percent" || v.value <= 100,
    "Percentual deve ser no máximo 100%.",
  )
  .refine(
    (v) => v.type !== "fixed" || Number.isInteger(v.value),
    "Valor fixo deve estar em centavos.",
  )
  .refine(
    (v) => !v.starts_at || !v.ends_at || v.starts_at < v.ends_at,
    "O fim deve ser posterior ao início.",
  );
export const offerSchema = z
  .object({
    title: text(300),
    category: z.enum(categories),
    variation: z.string().max(200).default(""),
    platform,
    platform_listing_id: text(100),
    seller_id: text(100),
    url: safeUrl,
    image_url: optionalUrl,
    price_cents: cents.refine((v) => v > 0, "Preço deve ser positivo."),
    reference_cents: cents.nullable().default(null),
    reference_source: z.string().max(1000).default(""),
    shipping_cents: cents.nullable().default(null),
    coupon_id: z.string().nullable().default(null),
    group_ids: z.array(text(100)).max(100).default([]),
    affiliate_url: optionalUrl,
  })
  .refine(
    (v) => !v.reference_cents || v.reference_source.trim().length >= 3,
    "Informe a origem do preço de referência.",
  );
export const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const inviteSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  name: text(100),
});
export const acceptSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12).max(128),
});
export type OfferInput = z.infer<typeof offerSchema>;
export type CouponInput = z.infer<typeof couponSchema>;
