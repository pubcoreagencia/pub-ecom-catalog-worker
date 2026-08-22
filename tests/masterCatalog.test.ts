import assert from "node:assert/strict";
import test from "node:test";
import { MemoryMasterCatalogRepository } from "../src/master-catalog/repository.js";
import { ShopeeCatalogImporter } from "../src/master-catalog/importer.js";
import { RawProduct } from "../src/types/index.js";

const sampleProductA: RawProduct = {
  source: "shopee",
  sourceStoreId: "1729928484",
  externalProductId: "23299366739",
  sourceProductUrl: "https://shopee.com.br/product/1729928484/23299366739",
  title: "Babuche Infantil EVA com Apliques",
  description: null,
  price: 40.32,
  originalPrice: 100.8,
  stock: 50,
  sku: "BAB-01",
  images: ["https://down-br.img.susercontent.com/file/sg-sample1"],
  category: "Calçados",
  sellerName: "Zentta Babuche",
  metadata: { rating: 4.9 },
};

const sampleProductB: RawProduct = {
  source: "shopee",
  sourceStoreId: "1729928484",
  externalProductId: "58207382516",
  sourceProductUrl: "https://shopee.com.br/product/1729928484/58207382516",
  title: "Sapato Babuche Feminino Macio",
  description: null,
  price: 44.43,
  originalPrice: null,
  stock: 20,
  sku: "BAB-02",
  images: ["https://down-br.img.susercontent.com/file/sg-sample2"],
  category: "Calçados",
  sellerName: "Zentta Babuche",
  metadata: { rating: 4.8 },
};

test("1. Produto novo: cria registro com canonical ID e timestamps", async () => {
  const repo = new MemoryMasterCatalogRepository();
  const importer = new ShopeeCatalogImporter(repo);

  const res = await importer.importCatalog([sampleProductA], { requestId: "req_1", provider: "apify" });

  assert.equal(res.success, true);
  assert.equal(res.stats.created, 1);
  assert.equal(res.stats.updated, 0);
  assert.equal(res.stats.unchanged, 0);
  assert.equal(res.products.length, 1);

  const saved = await repo.findByCanonicalKey("shopee", "1729928484", "23299366739");
  assert.ok(saved);
  assert.equal(saved.id, "shopee:1729928484:23299366739");
  assert.equal(saved.title, "Babuche Infantil EVA com Apliques");
  assert.equal(saved.price, 40.32);
  assert.ok(saved.firstSeenAt);
  assert.ok(saved.lastSeenAt);
  assert.equal(saved.createdAt, saved.firstSeenAt);
});

test("2 & 3. Produto unchanged: segunda importação idêntica não cria duplicata e incrementa unchanged", async () => {
  const repo = new MemoryMasterCatalogRepository();
  const importer = new ShopeeCatalogImporter(repo);

  // Primeira importação
  await importer.importCatalog([sampleProductA], { requestId: "req_1" });
  const initial = await repo.findByCanonicalKey("shopee", "1729928484", "23299366739");
  assert.ok(initial);

  // Segunda importação idêntica
  const res2 = await importer.importCatalog([sampleProductA], { requestId: "req_2" });
  assert.equal(res2.stats.created, 0);
  assert.equal(res2.stats.updated, 0);
  assert.equal(res2.stats.unchanged, 1);

  const after = await repo.findByCanonicalKey("shopee", "1729928484", "23299366739");
  assert.ok(after);
  assert.equal(after.createdAt, initial.createdAt);
  assert.equal(after.updatedAt, initial.updatedAt);
  assert.equal(await repo.count(), 1); // Sem duplicação
});

test("4. Atualização de preço: detecta alteração de preço e incrementa updated", async () => {
  const repo = new MemoryMasterCatalogRepository();
  const importer = new ShopeeCatalogImporter(repo);

  await importer.importCatalog([sampleProductA]);

  const modifiedProduct: RawProduct = {
    ...sampleProductA,
    price: 35.5,
  };

  const res2 = await importer.importCatalog([modifiedProduct], { requestId: "req_price_update" });
  assert.equal(res2.stats.created, 0);
  assert.equal(res2.stats.updated, 1);
  assert.equal(res2.stats.unchanged, 0);

  const updated = await repo.findByCanonicalKey("shopee", "1729928484", "23299366739");
  assert.ok(updated);
  assert.equal(updated.price, 35.5);
  assert.equal(await repo.count(), 1);
});

