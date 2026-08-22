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

const productStoreB: MasterProduct = {
  id: "shopee:8888888888:99999999999",
  source: "shopee",
  sourceStoreId: "8888888888",
  externalProductId: "99999999999",
  sourceProductUrl: "https://shopee.com.br/product/8888888888/99999999999",
  title: "Outro Produto",
  description: null,
  price: 50.0,
  originalPrice: null,
  stock: 10,
  sku: "OUT-01",
  images: [],
  category: "Outros",
  sellerName: "Outra Loja",
  metadata: {},
  firstSeenAt: "2026-08-22T10:00:00.000Z",
  lastSeenAt: "2026-08-22T10:00:00.000Z",
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
};

function createMockClient(mockResponse: ShopeeScraperResponse | Error) {
  let callCount = 0;
  return {
    get callCount() {
      return callCount;
    },
    async scrapeShop() {
      callCount++;
      if (mockResponse instanceof Error) throw mockResponse;
      return mockResponse;
    },
  } as unknown as HttpShopeeScraperClient & { callCount: number };
}

test("1. acquireSyncLock atômico", async () => {
  const storeRepo = new MemoryCatalogStoreRepository();
  await storeRepo.upsert(storeA);

  const lockUntil = new Date(Date.now() + 5000).toISOString();
  const ok = await storeRepo.acquireSyncLock(storeA.id, "run_1", lockUntil);
  assert.equal(ok, true);

  const locked = await storeRepo.findById(storeA.id);
  assert.equal(locked?.syncState, "running");
  assert.equal(locked?.syncRunId, "run_1");
  assert.equal(locked?.syncLockUntil, lockUntil);
});

test("2. Segundo acquireSyncLock falha com lock ativo", async () => {
  const storeRepo = new MemoryCatalogStoreRepository();
  await storeRepo.upsert(storeA);

  const lockUntil = new Date(Date.now() + 5000).toISOString();
  await storeRepo.acquireSyncLock(storeA.id, "run_1", lockUntil);

  const ok2 = await storeRepo.acquireSyncLock(storeA.id, "run_2", lockUntil);
  assert.equal(ok2, false);
});

test("3. Lock expirado pode ser adquirido", async () => {
  const storeRepo = new MemoryCatalogStoreRepository();
  const expiredStore = {
    ...storeA,
    syncLockUntil: new Date(Date.now() - 5000).toISOString(),
    syncRunId: "old_run",
  };
  await storeRepo.upsert(expiredStore);

  const newLock = new Date(Date.now() + 5000).toISOString();
  const ok = await storeRepo.acquireSyncLock(storeA.id, "run_new", newLock);
  assert.equal(ok, true);

  const updated = await storeRepo.findById(storeA.id);
  assert.equal(updated?.syncRunId, "run_new");
});

test("4 & 5. Release com syncRunId correto vs release antigo", async () => {
  const storeRepo = new MemoryCatalogStoreRepository();
  const lockUntil = new Date(Date.now() + 5000).toISOString();
  await storeRepo.upsert(storeA);
  await storeRepo.acquireSyncLock(storeA.id, "run_active", lockUntil);

  // Release com run_id antigo não afeta lock ativo
  const wrongRelease = await storeRepo.releaseSyncLock(storeA.id, "run_old");
  assert.equal(wrongRelease, false);

  const stillLocked = await storeRepo.findById(storeA.id);
  assert.equal(stillLocked?.syncRunId, "run_active");

  // Release com run_id correto libera o lock
  const rightRelease = await storeRepo.releaseSyncLock(storeA.id, "run_active");
  assert.equal(rightRelease, true);

  const unlocked = await storeRepo.findById(storeA.id);
  assert.equal(unlocked?.syncRunId, null);
  assert.equal(unlocked?.syncLockUntil, null);
});

test("6 & 7. countBySourceStore retorna apenas produtos da loja e isola contagem", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  await productRepo.upsert(productA);
  await productRepo.upsert(productStoreB);

  assert.equal(await productRepo.count(), 2);
  assert.equal(await productRepo.countBySourceStore("shopee", "1729928484"), 1);
  assert.equal(await productRepo.countBySourceStore("shopee", "8888888888"), 1);
  assert.equal(await productRepo.countBySourceStore("shopee", "0000000000"), 0);
});

test("8 & 9. Catálogo vazio preserva productCount e produtos históricos", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();
  await storeRepo.upsert({ ...storeA, productCount: 5 });
  await productRepo.upsert(productA);

  const mockRes: ShopeeScraperResponse = {
    success: true,
    requestId: "req_empty",
    shop: { shopId: "1729928484", username: "9r18ht6m88", name: "Zentta" },
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
  assert.equal(result.store.productCount, 5); // preservado!
  assert.equal(await productRepo.count(), 1); // preservado!
});

test("10 & 11. Friendly URL resolve ShopID sem criar shopee:unknown", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();

  const mockRes: ShopeeScraperResponse = {
    success: true,
    requestId: "req_url",
    shop: { shopId: "1729928484", username: "9r18ht6m88", name: "Zentta" },
    products: [
      {
        itemId: "23299366739",
        shopId: "1729928484",
        title: "Babuche Infantil EVA",
        price: 40.32,
        originalPrice: 100.8,
        stock: 50,
        sku: "BAB-01",
        images: [],
        category: "Calçados",
        sellerName: "Zentta",
        productUrl: "https://shopee.com.br/product/1729928484/23299366739",
        metadata: {},
      },
    ],
  };

  const client = createMockClient(mockRes);
  const result = await syncStore({
    shopUrl: "https://shopee.com.br/9r18ht6m88",
    env: {
      CATALOG_WORKER_TOKEN: "token",
      SHOPEE_SCRAPER_TOKEN: "token",
      TEST_REPO: productRepo,
      TEST_STORE_REPO: storeRepo,
    } as any,
    client,
  });

  assert.equal(result.success, true);
  assert.equal(result.store.id, "shopee:1729928484");
  assert.equal(await storeRepo.findById("shopee:unknown"), null); // zero orfãos!
  assert.ok(await storeRepo.findById("shopee:1729928484"));
});

test("15. Erro no scraper não apaga produtos e marca syncState error", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();
  await storeRepo.upsert(storeA);
  await productRepo.upsert(productA);

  const client = createMockClient(new Error("Apify timeout 504"));
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
  assert.equal(await productRepo.count(), 1); // preservado!
});

test("17 & 18. Concorrência: duas chamadas simultâneas barram uma com 409", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();
  await storeRepo.upsert(storeA);

  // Manualmente trava a loja
  await storeRepo.acquireSyncLock(storeA.id, "run_first", new Date(Date.now() + 5000).toISOString());

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
      return true;
    }
  );
});
