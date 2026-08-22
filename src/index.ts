import { acquire, connect, history, limits, sessions } from "@cloudflare/playwright";

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
    shopIdStrategy?: string;
    networkShopBaseStatus?: number | null;
    networkShopBaseShopId?: string | null;
    networkShopBaseUsername?: string | null;
    networkShopBaseResponseCaptured?: boolean;
    networkShopBaseResponseUrl?: string | null;
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

function extractShopId(value: string): string | null {
  const patterns = [
    /\/shop\/(\d{4,})(?:[/?#]|$)/i,
    /(?:shopid|shop_id|shopId|shop-id)["'\s:=]+["']?(\d{4,})/i,
    /(?:shopid|shop_id|shopId|shop-id)[^0-9]{0,24}(\d{4,})/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function extractFriendlyUsername(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) return null;

    const candidate = decodeURIComponent(segments[0]).trim();
    if (!candidate || /^shop$/i.test(candidate)) return null;
    if (/^\d{4,}$/.test(candidate)) return null;
    return candidate;
  } catch {
    return null;
  }
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

async function resolveShopIdFallback(page: any, sourceUrl: string): Promise<{ shopId: string | null; strategy: string }> {
  const username = extractFriendlyUsername(sourceUrl);
  if (username) {
    const shopBaseResult = await page.evaluate(async (shopUsername: string) => {
      try {
        const response = await fetch("/api/v4/shop/get_shop_base_v2", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            request_source: "mobile_shop_home_page",
            livestream_params: {},
            username: shopUsername,
          }),
        });

        const text = await response.text();
        let data: unknown = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }

        return { status: response.status, data };
      } catch (error) {
        return {
          status: 0,
          data: { error: error instanceof Error ? error.message : String(error) },
        };
      }
    }, username);

    if (shopBaseResult.status >= 200 && shopBaseResult.status < 300) {
      const serialized = typeof shopBaseResult.data === "string"
        ? shopBaseResult.data
        : JSON.stringify(shopBaseResult.data);
      const shopId = extractShopId(serialized);
      if (shopId) return { shopId, strategy: "shop-base-username" };
    }
  }

  await page.waitForTimeout(1500).catch(() => undefined);

  const runtimeData = await page.evaluate(() => {
    const candidates: string[] = [];

    const push = (value: unknown) => {
      if (typeof value === "string" && value.trim()) candidates.push(value);
      if (value !== null && typeof value === "object") {
        try {
          candidates.push(JSON.stringify(value));
        } catch {
          // Ignore circular/unserializable values.
        }
      }
    };

    push(window.location.href);
    push(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href);
    push(document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content);
    push(document.querySelector<HTMLMetaElement>('meta[name="shopid"]')?.content);
    push(document.querySelector<HTMLMetaElement>('meta[name="shop_id"]')?.content);

    for (const element of document.querySelectorAll<HTMLElement>('[data-shopid], [data-shop-id], [data-shop_id]')) {
      push(element.getAttribute("data-shopid"));
      push(element.getAttribute("data-shop-id"));
      push(element.getAttribute("data-shop_id"));
    }

    for (const script of document.scripts) {
      const text = script.textContent ?? "";
      if (/(?:shopid|shop_id|shopId|shop-id)/i.test(text) || /\/shop\/\d{4,}/i.test(text)) {
        push(text);
      }
    }

    const globals = ["__PRELOADED_STATE__", "__INITIAL_STATE__", "__NEXT_DATA__", "__NUXT__"] as const;
    for (const key of globals) {
      push((window as unknown as Record<string, unknown>)[key]);
    }

    return candidates;
  });

  for (const candidate of runtimeData) {
    const shopId = extractShopId(candidate);
    if (shopId) return { shopId, strategy: "dom-runtime-data" };
  }

  return { shopId: null, strategy: "resolution-exhausted" };
}

