import {
  buildCanonicalStoreId,
  CatalogStats,
  CatalogStore,
  StoreQueryParams,
  StoreQueryResult,
  SyncState,
} from "./types";
import {
  calculateStorePagination,
  DEFAULT_STORE_PAGE,
  DEFAULT_STORE_PAGE_SIZE,
} from "./storeQuery";

export interface ICatalogStoreRepository {
  findById(id: string): Promise<CatalogStore | null>;
  findBySourceStore(source: string, sourceStoreId: string): Promise<CatalogStore | null>;
  upsert(store: CatalogStore): Promise<CatalogStore>;
  acquireSyncLock(storeId: string, syncRunId: string, lockUntil: string): Promise<boolean>;
  releaseSyncLock(storeId: string, syncRunId: string): Promise<boolean>;
  query(params: StoreQueryParams): Promise<StoreQueryResult>;
  updateProductCount(source: string, sourceStoreId: string, count?: number): Promise<void>;
  getStats(productCount?: number): Promise<CatalogStats>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

export class MemoryCatalogStoreRepository implements ICatalogStoreRepository {
  private readonly storage = new Map<string, CatalogStore>();

  async findById(id: string): Promise<CatalogStore | null> {
    const item = this.storage.get(id);
    return item ? { ...item } : null;
  }

  async findBySourceStore(source: string, sourceStoreId: string): Promise<CatalogStore | null> {
    const id = buildCanonicalStoreId(source, sourceStoreId);
    return this.findById(id);
  }

  async upsert(store: CatalogStore): Promise<CatalogStore> {
    const cloned = { ...store };
    this.storage.set(cloned.id, cloned);
    return { ...cloned };
  }

  async acquireSyncLock(storeId: string, syncRunId: string, lockUntil: string): Promise<boolean> {
    const existing = this.storage.get(storeId);
    const now = new Date().toISOString();

    if (!existing) {
      // Store does not exist yet; create running lock placeholder if id is known
      const parts = storeId.split(":");
      const source = parts[0] || "shopee";
      const sourceStoreId = parts.slice(1).join(":");

      const newStore: CatalogStore = {
        id: storeId,
        source,
        sourceStoreId,
        username: null,
        name: null,
        storeUrl: null,
        status: "active",
        productCount: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        lastSyncAt: now,
        lastSyncStatus: null,
        lastSyncError: null,
        syncState: "running",
        syncLockUntil: lockUntil,
        syncRunId,
        createdAt: now,
        updatedAt: now,
        metadata: {},
      };
      this.storage.set(storeId, newStore);
      return true;
    }

    // Check if lock is active
    if (existing.syncLockUntil && existing.syncLockUntil > now) {
      return false; // locked
    }

    existing.syncState = "running";
    existing.syncLockUntil = lockUntil;
    existing.syncRunId = syncRunId;
    existing.lastSyncAt = now;
    existing.updatedAt = now;
    this.storage.set(storeId, { ...existing });
    return true;
  }

  async releaseSyncLock(storeId: string, syncRunId: string): Promise<boolean> {
    const existing = this.storage.get(storeId);
    if (!existing) return false;

    if (existing.syncRunId !== syncRunId) {
      return false; // lock was acquired by a newer execution, do not clear!
    }

    existing.syncLockUntil = null;
    existing.syncRunId = null;
    existing.updatedAt = new Date().toISOString();
    this.storage.set(storeId, { ...existing });
    return true;
  }

  async updateProductCount(source: string, sourceStoreId: string, count?: number): Promise<void> {
    const id = buildCanonicalStoreId(source, sourceStoreId);
    const existing = this.storage.get(id);
    if (existing) {
      existing.productCount = count ?? existing.productCount;
      existing.updatedAt = new Date().toISOString();
      this.storage.set(id, { ...existing });
    }
  }

  async query(params: StoreQueryParams): Promise<StoreQueryResult> {
    let items = Array.from(this.storage.values());

    if (params.source) {
      const q = params.source.toLowerCase();
      items = items.filter((s) => s.source.toLowerCase() === q);
    }

    if (params.status) {
      const q = params.status.toLowerCase();
      items = items.filter((s) => s.status.toLowerCase() === q);
    }

    if (params.search) {
      const q = params.search.toLowerCase();
      items = items.filter(
        (s) =>
          (s.username || "").toLowerCase().includes(q) ||
          (s.name || "").toLowerCase().includes(q) ||
          s.sourceStoreId.toLowerCase().includes(q)
      );
    }

    const sort = params.sort || "updated_at";
    const order = params.order || "desc";

    items.sort((a, b) => {
      let valA: any = a.updatedAt;
      let valB: any = b.updatedAt;

      if (sort === "created_at") {
        valA = a.createdAt;
        valB = b.createdAt;
      } else if (sort === "product_count") {
        valA = a.productCount;
        valB = b.productCount;
      } else if (sort === "name") {
        valA = (a.name || "").toLowerCase();
        valB = (b.name || "").toLowerCase();
      } else if (sort === "username") {
        valA = (a.username || "").toLowerCase();
        valB = (b.username || "").toLowerCase();
      } else if (sort === "last_sync_at") {
        valA = a.lastSyncAt || "";
        valB = b.lastSyncAt || "";
      }

      if (valA < valB) return order === "asc" ? -1 : 1;
      if (valA > valB) return order === "asc" ? 1 : -1;
      return 0;
    });

    const total = items.length;
    const page = params.page || DEFAULT_STORE_PAGE;
    const pageSize = params.pageSize || DEFAULT_STORE_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const pagedItems = items.slice(offset, offset + pageSize);

    return {
      items: pagedItems.map((s) => ({ ...s })),
      pagination: calculateStorePagination(total, page, pageSize),
    };
  }

  async getStats(productCount = 0): Promise<CatalogStats> {
    const stores = Array.from(this.storage.values());
    let activeStores = 0;
    let errorStores = 0;
    const sources: Record<string, { products: number; stores: number }> = {};
    const sync: Record<SyncState, number> = {
      idle: 0,
      running: 0,
      success: 0,
      partial: 0,
      error: 0,
    };

    for (const store of stores) {
      if (store.status === "active") activeStores++;
      if (store.status === "error") errorStores++;

      const state = (store.syncState as SyncState) || "idle";
      if (sync[state] !== undefined) {
        sync[state]++;
      } else {
        sync.idle++;
      }

      const src = store.source.toLowerCase();
      if (!sources[src]) {
        sources[src] = { products: 0, stores: 0 };
      }
      sources[src].stores++;
      sources[src].products += store.productCount;
    }

    const totalProducts = Object.values(sources).reduce((acc, s) => acc + s.products, 0) || productCount;

    return {
      products: totalProducts,
      stores: stores.length,
      activeStores,
      errorStores,
      sources,
      sync,
    };
  }

  async count(): Promise<number> {
    return this.storage.size;
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }
}

// Global master store repository instance
export const globalCatalogStoreRepository = new MemoryCatalogStoreRepository();
