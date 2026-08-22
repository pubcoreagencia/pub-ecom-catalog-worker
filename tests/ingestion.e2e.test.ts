import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { MemoryMasterCatalogRepository } from "../src/master-catalog/repository.js";
import { MemoryCatalogStoreRepository } from "../src/master-catalog/storeRepository.js";
import { ShopeeScraperResponse } from "../src/types.js";

const scraperResponse: ShopeeScraperResponse = {
  success: true,
  requestId: "scrape-e2e-001",
  provider: "test-shopee-scraper",
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
      originalPrice: 100.8,
      stock: 50,
      sku: "BAB-01",
      images: ["https://down-br.img.susercontent.com/file/img1.jpg"],
      category: "Calçados",
      sellerName: "Zentta Babuche",
      productUrl: "https://shopee.com.br/product/1729928484/23299366739",
      metadata: { rating: 4.9 },
    },
  ],
};

function makeRequest(path: string, init: RequestInit = {}) {
  return new Request(`https://pub-ecom-catalog-worker.test${path}`, init);
}

test("ingestion E2E: autentica, scrapeia, importa e retorna catálogo", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();
  const originalFetch = globalThis.fetch;
  let scraperCalls = 0;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    scraperCalls++;

    assert.equal(url, "https://pub-shopee-scraper.contato-pubcore.workers.dev/v1/scrape/shop");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer scraper-test-token");

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.shopUrl, "https://shopee.com.br/9r18ht6m88");
    assert.equal(body.limit, 30);

    return new Response(JSON.stringify(scraperResponse), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const env = {
      CATALOG_WORKER_TOKEN: "catalog-test-token",
      SHOPEE_SCRAPER_TOKEN: "scraper-test-token",
      TEST_REPO: productRepo,
      TEST_STORE_REPO: storeRepo,
    } as any;

    const response = await worker.fetch(
      makeRequest("/ingestion/shopee", {
        method: "POST",
        headers: {
          authorization: "Bearer catalog-test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: "https://shopee.com.br/9r18ht6m88" }),
      }),
      env
    );

    assert.equal(response.status, 200);

    const data = (await response.json()) as any;
    assert.equal(data.success, true);
    assert.equal(data.source, "shopee");
    assert.equal(data.shopId, "1729928484");
    assert.equal(data.items.length, 1);
    assert.equal(data.masterCatalog.created, 1);
    assert.equal(data.masterCatalog.updated, 0);
    assert.equal(data.masterCatalog.unchanged, 0);
    assert.equal(data.masterCatalog.failed, 0);
    assert.equal(data.metadata.provider, "test-shopee-scraper");
    assert.equal(data.errors.length, 0);

    assert.equal(scraperCalls, 1);
    assert.equal(await productRepo.count(), 1);
    assert.equal(await productRepo.countBySourceStore("shopee", "1729928484"), 1);

    const store = await storeRepo.findById("shopee:1729928484");
    assert.ok(store);
    assert.equal(store.sourceStoreId, "1729928484");
    assert.equal(store.productCount, 1);
    assert.equal(store.syncState, "success");
    assert.equal(store.syncLockUntil, null);
    assert.equal(store.syncRunId, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ingestion E2E: segunda ingestão é idempotente e marca produto como unchanged", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify(scraperResponse), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  try {
    const env = {
      CATALOG_WORKER_TOKEN: "catalog-test-token",
      SHOPEE_SCRAPER_TOKEN: "scraper-test-token",
      TEST_REPO: productRepo,
      TEST_STORE_REPO: storeRepo,
    } as any;

    const request = () =>
      makeRequest("/ingestion/shopee", {
        method: "POST",
        headers: {
          authorization: "Bearer catalog-test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: "https://shopee.com.br/9r18ht6m88", limit: 1 }),
      });

    const first = await worker.fetch(request(), env);
    const firstData = (await first.json()) as any;
    assert.equal(first.status, 200);
    assert.equal(firstData.masterCatalog.created, 1);

    const second = await worker.fetch(request(), env);
    const secondData = (await second.json()) as any;
    assert.equal(second.status, 200);
    assert.equal(secondData.success, true);
    assert.equal(secondData.masterCatalog.created, 0);
    assert.equal(secondData.masterCatalog.updated, 0);
    assert.equal(secondData.masterCatalog.unchanged, 1);
    assert.equal(await productRepo.count(), 1);
    assert.equal(await productRepo.countBySourceStore("shopee", "1729928484"), 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ingestion E2E: rejeita requisição sem token do Catalog Worker", async () => {
  const response = await worker.fetch(
    makeRequest("/ingestion/shopee", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://shopee.com.br/9r18ht6m88" }),
    }),
    {
      CATALOG_WORKER_TOKEN: "catalog-test-token",
      SHOPEE_SCRAPER_TOKEN: "scraper-test-token",
    } as any
  );

  assert.equal(response.status, 401);
  const data = (await response.json()) as any;
  assert.equal(data.error, "Unauthorized");
});

test("ingestion E2E: rejeita URL fora da allowlist Shopee", async () => {
  const response = await worker.fetch(
    makeRequest("/ingestion/shopee", {
      method: "POST",
      headers: {
        authorization: "Bearer catalog-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: "https://example.com/store" }),
    }),
    {
      CATALOG_WORKER_TOKEN: "catalog-test-token",
      SHOPEE_SCRAPER_TOKEN: "scraper-test-token",
    } as any
  );

  assert.equal(response.status, 400);
  const data = (await response.json()) as any;
  assert.equal(data.error, "Unsupported or unsafe URL");
});
