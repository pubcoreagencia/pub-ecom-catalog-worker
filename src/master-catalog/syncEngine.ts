import { Env, RawProduct, ShopeeScraperResponse, SyncResult } from "../types";
import { HttpShopeeScraperClient } from "../clients/shopeeScraperClient";
import { mapShopeeScraperResponseToIngestion } from "../adapters/shopeeAdapter";
import { ShopeeCatalogImporter } from "./importer";
import { createCatalogStoreRepository, createMasterCatalogRepository } from "./repositoryFactory";
import { buildCanonicalStoreId, CatalogStore, StoreStatus, StoreSyncStatus, SyncState } from "./types";

export interface SyncStoreOptions {
  storeId?: string;
  source?: "shopee";
  shopUrl?: string;
  shopUsername?: string;
  sourceStoreId?: string;
  limit?: number;
  env: Env;
  client?: HttpShopeeScraperClient;
}

export class StoreSyncConflictError extends Error {
  readonly status = 409;
  readonly storeId: string;
  readonly syncRunId: string | null;

  constructor(storeId: string, syncRunId: string | null) {
    super(`Store sync already running for ${storeId}`);
    this.name = "StoreSyncConflictError";
    this.storeId = storeId;
    this.syncRunId = syncRunId;
  }
}

export async function syncStore(options: SyncStoreOptions): Promise<SyncResult> {
  const { env, limit = 30 } = options;
  const storeRepo = createCatalogStoreRepository(env);
  const productRepo = createMasterCatalogRepository(env);
  const importer = new ShopeeCatalogImporter(productRepo, storeRepo);

  const client =
    options.client ||
    new HttpShopeeScraperClient(
      env.SHOPEE_SCRAPER_TOKEN,
      env.SHOPEE_SCRAPER_URL,
      env.SHOPEE_SCRAPER_SERVICE
    );

  // 1. Identify Store
  let resolvedSource = options.source || "shopee";
  let resolvedStoreId = options.sourceStoreId;
  let resolvedUrl = options.shopUrl;
  let resolvedUsername = options.shopUsername;
  let canonicalId = options.storeId;

  if (canonicalId) {
    const parts = canonicalId.split(":");
    if (parts.length >= 2) {
      resolvedSource = (parts[0] as "shopee") || "shopee";
      resolvedStoreId = parts.slice(1).join(":");
    }
  }

  let store: CatalogStore | null = null;
  if (canonicalId) {
    store = await storeRepo.findById(canonicalId);
  } else if (resolvedStoreId) {
    canonicalId = buildCanonicalStoreId(resolvedSource, resolvedStoreId);
    store = await storeRepo.findById(canonicalId);
  }

  const now = new Date().toISOString();

  // If store doesn't exist yet, build initial instance
  if (!store) {
    const tempStoreId = resolvedStoreId || "unknown";
    canonicalId = canonicalId || buildCanonicalStoreId(resolvedSource, tempStoreId);
    store = {
      id: canonicalId,
      source: resolvedSource,
      sourceStoreId: tempStoreId,
      username: resolvedUsername ?? null,
      name: null,
      storeUrl: resolvedUrl ?? null,
      status: "active",
      productCount: 0,
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
      metadata: {},
    };
  }

  // 2. Concurrency Lock Check (TTL: 10 minutes)
  if (store.syncLockUntil) {
    const lockExpiry = new Date(store.syncLockUntil).getTime();
    if (lockExpiry > Date.now()) {
      throw new StoreSyncConflictError(store.id, store.syncRunId);
    }
  }

  // 3. Acquire Lock
  const syncRunId = crypto.randomUUID();
  const syncLockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  store.syncState = "running";
  store.syncRunId = syncRunId;
  store.syncLockUntil = syncLockUntil;
  store.lastSyncAt = now;
  store.updatedAt = now;
  store = await storeRepo.upsert(store);

  const startMs = Date.now();
  let scraperRes: ShopeeScraperResponse | null = null;
  let syncError: string | null = null;

  try {
    // 4. Call pub-shopee-scraper
    scraperRes = await client.scrapeShop({
      shopUrl: store.storeUrl || resolvedUrl,
      shopUsername: store.username || resolvedUsername,
      shopId: store.sourceStoreId !== "unknown" ? store.sourceStoreId : resolvedStoreId,
      limit,
    });

    const fallbackStoreId = store.sourceStoreId !== "unknown" ? store.sourceStoreId : null;
    const mapped = mapShopeeScraperResponseToIngestion(scraperRes, fallbackStoreId);

    const actualShopId = scraperRes.shop?.shopId || mapped.shopId || store.sourceStoreId;
    if (actualShopId && actualShopId !== "unknown") {
      store.sourceStoreId = actualShopId;
      store.id = buildCanonicalStoreId(store.source, actualShopId);
    }

    if (scraperRes.shop?.username) {
      store.username = scraperRes.shop.username;
    }
    if (scraperRes.shop?.name) {
      store.name = scraperRes.shop.name;
    }

    // 5. Ingest into Master Catalog
    const importResult = await importer.importCatalog(mapped.items, {
      requestId: syncRunId,
      provider: scraperRes.provider || "shopee-scraper",
      store: {
        username: store.username,
        name: store.name,
        storeUrl: store.storeUrl,
        status: "active",
        syncStatus: "success",
      },
    });

    const isPartial = importResult.stats.failed > 0 && (importResult.stats.created + importResult.stats.updated + importResult.stats.unchanged > 0);
    const syncState: SyncState = isPartial ? "partial" : "success";
    const lastSyncStatus: StoreSyncStatus = isPartial ? "partial" : "success";

    store.syncState = syncState;
    store.lastSyncStatus = lastSyncStatus;
    store.lastSyncError = null;
    store.status = "active";
    store.lastSeenAt = new Date().toISOString();

    const count = await productRepo.count();
    store.productCount = count;

    const durationMs = Date.now() - startMs;

    return {
      success: true,
      store: { ...store, syncLockUntil: null, syncRunId: null },
      sync: {
        syncRunId,
        provider: scraperRes.provider || "shopee-scraper",
        productsFound: mapped.items.length,
        created: importResult.stats.created,
        updated: importResult.stats.updated,
        unchanged: importResult.stats.unchanged,
        failed: importResult.stats.failed,
        durationMs,
      },
    };
  } catch (err) {
    syncError = err instanceof Error ? err.message : String(err);
    store.syncState = "error";
    store.lastSyncStatus = "error";
    store.lastSyncError = syncError;
    store.status = "error";

    const durationMs = Date.now() - startMs;

    return {
      success: false,
      store: { ...store, syncLockUntil: null, syncRunId: null },
      sync: {
        syncRunId,
        provider: scraperRes?.provider || "shopee-scraper",
        productsFound: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        failed: 0,
        durationMs,
      },
      error: syncError,
    };
  } finally {
    // 6. Release Lock in Finally
    store.syncLockUntil = null;
    store.syncRunId = null;
    store.updatedAt = new Date().toISOString();
    store = await storeRepo.upsert(store);
  }
}