async function discoverShopee(sourceUrl: string, limit: number, pageSize: number, env: Env): Promise<IngestionResponse> {
  const startedAt = Date.now();
  const items: RawProduct[] = [];
  const errors: string[] = [];
  let shopId = extractShopId(sourceUrl);
  let pagesProcessed = 0;
  let shopIdStrategy = shopId ? "url-pattern" : "unknown";

  let networkShopBaseStatus: number | null = null;
  let networkShopBaseShopId: string | null = null;
  let networkShopBaseUsername: string | null = null;
  let networkShopBaseResponseCaptured = false;
  let networkShopBaseResponseUrl: string | null = null;

  let resolveNetworkShopId: ((result: { shopId: string; strategy: string }) => void) | null = null;
  const networkShopIdPromise = new Promise<{ shopId: string; strategy: string }>((resolve) => {
    resolveNetworkShopId = resolve;
  });

  const targetUsername = extractFriendlyUsername(sourceUrl);

  const { sessionId } = await acquire(env.BROWSER);
  const browser = await connect(env.BROWSER, sessionId);
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Install natural response listener BEFORE page navigation
  page.on("response", async (res) => {
    const resUrl = res.url();
    if (resUrl.includes("/api/v4/shop/get_shop_base_v2")) {
      networkShopBaseResponseCaptured = true;
      networkShopBaseResponseUrl = resUrl;
      networkShopBaseStatus = res.status();

      if (res.status() === 200) {
        try {
          const bodyText = await res.text().catch(() => "");
          if (bodyText) {
            const data = JSON.parse(bodyText);
            const rawShopId = data?.data?.shopid ?? data?.data?.shop_id ?? data?.shopid;
            const respUsername = data?.data?.account?.username ?? data?.data?.username;

            if (respUsername) {
              networkShopBaseUsername = String(respUsername);
            }

            if (rawShopId !== undefined && rawShopId !== null) {
              const strShopId = String(rawShopId).trim();
              if (/^\d+$/.test(strShopId)) {
                networkShopBaseShopId = strShopId;
                if (!targetUsername || !respUsername || respUsername.toLowerCase() === targetUsername.toLowerCase()) {
                  if (resolveNetworkShopId) {
                    resolveNetworkShopId({ shopId: strShopId, strategy: "network-shop-base" });
                    resolveNetworkShopId = null;
                  }
                }
              }
            }
          }
        } catch {
          // ignore parsing error
        }
      }
    }
  });

  try {
    const navPromise = page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
    const response = await withTimeout(navPromise, REQUEST_TIMEOUT_MS);
    if (!response) {
      throw new Error("browser navigation returned no response");
    }

    // 2. Wait for natural network response if not resolved by direct url pattern
    if (!shopId) {
      try {
        const networkResult = await withTimeout(networkShopIdPromise, 6000);
        shopId = networkResult.shopId;
        shopIdStrategy = networkResult.strategy;
      } catch {
        // network response timed out, proceed to fallback resolvers
      }
    }

    // 3. Fallback strategies
    if (!shopId) {
      const fallbackResolved = await resolveShopIdFallback(page, sourceUrl);
      shopId = fallbackResolved.shopId;
      shopIdStrategy = fallbackResolved.strategy;
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

      let data: any = {};
      try {
        data = JSON.parse(payload.text);
      } catch {
        data = {};
      }

      const pageItems: any[] = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data?.data?.items)
        ? data.data.items
        : Array.isArray(data?.data?.sections)
        ? data.data.sections.flatMap((s: any) => s?.data?.item ?? s?.data?.items ?? [])
        : [];

      if (pageItems.length === 0) {
        hasMore = false;
        break;
      }

      for (const raw of pageItems) {
        const basic = raw?.item_basic ?? raw;
        if (!basic) continue;

        const externalProductId = String(basic.itemid ?? basic.item_id ?? "");
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
          images: Array.isArray(basic.images) ? (basic.images as unknown[]).filter((image: unknown): image is string => typeof image === "string") : [],
          category: typeof basic.category === "string" ? basic.category : null,
          sellerName: typeof basic.shop_name === "string" ? basic.shop_name : null,
          metadata: { rawId: basic.itemid ?? basic.item_id, shopId },
        });

        if (items.length >= limit) break;
      }

      offset += pageItems.length;
      hasMore = pageItems.length >= pageSize && items.length < limit && Number(data.total_count ?? data?.data?.total_count ?? 0) > offset;
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
        shopIdStrategy,
        networkShopBaseStatus,
        networkShopBaseShopId,
        networkShopBaseUsername,
        networkShopBaseResponseCaptured,
        networkShopBaseResponseUrl,
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
        shopIdStrategy,
        networkShopBaseStatus,
        networkShopBaseShopId,
        networkShopBaseUsername,
        networkShopBaseResponseCaptured,
        networkShopBaseResponseUrl,
      },
      errors,
    };
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function discoverShopeeNetwork(targetUrl: string, env: Env) {
  const startedAt = Date.now();
  const entries: Array<{
    method: string;
    url: string;
    status?: number;
    contentType?: string;
    shopIdFound: string | null;
    usernameFound: boolean;
    fieldMatches?: Record<string, unknown>;
  }> = [];
  const events: Array<{ type: string; url?: string; timeMs: number }> = [];

  const { sessionId } = await acquire(env.BROWSER);
  const browser = await connect(env.BROWSER, sessionId);
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("request", (req) => {
    events.push({ type: "request", url: req.url(), timeMs: Date.now() - startedAt });
  });

  page.on("requestfailed", (req) => {
    events.push({ type: "requestfailed", url: req.url(), timeMs: Date.now() - startedAt });
  });

  page.on("framenavigated", (frame) => {
    events.push({ type: "framenavigated", url: frame.url(), timeMs: Date.now() - startedAt });
  });

  page.on("response", async (res) => {
    const resUrl = res.url();
    const isRelevant = /api|shop|search|product|seller|user|recommend|v4|v2/i.test(resUrl);
    if (!isRelevant) return;

    const method = res.request().method();
    const status = res.status();
    const headers = res.headers();
    const contentType = headers["content-type"] || "";

    let bodyText = "";
    let shopIdFound: string | null = null;
    let usernameFound = false;
    const fieldMatches: Record<string, unknown> = {};

    try {
      if (contentType.includes("json") || isRelevant) {
        bodyText = await res.text().catch(() => "");
      }
    } catch {
      // ignore
    }

    if (bodyText) {
      if (bodyText.includes("9r18ht6m88") || resUrl.includes("9r18ht6m88")) {
        usernameFound = true;
      }
      try {
        const parsed = JSON.parse(bodyText);
        const searchJson = (obj: unknown, path = ""): void => {
          if (!obj || typeof obj !== "object") return;
          for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            const currentPath = path ? `${path}.${key}` : key;
            if (/^(?:shop_?id|shopid)$/i.test(key) && (typeof value === "number" || typeof value === "string") && String(value).length >= 4) {
              shopIdFound = String(value);
              fieldMatches[currentPath] = value;
            }
            if (/^(?:username|shop_name|seller_name)$/i.test(key) && typeof value === "string") {
              fieldMatches[currentPath] = value;
              if (value.toLowerCase().includes("9r18ht6m88")) {
                usernameFound = true;
              }
            }
            if (typeof value === "object" && value !== null && currentPath.split(".").length < 6) {
              searchJson(value, currentPath);
            }
          }
        };
        searchJson(parsed);
      } catch {
        const match = bodyText.match(/(?:shopid|shop_id|shopId|shop-id)["'\s:=]+["']?(\d{4,})/i);
        if (match?.[1]) {
          shopIdFound = match[1];
          fieldMatches["rawRegex"] = match[1];
        }
      }
    }

    entries.push({
      method,
      url: resUrl,
      status,
      contentType,
      shopIdFound,
      usernameFound,
      fieldMatches: Object.keys(fieldMatches).length > 0 ? fieldMatches : undefined,
    });
  });

  let pageTitle = "";
  let finalUrl = "";
  let gotoError: string | null = null;

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    finalUrl = page.url();
    pageTitle = await page.title().catch(() => "");
    await page.waitForTimeout(4000).catch(() => undefined);
  } catch (err) {
    gotoError = err instanceof Error ? err.message : String(err);
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  return {
    targetUrl,
    finalUrl,
    pageTitle,
    durationMs: Date.now() - startedAt,
    gotoError,
    totalEvents: events.length,
    totalRelevantRequests: entries.length,
    entries,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestUrl = new URL(request.url);

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      return json({ ok: true, service: "pub-ecom-catalog-worker" }, { status: 200 });
    }

    if (request.method === "GET" && requestUrl.pathname === "/debug/shopee-network") {
      if (!isAuthorized(request, env.CATALOG_WORKER_TOKEN)) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }

      const targetUrl = requestUrl.searchParams.get("url") || "https://shopee.com.br/9r18ht6m88";
      try {
        const result = await discoverShopeeNetwork(targetUrl, env);
        return json({ ok: true, ...result }, { status: 200 });
      } catch (err) {
        return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    if (request.method === "GET" && requestUrl.pathname === "/debug/browser") {
      if (!isAuthorized(request, env.CATALOG_WORKER_TOKEN)) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }

      let limitsData: unknown = null;
      let sessionsData: unknown = null;
      let historyData: unknown = null;
      let acquireProbe: { success: boolean; sessionId?: string; error?: string } | null = null;

      try {
        limitsData = await limits(env.BROWSER);
      } catch (err) {
        limitsData = { error: err instanceof Error ? err.message : String(err) };
      }

      try {
        sessionsData = await sessions(env.BROWSER);
      } catch (err) {
        sessionsData = { error: err instanceof Error ? err.message : String(err) };
      }

      try {
        historyData = await history(env.BROWSER);
      } catch (err) {
        historyData = { error: err instanceof Error ? err.message : String(err) };
      }

      try {
        const acquireRes = await acquire(env.BROWSER);
        acquireProbe = { success: true, sessionId: acquireRes.sessionId };
        try {
          const browser = await connect(env.BROWSER, acquireRes.sessionId);
          await browser.close().catch(() => undefined);
        } catch {
          // ignore cleanup error
        }
      } catch (err) {
        acquireProbe = { success: false, error: err instanceof Error ? err.message : String(err) };
      }

      const parsedLimits = limitsData as Record<string, unknown> | null;
      const parsedHistory = Array.isArray(historyData) ? historyData : [];
      const parsedSessions = Array.isArray(sessionsData) ? sessionsData : [];

      return json({
        ok: true,
        allowedBrowserAcquisitions: parsedLimits?.allowedBrowserAcquisitions ?? null,
        maxConcurrentSessions: parsedLimits?.maxConcurrentSessions ?? null,
        timeUntilNextAllowedBrowserAcquisition: parsedLimits?.timeUntilNextAllowedBrowserAcquisition ?? null,
        activeSessions: parsedLimits?.activeSessions ?? parsedSessions,
        history: parsedHistory,
        limits: limitsData,
        recentSessions: parsedSessions,
        closeReasons: parsedHistory.map((h: Record<string, unknown>) => ({
          sessionId: h.sessionId,
          closeReason: h.closeReason,
          closeReasonText: h.closeReasonText,
          startTime: h.startTime,
          endTime: h.endTime,
        })),
        acquireProbe,
      }, { status: 200 });
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
