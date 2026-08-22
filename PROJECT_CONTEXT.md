# PUB ECOM Catalog Worker — Project Context

## Purpose

O `pub-ecom-catalog-worker` é a camada de integração do PUB ECOM responsável por receber pedidos de ingestão, delegar a extração para o microserviço autônomo `pub-shopee-scraper` e persistir os produtos no **Master Catalog** canônico.

## Architecture

```text
Shopee Pública
   ↓
PUB Shopee Scraper (pub-shopee-scraper)
   ↓
PUB ECOM Catalog Worker (ShopeeScraperClient)
   ↓
ShopeeCatalogImporter
   ↓
Master Catalog (Canonical Upsert)
   ↓
PUB ECOM HUB
```

## Master Catalog Canonical Identity

- `source` = `"shopee"`
- `sourceStoreId` = `shopId`
- `externalProductId` = `itemId`
- **Canonical Key:** `(source, sourceStoreId, externalProductId)` ➔ `${source}:${sourceStoreId}:${externalProductId}`

## Importer & Upsert Lifecycle

1. `ShopeeCatalogImporter.importCatalog(items)` recebe `RawProduct[]`.
2. Para cada produto:
   - **Novo produto:** cria `MasterProduct` com `firstSeenAt`, `lastSeenAt`, `createdAt`, `updatedAt` e incrementa `created`.
   - **Produto existente:** compara atributos (título, preço, originalPrice, estoque, sku, imagens, categoria). Se houver mudanças, atualiza e incrementa `updated`. Se idêntico, atualiza apenas `lastSeenAt` e incrementa `unchanged`.
3. Garante idempotência e zero duplicação por chave canônica.

## Decoupling Rules

1. O `pub-ecom-catalog-worker` não possui bindings de `BROWSER` nem executa Playwright diretamente.
2. O `pub-ecom-catalog-worker` não possui `APIFY_TOKEN`.
3. Todo scraping e resolução de ShopID é de responsabilidade do `pub-shopee-scraper`.
4. Comunicação autenticada via `SHOPEE_SCRAPER_TOKEN` e acelerada por Service Binding `SHOPEE_SCRAPER_SERVICE`.

## E2E Baseline

```text
PHASE=2F.17
STATUS=MASTER_CATALOG_INTEGRATED

Shopee = external catalog source
Catalog Worker = ingestion adapter
Master Catalog = canonical internal catalog
Identity = source + sourceStoreId + externalProductId

Shop test:
9r18ht6m88

ShopID:
1729928484

Products validated:
>=3
```
