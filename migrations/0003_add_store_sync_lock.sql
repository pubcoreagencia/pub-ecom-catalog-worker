-- Migration 0003: Add store sync lock and sync state columns
ALTER TABLE catalog_stores ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE catalog_stores ADD COLUMN sync_lock_until TEXT;
ALTER TABLE catalog_stores ADD COLUMN sync_run_id TEXT;

CREATE INDEX IF NOT EXISTS idx_catalog_stores_sync_state ON catalog_stores (sync_state);
