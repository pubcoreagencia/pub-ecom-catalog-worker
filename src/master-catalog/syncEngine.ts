import { Env, RawProduct, ShopeeScraperResponse, SyncResult } from "../types";
import { HttpShopeeScraperClient } from "../clients/shopeeScraperClient";
import { mapShopeeScraperResponseToIngestion } from "../adapters/shopeeAdapter";
import { ShopeeCatalogImporter } from "./importer";
import { createCatalogStoreRepository, createMasterCatalogRepository } from "./repositoryFactory";
import { buildCanonicalStoreId, CatalogStore, StoreSyncStatus, SyncState } from "./types";

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

  constructor(storeId: string, syncRunId: string | null = null) {
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

  const syncRunId = crypto.randomUUID();
  const lockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // 1. Identify Store
  let resolvedSource = options.source || "shopee";
  let resolvedStoreId = options.sourceStoreId;
  let resolvedUrl = options.shopUrl;
  let resolvedUsername = options.shopUsername;
  let canonicalStoreId = options.storeId;

  if (canonicalStoreId) {
    const parts = canonicalStoreId.split(":");
    if (parts.length >= 2) {
      resolvedSource = (parts[0] as "shopee") || "shopee";
      resolvedStoreId = parts.slice(1).join(":");
    }
  } else if (resolvedStoreId && resolvedStoreId !== "unknown") {
    canonicalStoreId = buildCanonicalStoreId(resolvedSource, resolvedStoreId);
  }

  let lockAcquired = false;

  // 2. If canonicalStoreId is known upfront, acquire atomic lock before scrape
  if (canonicalStoreId) {
    const acquired = await storeRepo.acquireSyncLock(canonicalStoreId, syncRunId, lockUntil);
    if (!acquired) {
      const existing = await storeRepo.findById(canonicalStoreId);
      throw new StoreSyncConflictError(canonicalStoreId, existing?.syncRunId || null);
    }
    lockAcquired = true;
  }

  const startMs = Date.now();
  let scraperRes: ShopeeScraperResponse | null = null;
  let syncError: string | null = null;
  let store: CatalogStore | null = null;

  try {
    const targetStore = canonicalStoreId ? await storeRepo.findById(canonicalStoreId) : null;

    // 3. Call pub-shopee-scraper
    scraperRes = await client.scrapeShop({
      shopUrl: targetStore?.storeUrl || resolvedUrl,
      shopUsername: targetStore?.username || resolvedUsername,
      shopId: targetStore?.sourceStoreId || resolvedStoreId,
      limit,
    });

    const actualShopId = scraperRes.shop?.shopId || resolvedStoreId;
    if (!actualShopId) {
      throw new Error("Could not resolve numerical shopId from scraper response");
    }

    if (!canonicalStoreId) {
      canonicalStoreId = buildCanonicalStoreId(resolvedSource, actualShopId);
      const acquired = await storeRepo.acquireSyncLock(canonicalStoreId, syncRunId, lockUntil);
      if (!acquired) {
        const existing = await storeRepo.findById(canonicalStoreId);
        throw new StoreSyncConflictError(canonicalStoreId, existing?.syncRunId || null);
      }
      lockAcquired = true;
    }

    store = await storeRepo.findById(canonicalStoreId);
    const now = new Date().toISOString();

    if (!store) {
      store = {
        id: canonicalStoreId,
        source: resolvedSource,
        sourceStoreId: actualShopId,
        username: scraperRes.shop?.username || resolvedUsername || null,
        name: scraperRes.shop?.name || null,
        storeUrl: targetStore?.storeUrl || resolvedUrl || null,
        status: "active",
        productCount: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        lastSyncAt: now,
        lastSyncStatus: "success",
        lastSyncError: null,
        syncState: "running",
        syncLockUntil: lockUntil,
        syncRunId,
        createdAt: now,
        updatedAt: now,
        metadata: {},
      };
      store = await storeRepo.upsert(store);
    } else {
      store.username = scraperRes.shop?.username || store.username;
      store.name = scraperRes.shop?.name || store.name;
      store.storeUrl = targetStore?.storeUrl || resolvedUrl || store.storeUrl;
    }

    const mapped = mapShopeeScraperResponseToIngestion(scraperRes, actualShopId);

    // 4. Ingest into Master Catalog
    const importResult = await importer.importCatalog(mapped.items, {
      requestId: syncRunId,
      provider: scraperRes.provider || "shopee-scraper",
      store: {
        username: store.username,
        name: store.name,
        storeUrl: store.storeUrl,
      },
    });

    const isPartial = importResult.stats.failed > 0 && (importResult.stats.created + importResult.stats.updated + importResult.stats.unchanged > 0);
    const syncState: SyncState = isPartial ? "partial" : "success";
    const lastSyncStatus: StoreSyncStatus = isPartial ? "partial" : "success";

    store.syncState = syncState;
    store.lastSyncStatus = lastSyncStatus;
    store.lastSyncError = null;
    store.status = "active";
    store.lastSyncAt = new Date().toISOString();
    store.lastSeenAt = new Date().toISOString();

    // Store-scoped product count
    const scopedCount = await productRepo.countBySourceStore(store.source, store.sourceStoreId);
    if (mapped.items.length > 0) {
      store.productCount = scopedCount;
    }

    await storeRepo.upsert(store);

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

    if (canonicalStoreId) {
      store = (await storeRepo.findById(canonicalStoreId)) || store;
      if (store) {
        store.syncState = "error";
        store.lastSyncStatus = "error";
        store.lastSyncError = syncError;
        store.status = "error";
        store.lastSyncAt = new Date().toISOString();
        await storeRepo.upsert(store);
      }
    }

    const durationMs = Date.now() - startMs;

    if (err instanceof StoreSyncConflictError) {
      throw err;
    }

    return {
      success: false,
      store: store ? { ...store, syncLockUntil: null, syncRunId: null } : ({
        id: canonicalStoreId || "unknown",
        source: resolvedSource,
        sourceStoreId: resolvedStoreId || "unknown",
        username: null,
        name: null,
        storeUrl: resolvedUrl || null,
        status: "error",
        productCount: 0,
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: "error",
        lastSyncError: syncError,
        syncState: "error",
        syncLockUntil: null,
        syncRunId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      }),
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
    // 5. Atomic Release Lock in Finally
    if (lockAcquired && canonicalStoreId) {
      await storeRepo.releaseSyncLock(canonicalStoreId, syncRunId);
    }
  }
}
