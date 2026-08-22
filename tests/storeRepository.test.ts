import assert from "node:assert/strict";
import test from "node:test";
import { D1CatalogStoreRepository } from "../src/master-catalog/repositories/D1CatalogStoreRepository.js";
import { CatalogStore } from "../src/master-catalog/types.js";

class MockStoreD1Database {
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
        if (sql.includes("COUNT(*) as count FROM catalog_stores WHERE status = 'active'")) {
          let count = 0;
          for (const r of self.rows.values()) if (r.status === "active") count++;
          return { count } as T;
        }
        if (sql.includes("COUNT(*) as count FROM catalog_stores WHERE status = 'error'")) {
          let count = 0;
          for (const r of self.rows.values()) if (r.status === "error") count++;
          return { count } as T;
        }
        if (sql.includes("COUNT(*) as count FROM catalog_stores")) {
          return { count: self.rows.size } as T;
        }
        if (sql.includes("COUNT(*) as count FROM master_products")) {
          return { count: 10 } as T;
        }
        if (sql.includes("SELECT * FROM catalog_stores WHERE id = ?")) {
          const id = boundParams[0];
          return (self.rows.get(id) ?? null) as T;
        }
        return null;
      },
      async all<T = any>(): Promise<{ results: T[] }> {
        if (sql.includes("SELECT * FROM catalog_stores")) {
          return { results: Array.from(self.rows.values()) as T[] };
        }
        if (sql.includes("GROUP BY source")) {
          return {
            results: [
              { source: "shopee", store_count: self.rows.size, product_count: 10 },
            ] as T[],
          };
        }
        return { results: [] };
      },
      async run() {
        if (sql.includes("INSERT INTO catalog_stores")) {
          const [
            id, source, source_store_id, username, name, store_url,
            status, product_count, first_seen_at, last_seen_at,
            last_sync_at, last_sync_status, last_sync_error,
            created_at, updated_at, metadata
          ] = boundParams;

          self.rows.set(id, {
            id, source, source_store_id, username, name, store_url,
            status, product_count, first_seen_at, last_seen_at,
            last_sync_at, last_sync_status, last_sync_error,
            created_at, updated_at, metadata,
          });
          return { success: true };
        }
        if (sql.includes("UPDATE catalog_stores SET product_count = ?")) {
          const [count, now, id] = boundParams;
          const r = self.rows.get(id);
          if (r) {
            r.product_count = count;
            r.updated_at = now;
          }
          return { success: true };
        }
        if (sql.includes("DELETE FROM catalog_stores")) {
          self.rows.clear();
          return { success: true };
        }
        return { success: true };
      },
    };

    return stmt;
  }
}

const sampleStore: CatalogStore = {
  id: "shopee:1729928484",
  source: "shopee",
  sourceStoreId: "1729928484",
  username: "9r18ht6m88",
  name: "Zentta Babuche",
  storeUrl: "https://shopee.com.br/9r18ht6m88",
  status: "active",
  productCount: 3,
  firstSeenAt: "2026-08-22T10:00:00.000Z",
  lastSeenAt: "2026-08-22T10:00:00.000Z",
  lastSyncAt: "2026-08-22T10:00:00.000Z",
  lastSyncStatus: "success",
  lastSyncError: null,
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
  metadata: { rating: 4.9 },
};

test("D1 Store Repository - upsert & findById & findBySourceStore", async () => {
  const db = new MockStoreD1Database() as unknown as D1Database;
  const repo = new D1CatalogStoreRepository(db);

  await repo.upsert(sampleStore);
  const found = await repo.findById("shopee:1729928484");
  assert.ok(found);
  assert.equal(found.id, sampleStore.id);
  assert.equal(found.username, "9r18ht6m88");
  assert.equal(found.status, "active");

  const foundBySource = await repo.findBySourceStore("shopee", "1729928484");
  assert.ok(foundBySource);
  assert.equal(foundBySource.id, sampleStore.id);
});

test("D1 Store Repository - updateProductCount & getStats & clear", async () => {
  const db = new MockStoreD1Database() as unknown as D1Database;
  const repo = new D1CatalogStoreRepository(db);

  await repo.upsert(sampleStore);
  await repo.updateProductCount("shopee", "1729928484", 10);

  const found = await repo.findById("shopee:1729928484");
  assert.equal(found?.productCount, 10);

  const stats = await repo.getStats();
  assert.equal(stats.stores, 1);
  assert.equal(stats.activeStores, 1);

  await repo.clear();
  assert.equal(await repo.count(), 0);
});
