import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { MasterProduct } from "../src/master-catalog/types.js";
import { MemoryMasterCatalogRepository } from "../src/master-catalog/repository.js";

const productA: MasterProduct = {
  id: "shopee:1729928484:23299366739",
  source: "shopee",
  sourceStoreId: "1729928484",
  externalProductId: "23299366739",
  sourceProductUrl: "https://shopee.com.br/product/1729928484/23299366739",
  title: "Babuche Infantil EVA Decorativo",
  description: "Sapato macio",
  price: 40.32,
  originalPrice: 100.8,
  stock: 50,
  sku: "BAB-01",
  images: ["https://down-br.img.susercontent.com/file/img1.jpg"],
  category: "Calçados Infantis",
  sellerName: "Zentta Babuche",
  metadata: { rating: 4.9 },
  firstSeenAt: "2026-08-22T10:00:00.000Z",
  lastSeenAt: "2026-08-22T10:00:00.000Z",
  createdAt: "2026-08-22T10:00:00.000Z",
  updatedAt: "2026-08-22T10:00:00.000Z",
};

const productB: MasterProduct = {
  id: "shopee:1729928484:58207382516",
  source: "shopee",
  sourceStoreId: "1729928484",
  externalProductId: "58207382516",
  sourceProductUrl: "https://shopee.com.br/product/1729928484/58207382516",
  title: "Sapato Babuche Feminino Macio",
  description: "Sapato feminino",
  price: 44.43,
  originalPrice: 88.86,
  stock: 20,
  sku: "BAB-02",
  images: ["https://down-br.img.susercontent.com/file/img2.jpg"],
  category: "Calçados Femininos",
  sellerName: "Zentta Babuche",
  metadata: { rating: 4.8 },
  firstSeenAt: "2026-08-22T10:05:00.000Z",
  lastSeenAt: "2026-08-22T10:05:00.000Z",
  createdAt: "2026-08-22T10:05:00.000Z",
  updatedAt: "2026-08-22T10:05:00.000Z",
};

const productC: MasterProduct = {
  id: "shopee:9999999999:11122233344",
  source: "shopee",
  sourceStoreId: "9999999999",
  externalProductId: "11122233344",
  sourceProductUrl: "https://shopee.com.br/product/9999999999/11122233344",
  title: "Tênis Esportivo Casual Leve",
  description: "Tenis running",
  price: 99.9,
  originalPrice: 150.0,
  stock: 10,
  sku: "TEN-01",
  images: ["https://down-br.img.susercontent.com/file/img3.jpg"],
  category: "Esporte",
  sellerName: "Mega Esportes",
  metadata: { rating: 4.5 },
  firstSeenAt: "2026-08-22T10:10:00.000Z",
  lastSeenAt: "2026-08-22T10:10:00.000Z",
  createdAt: "2026-08-22T10:10:00.000Z",
  updatedAt: "2026-08-22T10:10:00.000Z",
};

async function getTestEnv() {
  const repo = new MemoryMasterCatalogRepository();
  await repo.upsert(productA);
  await repo.upsert(productB);
  await repo.upsert(productC);

  return {
    CATALOG_WORKER_TOKEN: "test_token",
    SHOPEE_SCRAPER_TOKEN: "test_token",
    TEST_REPO: repo,
  };
}

function req(path: string, auth = "Bearer test_token"): Request {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new Request(`https://pub-ecom-catalog-worker.internal${path}`, { headers });
}

test("1. Listar todos os produtos", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products"), env);
  assert.equal(res.status, 200);

  const data = (await res.json()) as any;
  assert.equal(data.success, true);
  assert.equal(data.items.length, 3);
  assert.equal(data.pagination.total, 3);
  assert.equal(data.pagination.page, 1);
});

test("2. Paginação: pageSize e page", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products?page=1&pageSize=2"), env);
  assert.equal(res.status, 200);

  const data = (await res.json()) as any;
  assert.equal(data.items.length, 2);
  assert.equal(data.pagination.page, 1);
  assert.equal(data.pagination.pageSize, 2);
  assert.equal(data.pagination.total, 3);
  assert.equal(data.pagination.totalPages, 2);
  assert.equal(data.pagination.hasNextPage, true);
  assert.equal(data.pagination.hasPreviousPage, false);
});

