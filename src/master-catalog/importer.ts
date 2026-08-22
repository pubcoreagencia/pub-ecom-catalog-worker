import { RawProduct } from "../types";
import { IMasterCatalogRepository, globalMasterCatalogRepository } from "./repository";
import { ICatalogStoreRepository, globalCatalogStoreRepository } from "./storeRepository";
import {
  buildCanonicalProductId,
  buildCanonicalStoreId,
  CatalogStore,
  ImportResult,
  ImportStats,
  MasterProduct,
} from "./types";

function areArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function hasProductChanged(existing: MasterProduct, incoming: RawProduct): boolean {
  if (existing.title !== incoming.title) return true;
  if (existing.price !== incoming.price) return true;
  if (existing.originalPrice !== incoming.originalPrice) return true;
  if (existing.stock !== incoming.stock) return true;
  if (existing.sku !== incoming.sku) return true;
  if (existing.category !== incoming.category) return true;
  if (existing.sellerName !== incoming.sellerName) return true;
  if (existing.sourceProductUrl !== incoming.sourceProductUrl) return true;
  if (existing.description !== incoming.description) return true;
  if (!areArraysEqual(existing.images, incoming.images)) return true;
  return false;
}

export interface ImportOptions {
  requestId?: string;
  provider?: string;
  store?: {
    username?: string | null;
    name?: string | null;
    storeUrl?: string | null;
  };
}

export class ShopeeCatalogImporter {
  private readonly productRepository: IMasterCatalogRepository;
  private readonly storeRepository: ICatalogStoreRepository;

  constructor(
    productRepository: IMasterCatalogRepository = globalMasterCatalogRepository,
    storeRepository: ICatalogStoreRepository = globalCatalogStoreRepository
  ) {
    this.productRepository = productRepository;
    this.storeRepository = storeRepository;
  }

  async importCatalog(
    items: RawProduct[],
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const now = new Date().toISOString();
    const stats: ImportStats = {
      total: items.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
    };

    const savedProducts: MasterProduct[] = [];
    const errors: string[] = [];
    let sourceStoreId: string | null = null;

    // 1. Process products
    for (const raw of items) {
      if (!raw.externalProductId || !raw.externalProductId.trim()) {
        stats.failed++;
        errors.push("Skipping item with missing externalProductId");
        continue;
      }

      if (raw.sourceStoreId && !sourceStoreId) {
        sourceStoreId = raw.sourceStoreId;
      }

      const canonicalId = buildCanonicalProductId("shopee", raw.sourceStoreId, raw.externalProductId);
      const cleanStoreId = (raw.sourceStoreId || "unknown").trim();

      try {
        const existing = await this.productRepository.findById(canonicalId);

        const metadata = {
          ...(raw.metadata || {}),
          provider: options.provider || "shopee-scraper",
          requestId: options.requestId || null,
          importedAt: now,
        };

        if (!existing) {
          // 1. Create new MasterProduct
          const newProduct: MasterProduct = {
            id: canonicalId,
            source: "shopee",
            sourceStoreId: cleanStoreId,
            externalProductId: raw.externalProductId,
            sourceProductUrl: raw.sourceProductUrl,
            title: raw.title,
            description: raw.description ?? null,
            price: raw.price,
            originalPrice: raw.originalPrice ?? null,
            stock: raw.stock ?? null,
            sku: raw.sku ?? null,
            images: Array.isArray(raw.images) ? [...raw.images] : [],
            category: raw.category ?? null,
            sellerName: raw.sellerName ?? null,
            metadata,
            firstSeenAt: now,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
          };

          const saved = await this.productRepository.upsert(newProduct);
          savedProducts.push(saved);
          stats.created++;
        } else {
          // 2. Existing MasterProduct
          const isChanged = hasProductChanged(existing, raw);

          if (isChanged) {
            const updatedProduct: MasterProduct = {
              ...existing,
              title: raw.title,
              description: raw.description ?? existing.description,
              price: raw.price,
              originalPrice: raw.originalPrice ?? existing.originalPrice,
              stock: raw.stock ?? existing.stock,
              sku: raw.sku ?? existing.sku,
              images: Array.isArray(raw.images) ? [...raw.images] : existing.images,
              category: raw.category ?? existing.category,
              sellerName: raw.sellerName ?? existing.sellerName,
              sourceProductUrl: raw.sourceProductUrl,
              metadata: {
                ...existing.metadata,
                ...metadata,
              },
              lastSeenAt: now,
              updatedAt: now,
            };

            const saved = await this.productRepository.upsert(updatedProduct);
            savedProducts.push(saved);
            stats.updated++;
          } else {
            // Unchanged: update lastSeenAt only
            const untouchedProduct: MasterProduct = {
              ...existing,
              lastSeenAt: now,
              metadata: {
                ...existing.metadata,
                lastRequestId: options.requestId || null,
                lastSeenAt: now,
              },
            };

            const saved = await this.productRepository.upsert(untouchedProduct);
            savedProducts.push(saved);
            stats.unchanged++;
          }
        }
      } catch (err) {
        stats.failed++;
        errors.push(`Failed to upsert product ${raw.externalProductId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. Process Store Entity metadata (does NOT touch syncState/syncLock)
    if (sourceStoreId) {
      try {
        const storeId = buildCanonicalStoreId("shopee", sourceStoreId);
        const existingStore = await this.storeRepository.findById(storeId);

        const storeInfo = options.store || {};
        const storeMetadata = {
          provider: options.provider || "shopee-scraper",
          lastRequestId: options.requestId || null,
        };

        if (!existingStore) {
          const newStore: CatalogStore = {
            id: storeId,
            source: "shopee",
            sourceStoreId,
            username: storeInfo.username ?? null,
            name: storeInfo.name ?? null,
            storeUrl: storeInfo.storeUrl ?? null,
            status: "active",
            productCount: savedProducts.length,
            firstSeenAt: now,
            lastSeenAt: now,
            lastSyncAt: null,
            lastSyncStatus: null,
            lastSyncError: null,
            syncState: "idle",
            syncLockUntil: null,
            syncRunId: null,
            createdAt: now,
            updatedAt: now,
            metadata: storeMetadata,
          };
          await this.storeRepository.upsert(newStore);
        } else {
          const updatedStore: CatalogStore = {
            ...existingStore,
            username: storeInfo.username ?? existingStore.username,
            name: storeInfo.name ?? existingStore.name,
            storeUrl: storeInfo.storeUrl ?? existingStore.storeUrl,
            lastSeenAt: now,
            updatedAt: now,
            metadata: {
              ...existingStore.metadata,
              ...storeMetadata,
            },
          };
          await this.storeRepository.upsert(updatedStore);
        }

        // Only update product count if products were found/imported
        if (savedProducts.length > 0) {
          const scopedCount = await this.productRepository.countBySourceStore("shopee", sourceStoreId);
          await this.storeRepository.updateProductCount("shopee", sourceStoreId, scopedCount);
        }
      } catch (err) {
        errors.push(`Failed to update catalog_store for ${sourceStoreId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      success: errors.length === 0 || savedProducts.length > 0,
      source: "shopee",
      sourceStoreId,
      stats,
      products: savedProducts,
      errors,
      importedAt: now,
    };
  }
}
