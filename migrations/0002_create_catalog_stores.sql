-- Migration 0002: Create Catalog Stores Table and Indexes
CREATE TABLE IF NOT EXISTS catalog_stores (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_store_id TEXT NOT NULL,
  username TEXT,
  name TEXT,
  store_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  product_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_sync_at TEXT,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  CONSTRAINT uq_canonical_store UNIQUE (source, source_store_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_stores_source_store ON catalog_stores (source, source_store_id);
CREATE INDEX IF NOT EXISTS idx_catalog_stores_status ON catalog_stores (status);
CREATE INDEX IF NOT EXISTS idx_catalog_stores_last_sync_at ON catalog_stores (last_sync_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_stores_updated_at ON catalog_stores (updated_at DESC);
