import assert from "node:assert/strict";
import test from "node:test";
import { HttpShopeeScraperClient } from "../src/clients/shopeeScraperClient.js";

test("Caso 1 - Sucesso: scrapeShop retorna produtos remotos", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any, opts: any) => {
    assert.equal(String(url), "https://pub-shopee-scraper.contato-pubcore.workers.dev/v1/scrape/shop");
    assert.equal(opts.headers.authorization, "Bearer test_token");

    return new Response(
      JSON.stringify({
        success: true,
        requestId: "req_123",
        provider: "apify",
        shop: {
          shopId: "1729928484",
          username: "9r18ht6m88",
          name: "Zentta Babuche",
        },
        products: [
          {
            itemId: "23299366739",
            shopId: "1729928484",
            title: "Babuche Infantil EVA",
            price: 40.32,
            originalPrice: null,
            stock: 50,
            sku: "BAB-01",
            images: ["https://down-br.img.susercontent.com/file/sample.jpg"],
            category: "Calçados",
            sellerName: "Zentta Babuche",
            productUrl: "https://shopee.com.br/product/1729928484/23299366739",
            metadata: { sample: true },
          },
        ],
        metadata: {
          provider: "apify",
          productsFound: 1,
          executionTimeMs: 500,
          costUsd: 0.04,
        },
        errors: [],
      }),
      { status: 200 }
    );
  };

  try {
    const client = new HttpShopeeScraperClient("test_token");
    const result = await client.scrapeShop({ shopUrl: "https://shopee.com.br/9r18ht6m88", limit: 3 });

    assert.equal(result.success, true);
    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].itemId, "23299366739");
    assert.equal(result.products[0].price, 40.32);
    assert.equal(result.shop.shopId, "1729928484");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Caso 2 - Catálogo vazio: scrapeShop propaga catálogo vazio", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({
        success: true,
        requestId: "req_empty",
        provider: "apify",
        shop: { shopId: "1729928484", username: "empty_shop", name: null },
        products: [],
        metadata: { productsFound: 0 },
        errors: ["[SHOPEE_EMPTY_CATALOG] No active products found in the shop catalog"],
      }),
      { status: 200 }
    );
  };

  try {
    const client = new HttpShopeeScraperClient("test_token");
    const result = await client.scrapeShop({ shopUrl: "https://shopee.com.br/empty_shop" });

    assert.equal(result.success, true);
    assert.equal(result.products.length, 0);
    assert.ok(result.errors?.[0]?.includes("SHOPEE_EMPTY_CATALOG"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Caso 3 - Scraper indisponível: HTTP 502 lança SHOPEE_SCRAPER_UNAVAILABLE", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Bad Gateway", { status: 502 });

  try {
    const client = new HttpShopeeScraperClient("test_token");
    await assert.rejects(
      async () => {
        await client.scrapeShop({ shopUrl: "https://shopee.com.br/9r18ht6m88" });
      },
      (err: Error) => err.message.includes("SHOPEE_SCRAPER_UNAVAILABLE")
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Caso 4 - Token inválido: HTTP 401 lança SHOPEE_SCRAPER_AUTH_ERROR", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Unauthorized", { status: 401 });

  try {
    const client = new HttpShopeeScraperClient("invalid_token");
    await assert.rejects(
      async () => {
        await client.scrapeShop({ shopUrl: "https://shopee.com.br/9r18ht6m88" });
      },
      (err: Error) => err.message.includes("SHOPEE_SCRAPER_AUTH_ERROR")
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Caso 5 - Timeout: lança SHOPEE_SCRAPER_TIMEOUT", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const abortError = new Error("This operation was aborted");
    abortError.name = "AbortError";
    throw abortError;
  };

  try {
    const client = new HttpShopeeScraperClient("test_token");
    await assert.rejects(
      async () => {
        await client.scrapeShop({ shopUrl: "https://shopee.com.br/9r18ht6m88" });
      },
      (err: Error) => err.message.includes("SHOPEE_SCRAPER_TIMEOUT")
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Caso 6 - JSON inválido: lança SHOPEE_SCRAPER_INVALID_RESPONSE", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Not JSON Content", { status: 200 });

  try {
    const client = new HttpShopeeScraperClient("test_token");
    await assert.rejects(
      async () => {
        await client.scrapeShop({ shopUrl: "https://shopee.com.br/9r18ht6m88" });
      },
      (err: Error) => err.message.includes("SHOPEE_SCRAPER_INVALID_RESPONSE")
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
