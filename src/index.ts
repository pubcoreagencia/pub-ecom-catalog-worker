import { Env, IngestionRequest, IngestionResponse } from "./types";
import { HttpShopeeScraperClient } from "./clients/shopeeScraperClient";
import { mapShopeeScraperResponseToIngestion } from "./adapters/shopeeAdapter";
import { ShopeeCatalogImporter } from "./master-catalog/importer";
import { createMasterCatalogRepository } from "./master-catalog/repositoryFactory";

export * from "./types";
export * from "./clients/shopeeScraperClient";
export * from "./adapters/shopeeAdapter";
export * from "./master-catalog/types";
export * from "./master-catalog/repository";
export * from "./master-catalog/repositoryFactory";
export * from "./master-catalog/repositories/D1MasterCatalogRepository";
export * from "./master-catalog/importer";

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

function isAuthorized(request: Request, token: string): boolean {
  const auth = request.headers.get("authorization") ?? "";
  return Boolean(token) && auth === `Bearer ${token}`;
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

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      return json({ ok: true, service: "pub-ecom-catalog-worker" }, { status: 200 });
    }

    if (request.method !== "POST" || requestUrl.pathname !== "/ingestion/shopee") {
      return json({ error: "Not Found" }, { status: 404 });
    }

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
      if (mapped.items.length > 0) {
        const importStart = Date.now();
        const repository = createMasterCatalogRepository(env);
        const importer = new ShopeeCatalogImporter(repository);
        const importResult = await importer.importCatalog(mapped.items, {
          requestId: scraperRes.requestId,
          provider: scraperRes.provider,
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
      }

      return json(mapped, { status: mapped.success ? 200 : 502 });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
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
  },
};
