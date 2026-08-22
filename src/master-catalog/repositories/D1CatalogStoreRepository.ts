import { ICatalogStoreRepository } from "../storeRepository";
import {
  buildCanonicalStoreId,
  CatalogStats,
  CatalogStore,
  StoreQueryParams,
  StoreQueryResult,
  StoreStatus,
  StoreSyncStatus,
} from "../types";
import {
  buildStoreSqlQuery,
  calculateStorePagination,
  DEFAULT_STORE_PAGE,
  DEFAULT_STORE_PAGE_SIZE,
} from "../storeQuery";

interface D1StoreRow {
  id: string;
  source: string;
  source_store_id: string;
  username: string | null;
  name: string | null;
  store_url: string | null;
  status: string;
  product_count: number;
  first_seen_at: string;
  last_seen_at: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
  metadata: string;
}

function mapRowToStore(row: D1StoreRow): CatalogStore {
  let parsedMetadata: Record<string, unknown> = {};
  try {
    parsedMetadata = JSON.parse(row.metadata);
    if (!parsedMetadata || typeof parsedMetadata !== "object") parsedMetadata = {};
  } catch {
    parsedMetadata = {};
  }

  return {
    id: row.id,
    source: row.source,
    sourceStoreId: row.source_store_id,
    username: row.username,
    name: row.name,
    storeUrl: row.store_url,
    status: (row.status as StoreStatus) || "active",
    productCount: Number(row.product_count) || 0,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastSyncAt: row.last_sync_at,
    lastSyncStatus: (row.last_sync_status as StoreSyncStatus) || null,
    lastSyncError: row.last_sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: parsedMetadata,
  };
}

export class D1CatalogStoreRepository implements ICatalogStoreRepository {
  readonly storageProvider = "d1" as const;
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async findById(id: string): Promise<CatalogStore | null> {
    const query = "SELECT * FROM catalog_stores WHERE id = ? LIMIT 1";
    const row = await this.db.prepare(query).bind(id).first<D1StoreRow>();
    return row ? mapRowToStore(row) : null;
  }

  async findBySourceStore(source: string, sourceStoreId: string): Promise<CatalogStore | null> {
    const id = buildCanonicalStoreId(source, sourceStoreId);
    return this.findById(id);
  }

  async upsert(store: CatalogStore): Promise<CatalogStore> {
    const metadataJson = JSON.stringify(store.metadata || {});

    const query = `
      INSERT INTO catalog_stores (
        id, source, source_store_id, username, name, store_url,
        status, product_count, first_seen_at, last_seen_at,
        last_sync_at, last_sync_status, last_sync_error,
        created_at, updated_at, metadata
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        username = coalesce(excluded.username, catalog_stores.username),
        name = coalesce(excluded.name, catalog_stores.name),
        store_url = coalesce(excluded.store_url, catalog_stores.store_url),
        status = excluded.status,
        product_count = excluded.product_count,
        last_seen_at = excluded.last_seen_at,
        last_sync_at = coalesce(excluded.last_sync_at, catalog_stores.last_sync_at),
        last_sync_status = coalesce(excluded.last_sync_status, catalog_stores.last_sync_status),
        last_sync_error = excluded.last_sync_error,
        updated_at = excluded.updated_at,
        metadata = excluded.metadata
    `;

    await this.db
      .prepare(query)
      .bind(
        store.id,
        store.source,
        store.sourceStoreId,
        store.username,
        store.name,
        store.storeUrl,
        store.status,
        store.productCount,
        store.firstSeenAt,
        store.lastSeenAt,
        store.lastSyncAt,
        store.lastSyncStatus,
        store.lastSyncError,
        store.createdAt,
        store.updatedAt,
        metadataJson
      )
      .run();

    return { ...store };
  }

  async updateProductCount(source: string, sourceStoreId: string, count?: number): Promise<void> {
    const id = buildCanonicalStoreId(source, sourceStoreId);
    const now = new Date().toISOString();

    if (count !== undefined) {
      const query = `UPDATE catalog_stores SET product_count = ?, updated_at = ? WHERE id = ?`;
      await this.db.prepare(query).bind(count, now, id).run();
      return;
    }

    // Auto-calculate from master_products in SQL
    const query = `
      UPDATE catalog_stores 
      SET product_count = (SELECT COUNT(*) FROM master_products WHERE source = ? AND source_store_id = ?),
          updated_at = ?
      WHERE id = ?
    `;
    await this.db.prepare(query).bind(source.toLowerCase(), sourceStoreId, now, id).run();
  }

  async query(params: StoreQueryParams): Promise<StoreQueryResult> {
    const plan = buildStoreSqlQuery(params);

    const countRow = await this.db.prepare(plan.countSql).bind(...plan.params).first<{ count: number }>();
    const total = countRow?.count ?? 0;

    const dataParams = [...plan.params, plan.limit, plan.offset];
    const { results } = await this.db.prepare(plan.dataSql).bind(...dataParams).all<D1StoreRow>();
    const items = Array.isArray(results) ? results.map(mapRowToStore) : [];

    const page = params.page || DEFAULT_STORE_PAGE;
    const pageSize = params.pageSize || DEFAULT_STORE_PAGE_SIZE;

    return {
      items,
      pagination: calculateStorePagination(total, page, pageSize),
    };
  }

  async getStats(): Promise<CatalogStats> {
    // 1. Total products
    const prodCountRow = await this.db.prepare("SELECT COUNT(*) as count FROM master_products").first<{ count: number }>();
    const totalProducts = prodCountRow?.count ?? 0;

    // 2. Total stores and statuses
    const storeCountRow = await this.db.prepare("SELECT COUNT(*) as count FROM catalog_stores").first<{ count: number }>();
    const totalStores = storeCountRow?.count ?? 0;

    const activeRow = await this.db.prepare("SELECT COUNT(*) as count FROM catalog_stores WHERE status = 'active'").first<{ count: number }>();
    const activeStores = activeRow?.count ?? 0;

    const errorRow = await this.db.prepare("SELECT COUNT(*) as count FROM catalog_stores WHERE status = 'error'").first<{ count: number }>();
    const errorStores = errorRow?.count ?? 0;

    // 3. Breakdown by source
    const { results: sourceRows } = await this.db
      .prepare(`
        SELECT 
          source, 
          COUNT(*) as store_count, 
          COALESCE(SUM(product_count), 0) as product_count 
        FROM catalog_stores 
        GROUP BY source
      `)
      .all<{ source: string; store_count: number; product_count: number }>();

    const sources: Record<string, { products: number; stores: number }> = {};
    if (Array.isArray(sourceRows)) {
      for (const r of sourceRows) {
        sources[r.source.toLowerCase()] = {
          products: Number(r.product_count) || 0,
          stores: Number(r.store_count) || 0,
        };
      }
    }

    if (totalProducts > 0 && Object.keys(sources).length === 0) {
      sources["shopee"] = {
        products: totalProducts,
        stores: totalStores,
      };
    }

    return {
      products: totalProducts,
      stores: totalStores,
      activeStores,
      errorStores,
      sources,
    };
  }

  async count(): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) as count FROM catalog_stores").first<{ count: number }>();
    return row?.count ?? 0;
  }

  async clear(): Promise<void> {
    await this.db.prepare("DELETE FROM catalog_stores").run();
  }
}