test("3. Filtro source", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products?source=shopee"), env);
  const data = (await res.json()) as any;
  assert.equal(data.items.length, 3);

  const resForeign = await worker.fetch(req("/v1/catalog/products?source=mercadolivre"), env);
  const dataForeign = (await resForeign.json()) as any;
  assert.equal(dataForeign.items.length, 0);
});

test("4. Filtro sourceStoreId", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products?sourceStoreId=1729928484"), env);
  const data = (await res.json()) as any;
  assert.equal(data.items.length, 2);
  assert.ok(data.items.every((p: any) => p.sourceStoreId === "1729928484"));
});

test("5. Search por title", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products?search=Babuche"), env);
  const data = (await res.json()) as any;
  assert.equal(data.items.length, 2);

  const resTenis = await worker.fetch(req("/v1/catalog/products?search=Tênis"), env);
  const dataTenis = (await resTenis.json()) as any;
  assert.equal(dataTenis.items.length, 1);
  assert.equal(dataTenis.items[0].id, productC.id);
});

test("6. Filtro category", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products?category=Esporte"), env);
  const data = (await res.json()) as any;
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].category, "Esporte");
});

test("7. Filtro seller", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products?seller=Mega"), env);
  const data = (await res.json()) as any;
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].sellerName, "Mega Esportes");
});

test("8. Filtro minPrice", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products?minPrice=44"), env);
  const data = (await res.json()) as any;
  assert.equal(data.items.length, 2); // 44.43 and 99.9
});

test("9. Filtro maxPrice", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products?maxPrice=42"), env);
  const data = (await res.json()) as any;
  assert.equal(data.items.length, 1); // 40.32
  assert.equal(data.items[0].id, productA.id);
});

test("10. Ordenação por preço e título", async () => {
  const env = await getTestEnv();
  const resPriceAsc = await worker.fetch(req("/v1/catalog/products?sort=price&order=asc"), env);
  const dataPriceAsc = (await resPriceAsc.json()) as any;
  assert.equal(dataPriceAsc.items[0].price, 40.32);
  assert.equal(dataPriceAsc.items[2].price, 99.9);

  const resPriceDesc = await worker.fetch(req("/v1/catalog/products?sort=price&order=desc"), env);
  const dataPriceDesc = (await resPriceDesc.json()) as any;
  assert.equal(dataPriceDesc.items[0].price, 99.9);
  assert.equal(dataPriceDesc.items[2].price, 40.32);
});

test("11. GET /v1/catalog/products/:id - busca produto canônico", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req(`/v1/catalog/products/${encodeURIComponent(productA.id)}`), env);
  assert.equal(res.status, 200);

  const data = (await res.json()) as any;
  assert.equal(data.success, true);
  assert.equal(data.item.id, productA.id);
  assert.equal(data.item.title, productA.title);
  assert.equal(data.item.price, productA.price);
});

test("12. GET /v1/catalog/products/:id - produto inexistente retorna 404", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products/shopee:9999999999:00000000000"), env);
  assert.equal(res.status, 404);

  const data = (await res.json()) as any;
  assert.equal(data.success, false);
  assert.equal(data.error, "Product not found");
});

test("13. Page inválida com fallback seguro", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products?page=-5"), env);
  assert.equal(res.status, 200);
  const data = (await res.json()) as any;
  assert.equal(data.pagination.page, 1);
});

test("14. PageSize inválido com fallback seguro", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products?pageSize=-10"), env);
  assert.equal(res.status, 200);
  const data = (await res.json()) as any;
  assert.equal(data.pagination.pageSize, 30);
});

test("15. PageSize acima do máximo clamped para 100", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(req("/v1/catalog/products?pageSize=500"), env);
  assert.equal(res.status, 200);
  const data = (await res.json()) as any;
  assert.equal(data.pagination.pageSize, 100);
});

test("16. Unauthorized retorna 401", async () => {
  const env = await getTestEnv();
  const resList = await worker.fetch(req("/v1/catalog/products", ""), env);
  assert.equal(resList.status, 401);

  const resGet = await worker.fetch(req(`/v1/catalog/products/${productA.id}`, ""), env);
  assert.equal(resGet.status, 401);
});

test("17. Combinação de múltiplos filtros", async () => {
  const env = await getTestEnv();
  const res = await worker.fetch(
    req("/v1/catalog/products?source=shopee&sourceStoreId=1729928484&minPrice=40&maxPrice=42&search=Babuche"),
    env
  );
  assert.equal(res.status, 200);
  const data = (await res.json()) as any;
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].id, productA.id);
});