test("5. Atualização de estoque: detecta alteração de stock", async () => {
  const repo = new MemoryMasterCatalogRepository();
  const importer = new ShopeeCatalogImporter(repo);

  await importer.importCatalog([sampleProductA]);

  const modifiedProduct: RawProduct = {
    ...sampleProductA,
    stock: 0,
  };

  const res2 = await importer.importCatalog([modifiedProduct]);
  assert.equal(res2.stats.updated, 1);

  const updated = await repo.findByCanonicalKey("shopee", "1729928484", "23299366739");
  assert.equal(updated?.stock, 0);
});

test("6. Atualização de imagens: detecta alteração na lista de imagens", async () => {
  const repo = new MemoryMasterCatalogRepository();
  const importer = new ShopeeCatalogImporter(repo);

  await importer.importCatalog([sampleProductA]);

  const modifiedProduct: RawProduct = {
    ...sampleProductA,
    images: ["https://down-br.img.susercontent.com/file/new_image_1", "https://down-br.img.susercontent.com/file/new_image_2"],
  };

  const res2 = await importer.importCatalog([modifiedProduct]);
  assert.equal(res2.stats.updated, 1);

  const updated = await repo.findByCanonicalKey("shopee", "1729928484", "23299366739");
  assert.equal(updated?.images.length, 2);
  assert.equal(updated?.images[0], "https://down-br.img.susercontent.com/file/new_image_1");
});

test("7. Deduplicação por (source, sourceStoreId, externalProductId)", async () => {
  const repo = new MemoryMasterCatalogRepository();
  const importer = new ShopeeCatalogImporter(repo);

  // Duplicatas na mesma lista
  const duplicates = [sampleProductA, sampleProductA, sampleProductA];
  const res = await importer.importCatalog(duplicates);

  // 1 created, 2 unchanged
  assert.equal(res.stats.created, 1);
  assert.equal(res.stats.unchanged, 2);
  assert.equal(await repo.count(), 1);
});

test("8. Catálogo vazio: processa lista vazia sem erros", async () => {
  const repo = new MemoryMasterCatalogRepository();
  const importer = new ShopeeCatalogImporter(repo);

  const res = await importer.importCatalog([]);
  assert.equal(res.success, true);
  assert.equal(res.stats.total, 0);
  assert.equal(res.stats.created, 0);
  assert.equal(res.products.length, 0);
  assert.equal(await repo.count(), 0);
});

test("9. Múltiplos produtos e idempotência global", async () => {
  const repo = new MemoryMasterCatalogRepository();
  const importer = new ShopeeCatalogImporter(repo);

  // Primeira execução: 2 produtos
  const res1 = await importer.importCatalog([sampleProductA, sampleProductB]);
  assert.equal(res1.stats.created, 2);
  assert.equal(await repo.count(), 2);

  // Segunda execução: mesmos 2 produtos
  const res2 = await importer.importCatalog([sampleProductA, sampleProductB]);
  assert.equal(res2.stats.created, 0);
  assert.equal(res2.stats.unchanged, 2);
  assert.equal(await repo.count(), 2);
});

test("10. Falha parcial de importação: produto sem externalProductId incrementa failed", async () => {
  const repo = new MemoryMasterCatalogRepository();
  const importer = new ShopeeCatalogImporter(repo);

  const invalidProduct: RawProduct = {
    ...sampleProductA,
    externalProductId: "",
  };

  const res = await importer.importCatalog([sampleProductA, invalidProduct]);
  assert.equal(res.stats.total, 2);
  assert.equal(res.stats.created, 1);
  assert.equal(res.stats.failed, 1);
  assert.equal(res.errors.length, 1);
  assert.equal(await repo.count(), 1);
});
