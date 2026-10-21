ALTER TABLE sellers ADD COLUMN api_metrics TEXT;
ALTER TABLE sellers ADD COLUMN api_checked_at TEXT;
ALTER TABLE listings ADD COLUMN api_metadata TEXT;
ALTER TABLE listings ADD COLUMN stock_quantity INTEGER;
ALTER TABLE integrations ADD COLUMN verified_at TEXT;
ALTER TABLE integrations ADD COLUMN cooldown_until TEXT;
ALTER TABLE integrations ADD COLUMN automation_authorized INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_runs ADD COLUMN finished_at TEXT;
ALTER TABLE integration_runs ADD COLUMN job_id TEXT;
ALTER TABLE integration_runs ADD COLUMN found_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_runs ADD COLUMN imported_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_runs ADD COLUMN updated_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_runs ADD COLUMN skipped_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_runs ADD COLUMN requests_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_runs ADD COLUMN details TEXT NOT NULL DEFAULT '{}';
CREATE TABLE radar_jobs (
 id TEXT PRIMARY KEY, query TEXT NOT NULL, interval_minutes INTEGER NOT NULL DEFAULT 60 CHECK(interval_minutes>=30),
 enabled INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, next_run_at TEXT NOT NULL, last_run_at TEXT,
 lease_until TEXT, lease_owner TEXT, UNIQUE(query)
);
CREATE TABLE radar_runtime (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX radar_jobs_due ON radar_jobs(enabled,next_run_at);
UPDATE integrations SET capabilities='["manual_import","manual_affiliate_link","authenticated_search_pending_validation"]',rate_limit='Até 10 anúncios por execução; no mínimo 30 min entre buscas recorrentes; orçamento local de 120 requisições/hora.' WHERE id='mercado_livre';
