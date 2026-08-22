import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { CatalogStore, MasterProduct, ShopeeScraperResponse } from "../src/master-catalog/types.js";
import { MemoryMasterCatalogRepository } from "../src/master-catalog/repository.js";
import { MemoryCatalogStoreRepository } from "../src/master-catalog/storeRepository.js";
import { syncStore, StoreSyncConflictError } from "../src/master-catalog/syncEngine.js";
import { HttpShopeeScraperClient } from "../src/clients/shopeeScraperClient.js";

const storeA: CatalogStore = {
  id: "shopee:1729928484",
  source: "shopee",
  sourceStoreId: "1729928484",
  username: "9r18ht6m88",
  name: "Zentta Babuche",
  storeUrl: "https://shopee.com.br/9r18ht6m88",
  status: "active",
  productCount: 1,
  firstSeenAt: "2026-08-22T10:00:00.000Z",
  lastSeenAt: "2026-08-22T10:00:00.000Z",
  lastSyncAt: "2026-08-22T10:00:00.000Z",
  lastSyncStatus: "success",
  lastSyncError: null,
  syncState: "idle",
  syncLockUntil: null,
  syncRunId: null,
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
  metadata: { rating: 4.9 },
};

const productA: MasterProduct = {
  id: "shopee:1729928484:23299366739",
  source: "shopee",
  sourceStoreId: "1729928484",
  externalProductId: "23299366739",
  sourceProductUrl: "https://shopee.com.br/product/1729928484/23299366739",
  title: "Babuche Infantil EVA",
  description: null,
  price: 40.32,
  originalPrice: 100.8,
  stock: 50,
  sku: "BAB-01",
  images: ["https://down-br.img.susercontent.com/file/img1.jpg"],
  category: "Calçados",
  sellerName: "Zentta Babuche",
  metadata: {},
  firstSeenAt: "2026-08-22T10:00:00.000Z",
  lastSeenAt: "2026-08-22T10:00:00.000Z",
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
};

function createMockClient(mockResponse: ShopeeScraperResponse | Error) {
  return {
    async scrapeShop() {
      if (mockResponse instanceof Error) throw mockResponse;
      return mockResponse;
    },
  } as unknown as HttpShopeeScraperClient;
}

test("1 & 2. Refresh de loja existente com sucesso", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();
  await storeRepo.upsert(storeA);
  await productRepo.upsert(productA);

  const mockRes: ShopeeScraperResponse = {
    success: true,
    requestId: "req_1",
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
        originalPrice: 100.8,
        stock: 50,
        sku: "BAB-01",
        images: ["https://down-br.img.susercontent.com/file/img1.jpg"],
        category: "Calçados",
        sellerName: "Zentta Babuche",
        productUrl: "https://shopee.com.br/product/1729928484/23299366739",
        metadata: {},
      },
    ],
  };

  const client = createMockClient(mockRes);
  const result = await syncStore({
    storeId: storeA.id,
    env: {
      CATALOG_WORKER_TOKEN: "token",
      SHOPEE_SCRAPER_TOKEN: "token",
      TEST_REPO: productRepo,
      TEST_STORE_REPO: storeRepo,
    } as any,
    client,
  });

  assert.equal(result.success, true);
  assert.equal(result.store.syncState, "success");
  assert.equal(result.store.status, "active");
  assert.equal(result.store.syncLockUntil, null);
  assert.equal(result.store.syncRunId, null);
  assert.equal(result.sync.unchanged, 1);
  assert.equal(await productRepo.count(), 1);
});

test("3 & 16. Refresh vazio não apaga produtos históricos", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();
  await storeRepo.upsert(storeA);
  await productRepo.upsert(productA);

  const mockRes: ShopeeScraperResponse = {
    success: true,
    requestId: "req_empty",
    provider: "apify",
    shop: {
      shopId: "1729928484",
      username: "9r18ht6m88",
      name: "Zentta Babuche",
    },
    products: [],
  };

  const client = createMockClient(mockRes);
  const result = await syncStore({
    storeId: storeA.id,
    env: {
      CATALOG_WORKER_TOKEN: "token",
      SHOPEE_SCRAPER_TOKEN: "token",
      TEST_REPO: productRepo,
      TEST_STORE_REPO: storeRepo,
    } as any,
    client,
  });

  assert.equal(result.success, true);
  assert.equal(result.store.syncState, "success");
  assert.equal(result.sync.productsFound, 0);
  assert.equal(await productRepo.count(), 1); // Preservado
});

