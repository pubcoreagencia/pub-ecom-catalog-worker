import { ShopeeScraperClientInput, ShopeeScraperResponse } from "../types";

export interface ShopeeScraperClient {
  scrapeShop(input: ShopeeScraperClientInput): Promise<ShopeeScraperResponse>;
}

export class HttpShopeeScraperClient implements ShopeeScraperClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly serviceBinding?: Fetcher;

  constructor(token: string, baseUrl?: string, serviceBinding?: Fetcher) {
    this.token = token;
    this.baseUrl = (baseUrl || "https://pub-shopee-scraper.contato-pubcore.workers.dev").replace(/\/+$/, "");
    this.serviceBinding = serviceBinding;
  }

  async scrapeShop(input: ShopeeScraperClientInput): Promise<ShopeeScraperResponse> {
    if (!this.token || !this.token.trim()) {
      throw new Error("SHOPEE_SCRAPER_AUTH_ERROR: SHOPEE_SCRAPER_TOKEN is not configured in Worker environment");
    }

    const targetUrl = `${this.baseUrl}/v1/scrape/shop`;
    let res: Response;

    const requestInit: RequestInit = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(input),
    };

    try {
      const fetcher = this.serviceBinding ? this.serviceBinding.fetch.bind(this.serviceBinding) : globalThis.fetch;
      res = await fetcher(targetUrl, requestInit);
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      throw new Error(
        isAbort
          ? "SHOPEE_SCRAPER_TIMEOUT: Request to pub-shopee-scraper timed out after 120s"
          : `SHOPEE_SCRAPER_UNAVAILABLE: Failed to connect to pub-shopee-scraper: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error(`SHOPEE_SCRAPER_AUTH_ERROR: Unauthorized access to pub-shopee-scraper (HTTP ${res.status})`);
    }

    if (res.status === 429) {
      throw new Error("SHOPEE_SCRAPER_RATE_LIMIT: pub-shopee-scraper rate limit exceeded (HTTP 429)");
    }

    if (res.status >= 500) {
      throw new Error(`SHOPEE_SCRAPER_UNAVAILABLE: pub-shopee-scraper returned HTTP ${res.status}`);
    }

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `SHOPEE_SCRAPER_INVALID_RESPONSE: Failed to parse JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
      );
    }

    return data as ShopeeScraperResponse;
  }
}
