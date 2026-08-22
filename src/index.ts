import { Env, IngestionRequest, IngestionResponse } from "./types";
import { HttpShopeeScraperClient } from "./clients/shopeeScraperClient";
import { mapShopeeScraperResponseToIngestion } from "./adapters/shopeeAdapter";
import { ShopeeCatalogImporter } from "./master-catalog/importer";
import { createCatalogStoreRepository, createMasterCatalogRepository } from "./master-catalog/repositoryFactory";
import { handleGetProductById, handleListProducts } from "./api/catalogApi";
import { handleGetStoreById, handleGetStoreProducts, handleListStores, handleRefreshStore } from "./api/storeApi";
import { handleGetStats } from "./api/statsApi";

export * from "./types";
export * from "./clients/shopeeScraperClient";
export * from "./adapters/shopeeAdapter";
export * from "./master-catalog/types";
export * from "./master-catalog/repository";
export * from "./master-catalog/storeRepository";
export * from "./master-catalog/repositoryFactory";
export * from "./master-catalog/repositories/D1MasterCatalogRepository";
export * from "./master-catalog/repositories/D1CatalogStoreRepository";
export * from "./master-catalog/catalogQuery";
export * from "./master-catalog/storeQuery";
export * from "./master-catalog/importer";
export * from "./api/catalogApi";
export * from "./api/storeApi";
export * from "./api/statsApi";

const ALLOWED_HOSTS = new Set(["shopee.com.br"]);
const MAX_PRODUCTS = 100;
const DEFAULT_PAGE_SIZE = 30;

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function isAllowedShopeeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return ALLOWED_HOSTS.has(url.hostname) || url.hostname.endsWith(".shopee.com.br");
  } catch {
    return false;
  }
}

function cleanUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  return url.toString();
}

