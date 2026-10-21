CREATE TABLE meli_oauth_config (
 id INTEGER PRIMARY KEY CHECK(id=1), client_id TEXT NOT NULL,
 client_secret_ciphertext TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
CREATE TABLE meli_oauth_states (
 state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, session_hash TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id), config_revision INTEGER NOT NULL,
 redirect_uri TEXT NOT NULL, verifier_ciphertext TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX meli_oauth_states_expiry ON meli_oauth_states(expires_at);
ALTER TABLE integrations ADD COLUMN refresh_ciphertext TEXT;
ALTER TABLE integrations ADD COLUMN token_expires_at TEXT;
ALTER TABLE integrations ADD COLUMN oauth_user_id TEXT;
ALTER TABLE integrations ADD COLUMN oauth_client_id TEXT;
ALTER TABLE integrations ADD COLUMN oauth_scope TEXT;
ALTER TABLE integrations ADD COLUMN token_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integrations ADD COLUMN refresh_lease_owner TEXT;
ALTER TABLE integrations ADD COLUMN refresh_lease_until TEXT;
ALTER TABLE integrations ADD COLUMN oauth_error TEXT;
