import { acquire, connect } from "@cloudflare/playwright";

interface Env {
  BROWSER: BrowserRun;
  CATALOG_WORKER_TOKEN: string;
}

interface IngestionRequest {
  url: string;
  limit?: number;
  pageSize?: number;
}

interface RawProduct {
  source: "shopee";
  sourceStoreId: string | null;
  externalProductId: string;
  sourceProductUrl: string;
  title: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  stock: number | null;
  sku: string | null;
  images: string[];
  category: string | null;
  sellerName: string | null;
  metadata: Record<string, unknown>;
}

interface IngestionResponse {
  success: boolean;
  source: "shopee";
  shopId: string | null;
  items: RawProduct[];
  metadata: {
    pagesProcessed?: number;
    totalFound?: number;
    executionTimeMs?: number;
    provider?: string;
  };
  errors: string[];
}

const ALLOWED_HOSTS = new Set(["shopee.com.br"]);
const MAX_PRODUCTS = 100;
const MAX_PAGE_SIZE = 30;
const DEFAULT_PAGE_SIZE = 30;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

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

function extractShopId(url: string): string | null {
  const match = url.match(/\/shop\/(\d+)/i);
  return match?.[1] ?? null;
}

function clampPositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs) as unknown as number;
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function discoverShopee(sourceUrl: string, limit: number, pageSize: number, env: Env): Promise<IngestionResponse> {
  const startedAt = Date.now();
  const items: RawProduct[] = [];
  const errors: string[] = [];
  let shopId = extractShopId(sourceUrl);
  let pagesProcessed = 0;

  const { sessionId } = await acquire(env.BROWSER);
  const browser = await connect(env.BROWSER, sessionId);
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const response = await withTimeout(page.goto(sourceUrl, { waitUntil: "domcontentloaded" }), REQUEST_TIMEOUT_MS);
    if (!response) {
      throw new Error("browser navigation returned no response");
    }

    if (!shopId) {
      shopId = await page.evaluate(() => {
        const html = document.documentElement.innerHTML;
        const candidates = html.match(/shop(?:id|_id|Id)[^0-9]{0,20}(\d{4,})/i);
        return candidates?.[1] ?? null;
      });
    }

    if (!shopId) {
      throw new Error("unable to resolve Shopee ShopID from the supplied store URL");
    }

    let offset = 0;
    let hasMore = true;

    while (hasMore && items.length < limit) {
      pagesProcessed += 1;

      const endpoint = new URL("https://shopee.com.br/api/v4/search/search_items");
      endpoint.searchParams.set("by", "relevancy");
      endpoint.searchParams.set("limit", String(pageSize));
      endpoint.searchParams.set("match_id", shopId);
      endpoint.searchParams.set("newest", String(offset));
      endpoint.searchParams.set("order", "desc");
      endpoint.searchParams.set("page_type", "shop");
      endpoint.searchParams.set("scenario", "PAGE_SHOP");
      endpoint.searchParams.set("version", "2");

      const payload = await withRetry(() =>
        withTimeout(
          page.evaluate(async (apiUrl) => {
            const response = await fetch(apiUrl, { credentials: "include" });
            const text = await response.text();
            return { status: response.status, text };
          }, endpoint.toString()),
          REQUEST_TIMEOUT_MS,
        ),
      );

      if (payload.status >= 400) {
        throw new Error(`Shopee returned HTTP ${payload.status} for search_items`);
      }

      const data = JSON.parse(payload.text) as {
        items?: Array<{ item_basic?: Record<string, unknown> }>;
        total_count?: number;
      };

      const pageItems = data.items ?? [];
      if (pageItems.length === 0) {
        hasMore = false;
        break;
      }

      for (const raw of pageItems) {
        const basic = raw.item_basic;
        if (!basic) continue;

        const externalProductId = String(basic.itemid ?? "");
        if (!externalProductId) continue;

        const priceRaw = Number(basic.price);
        const originalPriceRaw = Number(basic.price_before_discount);

        items.push({
          source: "shopee",
          sourceStoreId: shopId,
          externalProductId,
          sourceProductUrl: `https://shopee.com.br/product/${shopId}/${externalProductId}`,
          title: String(basic.name ?? ""),
          description: null,
          price: Number.isFinite(priceRaw) ? priceRaw / 100_000 : null,
          originalPrice: Number.isFinite(originalPriceRaw) ? originalPriceRaw / 100_000 : null,
          stock: Number.isFinite(Number(basic.stock)) ? Number(basic.stock) : null,
          sku: typeof basic.item_sku === "string" && basic.item_sku.trim() ? basic.item_sku : null,
          images: Array.isArray(basic.images) ? basic.images.filter((image): image is string => typeof image === "string") : [],
          category: typeof basic.category === "string" ? basic.category : null,
          sellerName: typeof basic.shop_name === "string" ? basic.shop_name : null,
          metadata: { rawId: basic.itemid, shopId },
        });

        if (items.length >= limit) break;
      }

      offset += pageItems.length;
      hasMore = pageItems.length >= pageSize && items.length < limit && Number(data.total_count ?? 0) > offset;
    }

    return {
      success: true,
      source: "shopee",
      shopId,
      items,
      metadata: {
        pagesProcessed,
        totalFound: items.length,
        executionTimeMs: Date.now() - startedAt,
        provider: "cloudflare-browser-run",
      },
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return {
      success: false,
      source: "shopee",
      shopId,
      items,
      metadata: {
        pagesProcessed,
        totalFound: items.length,
        executionTimeMs: Date.now() - startedAt,
        provider: "cloudflare-browser-run",
      },
      errors,
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
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
    const limit = clampPositiveInt(payload.limit, MAX_PRODUCTS, MAX_PRODUCTS);
    const pageSize = clampPositiveInt(payload.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    try {
      const result = await discoverShopee(cleanedSourceUrl, limit, pageSize, env);
      return json(result, { status: result.success ? 200 : 502 });
    } catch (error) {
      return json(
        {
          success: false,
          source: "shopee",
          shopId: null,
          items: [],
          metadata: { provider: "cloudflare-browser-run" },
          errors: [error instanceof Error ? error.message : String(error)],
        } satisfies IngestionResponse,
        { status: 502 },
      );
    }
  },
};