function isAuthorized(request: Request, token?: string): boolean {
  const auth = request.headers.get("authorization") ?? "";
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

function clampPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function extractShopIdFromUrl(value: string): string | null {
  const patterns = [
    /\/shop\/(\d{4,})(?:[/?#]|$)/i,
    /(?:shopid|shop_id|shopId|shop-id)["'\s:=]+["']?(\d{4,})/i,
    /[-.]i\.(\d{4,})\./i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url);

    // 1. Healthcheck
    if (request.method === "GET" && requestUrl.pathname === "/health") {
      return json({
        ok: true,
        service: "pub-ecom-catalog-worker",
        catalogStorage: env.DB ? "d1" : "memory",
      }, { status: 200 });
    }

    // 2. Master Catalog Operations API — Stats
    if (request.method === "GET" && (requestUrl.pathname === "/v1/catalog/stats" || requestUrl.pathname === "/catalog/stats")) {
      return handleGetStats(request, env);
    }

    // 3. Master Catalog Stores API — List Stores
    if (request.method === "GET" && (requestUrl.pathname === "/v1/catalog/stores" || requestUrl.pathname === "/catalog/stores")) {
      return handleListStores(request, env);
    }

    // 4. Master Catalog Stores API — Store Products, Refresh, Get Store
    const storePrefix = "/v1/catalog/stores/";
    const legacyStorePrefix = "/catalog/stores/";
    if (requestUrl.pathname.startsWith(storePrefix) || requestUrl.pathname.startsWith(legacyStorePrefix)) {
      const rest = requestUrl.pathname.startsWith(storePrefix)
        ? requestUrl.pathname.slice(storePrefix.length)
        : requestUrl.pathname.slice(legacyStorePrefix.length);

      if (rest.endsWith("/products") && request.method === "GET") {
        const storeId = rest.slice(0, -"/products".length);
        if (storeId) return handleGetStoreProducts(request, env, storeId);
      }

      if (rest.endsWith("/refresh") && request.method === "POST") {
        const storeId = rest.slice(0, -"/refresh".length);
        if (storeId) return handleRefreshStore(request, env, storeId);
      }

      if (request.method === "GET" && rest && !rest.includes("/")) {
        return handleGetStoreById(request, env, rest);
      }
    }

    // 5. Master Catalog Products API — List Products
    if (
      request.method === "GET" &&
      (requestUrl.pathname === "/v1/catalog/products" || requestUrl.pathname === "/catalog/products")
    ) {
      return handleListProducts(request, env);
    }

    // 6. Master Catalog Products API — Get Product by Canonical ID
    const productPrefix = "/v1/catalog/products/";
    const legacyProductPrefix = "/catalog/products/";
    if (
      request.method === "GET" &&
      (requestUrl.pathname.startsWith(productPrefix) || requestUrl.pathname.startsWith(legacyProductPrefix))
    ) {
      const rawId = requestUrl.pathname.startsWith(productPrefix)
        ? requestUrl.pathname.slice(productPrefix.length)
        : requestUrl.pathname.slice(legacyProductPrefix.length);

      if (rawId && rawId.trim()) {
        return handleGetProductById(request, env, rawId);
      }
    }

    // 7. Ingestion Endpoint
    if (request.method === "POST" && requestUrl.pathname === "/ingestion/shopee") {
      if (!isAuthorized(request, env.CATALOG_WORKER_TOKEN)) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }

      let payload: IngestionRequest;
      try {
        payload = (await request.json()) as IngestionRequest;
      } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
      }

      if (!payload.url || !isAllowedShopeeUrl(payload.url)) {
        return json({ error: "Unsupported or unsafe URL" }, { status: 400 });
      }

      const cleanedSourceUrl = cleanUrl(payload.url);
      const limit = clampPositiveInt(payload.limit, DEFAULT_PAGE_SIZE, MAX_PRODUCTS);
      const shopIdFallback = extractShopIdFromUrl(cleanedSourceUrl);

      const client = new HttpShopeeScraperClient(
        env.SHOPEE_SCRAPER_TOKEN,
        env.SHOPEE_SCRAPER_URL,
        env.SHOPEE_SCRAPER_SERVICE
      );

      try {
        const scraperRes = await client.scrapeShop({
          shopUrl: cleanedSourceUrl,
          limit,
        });

        const mapped = mapShopeeScraperResponseToIngestion(scraperRes, shopIdFallback);

        // Ingest into Master Catalog (D1 in production, Memory in tests)
        const importStart = Date.now();
        const productRepo = createMasterCatalogRepository(env);
        const storeRepo = createCatalogStoreRepository(env);
        const importer = new ShopeeCatalogImporter(productRepo, storeRepo);

        const shopInfo = scraperRes.shop || {};
        const importResult = await importer.importCatalog(mapped.items, {
          requestId: scraperRes.requestId,
          provider: scraperRes.provider,
          store: {
            username: shopInfo.username ?? null,
            name: shopInfo.name ?? null,
            storeUrl: cleanedSourceUrl,
            status: "active",
            syncStatus: "success",
          },
        });

        const importDurationMs = Date.now() - importStart;
        const storageProvider = env.DB ? "d1" : "memory";

        mapped.masterCatalog = {
          ...importResult.stats,
          storageProvider,
          importDurationMs,
        };
        mapped.metadata.storageProvider = storageProvider;
        mapped.metadata.importDurationMs = importDurationMs;
        mapped.metadata.importStats = { ...importResult.stats };

        return json(mapped, { status: mapped.success ? 200 : 502 });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);

        // Record error state on store if shopId is known
        if (shopIdFallback) {
          try {
            const storeRepo = createCatalogStoreRepository(env);
            const storeId = `shopee:${shopIdFallback}`;
            const existing = await storeRepo.findById(storeId);
            const now = new Date().toISOString();
            if (existing) {
              await storeRepo.upsert({
                ...existing,
                status: "error",
                lastSyncStatus: "error",
                lastSyncError: errMsg,
                lastSyncAt: now,
                updatedAt: now,
              });
            }
          } catch {
            // ignore error updating store during scraper failure
          }
        }

        return json(
          {
            success: false,
            source: "shopee",
            shopId: shopIdFallback,
            items: [],
            metadata: {
              provider: "pub-shopee-scraper-client",
              totalFound: 0,
            },
            errors: [errMsg],
          } satisfies IngestionResponse,
          { status: 502 }
        );
      }
    }

    return json({ error: "Not Found", path: requestUrl.pathname }, { status: 404 });
  },
};
