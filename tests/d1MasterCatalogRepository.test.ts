import assert from "node:assert/strict";
import test from "node:test";
import { D1MasterCatalogRepository } from "../src/master-catalog/repositories/D1MasterCatalogRepository.js";
import { MasterProduct } from "../src/master-catalog/types.js";

// Mock D1Database implementation in pure JS/TS for unit tests
class MockD1Database {
  private rows = new Map<string, any>();

  prepare(sql: string) {
    const self = this;
    let boundParams: any[] = [];

    const stmt = {
      bind(...params: any[]) {
        boundParams = params;
        return stmt;
      },
      async first<T = any>(): Promise<T | null> {
        if (sql.includes("COUNT(*)")) {
          return { count: self.rows.size } as T;
        }
        if (sql.includes("SELECT * FROM master_products WHERE id = ?")) {
          const id = boundParams[0];
          return (self.rows.get(id) ?? null) as T;
        }
        return null;
      },
      async all<T = any>(): Promise<{ results: T[] }> {
        if (sql.includes("SELECT * FROM master_products WHERE source = ?")) {
          const source = boundParams[0];
          const storeId = boundParams[1];
          const results: any[] = [];
          for (const r of self.rows.values()) {
            if (r.source === source && (!storeId || r.source_store_id === storeId)) {
              results.push(r);
            }
          }
          return { results: results as T[] };
        }
        return { results: [] };
      },
      async run() {
        if (sql.includes("INSERT INTO master_products")) {
          const [
            id, source, source_store_id, external_product_id, source_product_url,
            title, description, price, original_price, stock, sku,
            images, category, seller_name, metadata,
            first_seen_at, last_seen_at, created_at, updated_at
          ] = boundParams;

          self.rows.set(id, {
            id, source, source_store_id, external_product_id, source_product_url,
            title, description, price, original_price, stock, sku,
            images, category, seller_name, metadata,
            first_seen_at, last_seen_at, created_at, updated_at,
          });
          return { success: true };
        }
        if (sql.includes("DELETE FROM master_products")) {
          self.rows.clear();
          return { success: true };
        }
        return { success: true };
      },
    };

    return stmt;
  }
}

const sampleProduct: MasterProduct = {
  id: "shopee:1729928484:23299366739",
  source: "shopee",
  sourceStoreId: "1729928484",
  externalProductId: "23299366739",
  sourceProductUrl: "https://shopee.com.br/product/1729928484/23299366739",
  title: "Babuche Infantil EVA",
  description: "Sapato leve",
  price: 40.32,
  originalPrice: 100.8,
  stock: 50,
  sku: "BAB-01",
  images: ["https://down-br.img.susercontent.com/file/img1.jpg"],
  category: "Calçados",
  sellerName: "Zentta Babuche",
  metadata: { rating: 4.9 },
  firstSeenAt: "2026-08-22T10:00:00.000Z",
  lastSeenAt: "2026-08-22T10:00:00.000Z",
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
};

test("D1 Repository - create & findById", async () => {
  const db = new MockD1Database() as unknown as D1Database;
  const repo = new D1MasterCatalogRepository(db);

  await repo.upsert(sampleProduct);
  const found = await repo.findById("shopee:1729928484:23299366739");

  assert.ok(found);
  assert.equal(found.id, sampleProduct.id);
  assert.equal(found.title, sampleProduct.title);
  assert.equal(found.price, 40.32);
  assert.deepEqual(found.images, sampleProduct.images);
});

test("D1 Repository - findByCanonicalKey", async () => {
  const db = new MockD1Database() as unknown as D1Database;
  const repo = new D1MasterCatalogRepository(db);

  await repo.upsert(sampleProduct);
  const found = await repo.findByCanonicalKey("shopee", "1729928484", "23299366739");

  assert.ok(found);
  assert.equal(found.id, "shopee:1729928484:23299366739");
});

test("D1 Repository - listBySource & count & clear", async () => {
  const db = new MockD1Database() as unknown as D1Database;
  const repo = new D1MasterCatalogRepository(db);

  assert.equal(await repo.count(), 0);

  await repo.upsert(sampleProduct);
  assert.equal(await repo.count(), 1);

  const list = await repo.listBySource("shopee", "1729928484");
  assert.equal(list.length, 1);
  assert.equal(list[0].id, sampleProduct.id);

  await repo.clear();
  assert.equal(await repo.count(), 0);
});
