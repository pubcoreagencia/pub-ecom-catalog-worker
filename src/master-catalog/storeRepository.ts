import {
  buildCanonicalStoreId,
  CatalogStats,
  CatalogStore,
  StoreQueryParams,
  StoreQueryResult,
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

    for (const store of stores) {
      if (store.status === "active") activeStores++;
      if (store.status === "error") errorStores++;

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
