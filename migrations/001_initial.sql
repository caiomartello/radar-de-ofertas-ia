CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, name TEXT NOT NULL);
INSERT OR IGNORE INTO roles VALUES ('owner','Administrador principal'),('operator','Operador');
CREATE TABLE IF NOT EXISTS permissions (id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL REFERENCES roles(id), active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS single_owner ON users(role) WHERE role='owner';
CREATE TABLE IF NOT EXISTS user_permissions (user_id TEXT REFERENCES users(id), permission TEXT REFERENCES permissions(id), allowed INTEGER NOT NULL, PRIMARY KEY(user_id,permission));
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_by TEXT NOT NULL REFERENCES users(id));
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS platforms (id TEXT PRIMARY KEY, name TEXT NOT NULL);
INSERT OR IGNORE INTO platforms VALUES ('mercado_livre','Mercado Livre'),('amazon','Amazon'),('shopee','Shopee'),('other','Outra fonte');
CREATE TABLE IF NOT EXISTS integrations (id TEXT PRIMARY KEY REFERENCES platforms(id), status TEXT NOT NULL DEFAULT 'not_configured', capabilities TEXT NOT NULL DEFAULT '["manual_import","manual_affiliate_link"]', credential_ciphertext TEXT, last_sync_at TEXT, error_message TEXT, rate_limit TEXT NOT NULL DEFAULT 'Não definido: conector automático não implementado');
INSERT OR IGNORE INTO integrations(id) SELECT id FROM platforms;
CREATE TABLE IF NOT EXISTS integration_runs (id TEXT PRIMARY KEY, integration_id TEXT REFERENCES integrations(id), status TEXT NOT NULL, started_at TEXT NOT NULL, error_message TEXT);
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'manual', url TEXT);
CREATE TABLE IF NOT EXISTS sellers (id TEXT PRIMARY KEY, platform TEXT NOT NULL REFERENCES platforms(id), platform_seller_id TEXT NOT NULL, name TEXT NOT NULL, reputation TEXT NOT NULL DEFAULT 'unknown', official INTEGER NOT NULL DEFAULT 0, authenticity TEXT NOT NULL DEFAULT 'unknown', trust_status TEXT NOT NULL DEFAULT 'review', evidence TEXT NOT NULL DEFAULT '', demo INTEGER NOT NULL DEFAULT 0, UNIQUE(platform,platform_seller_id));
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, identity_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, category TEXT NOT NULL, variation TEXT NOT NULL DEFAULT '', brand TEXT, model TEXT);
CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, platform TEXT NOT NULL REFERENCES platforms(id), platform_listing_id TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id), seller_id TEXT NOT NULL REFERENCES sellers(id), url TEXT NOT NULL, image_url TEXT, price_cents INTEGER NOT NULL CHECK(price_cents>0), reference_cents INTEGER, reference_source TEXT, shipping_cents INTEGER, checked_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'Cadastro manual', confidence TEXT NOT NULL DEFAULT 'manual', UNIQUE(platform,platform_listing_id,seller_id,product_id));
CREATE TABLE IF NOT EXISTS price_observations (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id), price_cents INTEGER NOT NULL, shipping_cents INTEGER, source TEXT NOT NULL, confidence TEXT NOT NULL, observed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS coupons (id TEXT PRIMARY KEY, code TEXT NOT NULL, platform TEXT NOT NULL REFERENCES platforms(id), type TEXT NOT NULL CHECK(type IN ('percent','fixed')), value INTEGER NOT NULL CHECK(value>0), cap_cents INTEGER, minimum_cents INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, status TEXT NOT NULL DEFAULT 'unknown', rules_reviewed INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL, original_text TEXT NOT NULL DEFAULT '', demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS coupon_rules (coupon_id TEXT PRIMARY KEY REFERENCES coupons(id), categories TEXT NOT NULL DEFAULT '[]', seller_ids TEXT NOT NULL DEFAULT '[]', excluded_seller_ids TEXT NOT NULL DEFAULT '[]', official_only INTEGER NOT NULL DEFAULT 0, payment TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '', unknown_conditions TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS coupon_sources (id TEXT PRIMARY KEY, coupon_id TEXT NOT NULL REFERENCES coupons(id), text TEXT NOT NULL, source TEXT NOT NULL, imported_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS coupon_verifications (id TEXT PRIMARY KEY, coupon_id TEXT NOT NULL REFERENCES coupons(id), user_id TEXT NOT NULL REFERENCES users(id), evidence TEXT NOT NULL, verified_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'whatsapp', category TEXT NOT NULL DEFAULT 'geral', description TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id), coupon_id TEXT REFERENCES coupons(id), status TEXT NOT NULL DEFAULT 'draft', fingerprint TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL REFERENCES users(id), demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS affiliate_links (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id), seller_id TEXT NOT NULL REFERENCES sellers(id), platform TEXT NOT NULL, url TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'Colado manualmente pelo operador', status TEXT NOT NULL DEFAULT 'unverified', created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS offer_groups (offer_id TEXT REFERENCES offers(id), group_id TEXT REFERENCES groups(id), PRIMARY KEY(offer_id,group_id));
CREATE TABLE IF NOT EXISTS message_templates (id TEXT PRIMARY KEY, group_id TEXT REFERENCES groups(id), name TEXT NOT NULL, content TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS message_drafts (id TEXT PRIMARY KEY, offer_id TEXT NOT NULL REFERENCES offers(id), group_id TEXT NOT NULL REFERENCES groups(id), content TEXT NOT NULL, style TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL, copied_at TEXT);
CREATE TABLE IF NOT EXISTS publications (id TEXT PRIMARY KEY, offer_id TEXT NOT NULL REFERENCES offers(id), group_id TEXT NOT NULL REFERENCES groups(id), draft_id TEXT NOT NULL REFERENCES message_drafts(id), content TEXT NOT NULL, declared_by TEXT NOT NULL REFERENCES users(id), declared_at TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'manual_declaration');
CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, offer_id TEXT REFERENCES offers(id), message TEXT NOT NULL, created_at TEXT NOT NULL, dismissed_at TEXT);
CREATE TABLE IF NOT EXISTS watchlists (id TEXT PRIMARY KEY, group_id TEXT REFERENCES groups(id), keyword TEXT NOT NULL, excluded INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS review_feedback (id TEXT PRIMARY KEY, offer_id TEXT NOT NULL REFERENCES offers(id), user_id TEXT NOT NULL REFERENCES users(id), decision TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS observations_listing ON price_observations(listing_id,observed_at);
CREATE INDEX IF NOT EXISTS publications_offer_group ON publications(offer_id,group_id);
