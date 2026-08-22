import { buildCanonicalProductId, CatalogQueryParams, CatalogQueryResult, MasterProduct } from "./types";
import { calculatePagination, DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "./catalogQuery";

export interface IMasterCatalogRepository {
  findById(id: string): Promise<MasterProduct | null>;
  findByCanonicalKey(
    source: string,
    sourceStoreId: string | null | undefined,
    externalProductId: string
  ): Promise<MasterProduct | null>;
  upsert(product: MasterProduct): Promise<MasterProduct>;
  listBySource(source: string, sourceStoreId?: string): Promise<MasterProduct[]>;
  query(params: CatalogQueryParams): Promise<CatalogQueryResult>;
  count(): Promise<number>;
  countBySourceStore(source: string, sourceStoreId: string): Promise<number>;
  clear(): Promise<void>;
}

export class MemoryMasterCatalogRepository implements IMasterCatalogRepository {
  private readonly storage = new Map<string, MasterProduct>();

  async findById(id: string): Promise<MasterProduct | null> {
    const item = this.storage.get(id);
    return item ? { ...item } : null;
  }

  async findByCanonicalKey(
    source: string,
    sourceStoreId: string | null | undefined,
    externalProductId: string
  ): Promise<MasterProduct | null> {
    const id = buildCanonicalProductId(source, sourceStoreId, externalProductId);
    return this.findById(id);
  }

  async upsert(product: MasterProduct): Promise<MasterProduct> {
    const cloned = { ...product };
    this.storage.set(cloned.id, cloned);
    return { ...cloned };
  }

  async listBySource(source: string, sourceStoreId?: string): Promise<MasterProduct[]> {
    const cleanSource = source.trim().toLowerCase();
    const result: MasterProduct[] = [];

    for (const item of this.storage.values()) {
      if (item.source.toLowerCase() === cleanSource) {
        if (!sourceStoreId || item.sourceStoreId === sourceStoreId) {
          result.push({ ...item });
        }
      }
    }

    return result;
  }

  async query(params: CatalogQueryParams): Promise<CatalogQueryResult> {
    let items = Array.from(this.storage.values());

    if (params.source) {
      const q = params.source.toLowerCase();
      items = items.filter((p) => p.source.toLowerCase() === q);
    }
    if (params.sourceStoreId) {
      items = items.filter((p) => p.sourceStoreId === params.sourceStoreId);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      items = items.filter((p) => p.title.toLowerCase().includes(q));
    }
    if (params.category) {
      const q = params.category.toLowerCase();
      items = items.filter((p) => (p.category || "").toLowerCase().includes(q));
    }
    if (params.seller) {
      const q = params.seller.toLowerCase();
      items = items.filter((p) => (p.sellerName || "").toLowerCase().includes(q));
    }
    if (params.minPrice !== undefined) {
      items = items.filter((p) => p.price !== null && p.price >= params.minPrice!);
    }
    if (params.maxPrice !== undefined) {
      items = items.filter((p) => p.price !== null && p.price <= params.maxPrice!);
    }

    const sort = params.sort || "updated_at";
    const order = params.order || "desc";

    items.sort((a, b) => {
      let valA: any = a.updatedAt;
      let valB: any = b.updatedAt;

      if (sort === "created_at") {
        valA = a.createdAt;
        valB = b.createdAt;
      } else if (sort === "price") {
        valA = a.price ?? 0;
        valB = b.price ?? 0;
      } else if (sort === "title") {
        valA = a.title.toLowerCase();
        valB = b.title.toLowerCase();
      }

      if (valA < valB) return order === "asc" ? -1 : 1;
      if (valA > valB) return order === "asc" ? 1 : -1;
      return 0;
    });

    const total = items.length;
    const page = params.page || DEFAULT_PAGE;
    const pageSize = params.pageSize || DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const pagedItems = items.slice(offset, offset + pageSize);

    return {
      items: pagedItems.map((p) => ({ ...p })),
      pagination: calculatePagination(total, page, pageSize),
    };
  }

  async count(): Promise<number> {
    return this.storage.size;
  }

  async countBySourceStore(source: string, sourceStoreId: string): Promise<number> {
    const cleanSource = source.trim().toLowerCase();
    const cleanStore = sourceStoreId.trim();
    let count = 0;
    for (const p of this.storage.values()) {
      if (p.source.toLowerCase() === cleanSource && p.sourceStoreId === cleanStore) {
        count++;
      }
    }
    return count;
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }
}

// Global master catalog repository instance
export const globalMasterCatalogRepository = new MemoryMasterCatalogRepository();
