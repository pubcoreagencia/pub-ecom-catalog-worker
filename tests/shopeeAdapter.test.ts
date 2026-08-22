import assert from "node:assert/strict";
import test from "node:test";
import { mapShopeeScraperResponseToIngestion } from "../src/adapters/shopeeAdapter.js";
import { ShopeeScraperResponse } from "../src/types/index.js";

test("Caso 7 - Mapping: mapeia corretamente ShopeeScraperResponse para IngestionResponse e RawProduct", () => {
  const remoteResponse: ShopeeScraperResponse = {
    success: true,
    requestId: "req_xyz_999",
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
        title: "Babuche Infantil EVA com Apliques",
        price: 40.32,
        originalPrice: 100.8,
        stock: 50,
        sku: "SKU-BABUCHE",
        images: ["https://down-br.img.susercontent.com/file/sg-sample"],
        category: "Calçados",
        sellerName: "Zentta Babuche",
        productUrl: "https://shopee.com.br/product/1729928484/23299366739",
        metadata: { customField: 123 },
      },
    ],
    metadata: {
      provider: "apify",
      productsFound: 1,
      executionTimeMs: 1250,
      costUsd: 0.0408,
      requestId: "req_xyz_999",
      fallbackUsed: false,
    },
    errors: [],
  };

  const ingestion = mapShopeeScraperResponseToIngestion(remoteResponse);

  assert.equal(ingestion.success, true);
  assert.equal(ingestion.source, "shopee");
  assert.equal(ingestion.shopId, "1729928484");
  assert.equal(ingestion.items.length, 1);

  const item = ingestion.items[0];
  assert.equal(item.source, "shopee");
  assert.equal(item.sourceStoreId, "1729928484");
  assert.equal(item.externalProductId, "23299366739");
  assert.equal(item.sourceProductUrl, "https://shopee.com.br/product/1729928484/23299366739");
  assert.equal(item.title, "Babuche Infantil EVA com Apliques");
  assert.equal(item.description, null);
  assert.equal(item.price, 40.32);
  assert.equal(item.originalPrice, 100.8);
  assert.equal(item.stock, 50);
  assert.equal(item.sku, "SKU-BABUCHE");
  assert.deepEqual(item.images, ["https://down-br.img.susercontent.com/file/sg-sample"]);
  assert.equal(item.category, "Calçados");
  assert.equal(item.sellerName, "Zentta Babuche");
  assert.deepEqual(item.metadata, { customField: 123 });

  assert.equal(ingestion.metadata.totalFound, 1);
  assert.equal(ingestion.metadata.provider, "apify");
  assert.equal(ingestion.metadata.requestId, "req_xyz_999");
  assert.equal(ingestion.metadata.costUsd, 0.0408);
});
