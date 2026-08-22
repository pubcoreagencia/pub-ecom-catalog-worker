import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { CatalogStore, MasterProduct } from "../src/master-catalog/types.js";
import { MemoryMasterCatalogRepository } from "../src/master-catalog/repository.js";
import { MemoryCatalogStoreRepository } from "../src/master-catalog/storeRepository.js";
import { ShopeeCatalogImporter } from "../src/master-catalog/importer.js";

const storeA: CatalogStore = {
  id: "shopee:1729928484",
  source: "shopee",
  sourceStoreId: "1729928484",
  username: "9r18ht6m88",
  name: "Zentta Babuche",
  storeUrl: "https://shopee.com.br/9r18ht6m88",
  status: "active",
  productCount: 2,
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

const storeB: CatalogStore = {
  id: "shopee:8888888888",
  source: "shopee",
  sourceStoreId: "8888888888",
  username: "loja_tenis",
  name: "Mega Tenis Oficial",
  storeUrl: "https://shopee.com.br/loja_tenis",
  status: "inactive",
  productCount: 1,
  firstSeenAt: "2026-08-22T10:10:00.000Z",
  lastSeenAt: "2026-08-22T10:10:00.000Z",
  lastSyncAt: "2026-08-22T10:10:00.000Z",
  lastSyncStatus: "success",
  lastSyncError: null,
  syncState: "idle",
  syncLockUntil: null,
  syncRunId: null,
  createdAt: "2026-08-22T10:10:00.000Z",
  updatedAt: "2026-08-22T10:10:00.000Z",
  metadata: {},
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

async function getTestEnv() {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();

  await storeRepo.upsert(storeA);
  await storeRepo.upsert(storeB);
  await productRepo.upsert(productA);

  return {
    CATALOG_WORKER_TOKEN: "test_token",
    SHOPEE_SCRAPER_TOKEN: "test_token",
    TEST_REPO: productRepo,
    TEST_STORE_REPO: storeRepo,
  };
}

function req(path: string, auth = "Bearer test_token", method = "GET"): Request {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new Request(`https://pub-ecom-catalog-worker.internal${path}`, { method, headers });
}

test("1. Listar todas as stores (GET /v1/catalog/stores)", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/stores"), env);
  assert.equal(res.status, 200);

  const data = (await res.json()) as any;
  assert.equal(data.success, true);
  assert.equal(data.items.length, 2);
  assert.equal(data.pagination.total, 2);
});

test("2. Encontrar store por ID canônico (GET /v1/catalog/stores/:id)", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req(`/v1/catalog/stores/${storeA.id}`), env);
  assert.equal(res.status, 200);

  const data = (await res.json()) as any;
  assert.equal(data.success, true);
  assert.equal(data.item.id, storeA.id);
  assert.equal(data.item.username, storeA.username);
});

test("3. Store inexistente retorna 404", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/stores/shopee:9999999999"), env);
  assert.equal(res.status, 404);

  const data = (await res.json()) as any;
  assert.equal(data.success, false);
  assert.equal(data.error, "Store not found");
});

test("4. Filtrar stores por status", async () => {
  const env = await getTestEnv();
  const resActive = await worker.fetch(req("/v1/catalog/stores?status=active"), env);
  const dataActive = (await resActive.json()) as any;
  assert.equal(dataActive.items.length, 1);
  assert.equal(dataActive.items[0].id, storeA.id);

  const resInactive = await worker.fetch(req("/v1/catalog/stores?status=inactive"), env);
  const dataInactive = (await resInactive.json()) as any;
  assert.equal(dataInactive.items.length, 1);
  assert.equal(dataInactive.items[0].id, storeB.id);
});

test("5. Search stores por username ou name", async () => {
  const env = await getTestEnv();
  const resUser = await worker.fetch(req("/v1/catalog/stores?search=9r18ht6m88"), env);
  const dataUser = (await resUser.json()) as any;
  assert.equal(dataUser.items.length, 1);
  assert.equal(dataUser.items[0].id, storeA.id);

  const resName = await worker.fetch(req("/v1/catalog/stores?search=Mega"), env);
  const dataName = (await resName.json()) as any;
  assert.equal(dataName.items.length, 1);
  assert.equal(dataName.items[0].id, storeB.id);
});

test("6. Listar produtos da loja (GET /v1/catalog/stores/:id/products)", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req(`/v1/catalog/stores/${storeA.id}/products`), env);
  assert.equal(res.status, 200);

  const data = (await res.json()) as any;
  assert.equal(data.success, true);
  assert.equal(data.store.id, storeA.id);
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].id, productA.id);
});

test("7. Produtos de loja inexistente retorna 404", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/stores/shopee:0000000000/products"), env);
  assert.equal(res.status, 404);
});

test("8. Obter estatísticas do catálogo (GET /v1/catalog/stats)", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/stats"), env);
  assert.equal(res.status, 200);

  const data = (await res.json()) as any;
  assert.equal(data.success, true);
  assert.equal(data.stats.stores, 2);
  assert.equal(data.stats.activeStores, 1);
  assert.equal(data.stats.errorStores, 0);
  assert.ok(data.stats.sync);
});

test("9. Refresh de loja inexistente retorna 404", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req(`/v1/catalog/stores/shopee:0000000000/refresh`, "Bearer test_token", "POST"), env);
  assert.equal(res.status, 404);

  const data = (await res.json()) as any;
  assert.equal(data.success, false);
  assert.equal(data.error, "Store not found");
});

test("10. Importer cria e atualiza store entity e sync state", async () => {
  const productRepo = new MemoryMasterCatalogRepository();
  const storeRepo = new MemoryCatalogStoreRepository();
  const importer = new ShopeeCatalogImporter(productRepo, storeRepo);

  await importer.importCatalog([productA], {
    requestId: "req_test",
    provider: "apify",
    store: {
      username: "9r18ht6m88",
      name: "Zentta Babuche",
      status: "active",
      syncStatus: "success",
    },
  });

  const store = await storeRepo.findById("shopee:1729928484");
  assert.ok(store);
  assert.equal(store.username, "9r18ht6m88");
  assert.equal(store.status, "active");
  assert.equal(store.lastSyncStatus, "success");
  assert.equal(store.syncState, "success");
  assert.equal(store.productCount, 1);
});
