import { buildCanonicalProductId, MasterProduct } from "./types";

export interface IMasterCatalogRepository {
  findById(id: string): Promise<MasterProduct | null>;
  findByCanonicalKey(
    source: string,
    sourceStoreId: string | null | undefined,
    externalProductId: string
  ): Promise<MasterProduct | null>;
  upsert(product: MasterProduct): Promise<MasterProduct>;
  listBySource(source: string, sourceStoreId?: string): Promise<MasterProduct[]>;
  count(): Promise<number>;
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

  async count(): Promise<number> {
    return this.storage.size;
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }
}

// Global master catalog repository instance
export const globalMasterCatalogRepository = new MemoryMasterCatalogRepository();
