-- Migration 0001: Create Master Products Table and Indexes
CREATE TABLE IF NOT EXISTS master_products (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_store_id TEXT NOT NULL,
  external_product_id TEXT NOT NULL,
  source_product_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price REAL,
  original_price REAL,
  stock INTEGER,
  sku TEXT,
  images TEXT NOT NULL,
  category TEXT,
  seller_name TEXT,
  metadata TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT uq_canonical_product UNIQUE (source, source_store_id, external_product_id)
);

CREATE INDEX IF NOT EXISTS idx_master_products_source_store ON master_products (source, source_store_id);
CREATE INDEX IF NOT EXISTS idx_master_products_updated_at ON master_products (updated_at DESC);
