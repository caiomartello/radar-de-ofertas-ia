CREATE TABLE meli_oauth_handoffs (
 ticket_hash TEXT PRIMARY KEY, state_hash TEXT NOT NULL,
 params_ciphertext TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX meli_oauth_handoffs_expiry ON meli_oauth_handoffs(expires_at);