test("4 & 15. Refresh com erro não apaga produtos existentes", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();
  await storeRepo.upsert(storeA);
  await productRepo.upsert(productA);

  const client = createMockClient(new Error("Apify 502 Bad Gateway"));
  const result = await syncStore({
    storeId: storeA.id,
    env: {
      CATALOG_WORKER_TOKEN: "token",
      SHOPEE_SCRAPER_TOKEN: "token",
      TEST_REPO: productRepo,
      TEST_STORE_REPO: storeRepo,
    } as any,
    client,
  });

  assert.equal(result.success, false);
  assert.equal(result.store.syncState, "error");
  assert.equal(result.store.status, "error");
  assert.ok(result.store.lastSyncError?.includes("502"));
  assert.equal(await productRepo.count(), 1); // Preservado
});

test("6. Lock ativo bloqueia com 409 Conflict", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();

  const lockedStore: CatalogStore = {
    ...storeA,
    syncLockUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    syncRunId: "active_run_123",
  };
  await storeRepo.upsert(lockedStore);

  await assert.rejects(
    async () => {
      await syncStore({
        storeId: storeA.id,
        env: {
          CATALOG_WORKER_TOKEN: "token",
          SHOPEE_SCRAPER_TOKEN: "token",
          TEST_REPO: productRepo,
          TEST_STORE_REPO: storeRepo,
        } as any,
      });
    },
    (err: any) => {
      assert.ok(err instanceof StoreSyncConflictError);
      assert.equal(err.status, 409);
      assert.equal(err.syncRunId, "active_run_123");
      return true;
    }
  );
});

test("7. Lock expirado permite execução", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();

  const expiredStore: CatalogStore = {
    ...storeA,
    syncLockUntil: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // expirado no passado
    syncRunId: "old_run_999",
  };
  await storeRepo.upsert(expiredStore);

  const mockRes: ShopeeScraperResponse = {
    success: true,
    requestId: "req_expired",
    shop: { shopId: "1729928484", username: "9r18ht6m88", name: "Zentta" },
    products: [],
  };

  const client = createMockClient(mockRes);
  const res = await syncStore({
    storeId: storeA.id,
    env: {
      CATALOG_WORKER_TOKEN: "token",
      SHOPEE_SCRAPER_TOKEN: "token",
      TEST_REPO: productRepo,
      TEST_STORE_REPO: storeRepo,
    } as any,
    client,
  });

  assert.equal(res.success, true);
  assert.equal(res.store.syncState, "success");
});

test("18 & 19. Refresh atualiza preço e estoque", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();
  await storeRepo.upsert(storeA);
  await productRepo.upsert(productA);

  const updatedMockRes: ShopeeScraperResponse = {
    success: true,
    requestId: "req_update",
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
        price: 29.99, // novo preço
        originalPrice: 100.8,
        stock: 5, // novo estoque
        sku: "BAB-01",
        images: ["https://down-br.img.susercontent.com/file/img1.jpg"],
        category: "Calçados",
        sellerName: "Zentta Babuche",
        productUrl: "https://shopee.com.br/product/1729928484/23299366739",
        metadata: {},
      },
    ],
  };

  const client = createMockClient(updatedMockRes);
  const result = await syncStore({
    storeId: storeA.id,
    env: {
      CATALOG_WORKER_TOKEN: "token",
      SHOPEE_SCRAPER_TOKEN: "token",
      TEST_REPO: productRepo,
      TEST_STORE_REPO: storeRepo,
    } as any,
    client,
  });

  assert.equal(result.sync.updated, 1);
  const p = await productRepo.findById(productA.id);
  assert.equal(p?.price, 29.99);
  assert.equal(p?.stock, 5);
});

test("20. Unauthorized em refresh endpoint retorna 401", async () => {
  const res = await worker.fetch(
    new Request(`https://pub-ecom-catalog-worker.internal/v1/catalog/stores/${storeA.id}/refresh`, {
      method: "POST",
    }),
    { CATALOG_WORKER_TOKEN: "secret" } as any
  );

  assert.equal(res.status, 401);
});
