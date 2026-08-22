# PUB ECOM Catalog Worker — Project Context

## Purpose

O `pub-ecom-catalog-worker` é a camada de integração do PUB ECOM responsável por receber pedidos de ingestão, delegar a extração para o microserviço autônomo `pub-shopee-scraper` e persistir os produtos no **Master Catalog** canônico no Cloudflare D1.

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
D1MasterCatalogRepository (Cloudflare D1 SQL)
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
3. Garante idempotência e zero duplicação por chave canônica através de constraint `UNIQUE(source, source_store_id, external_product_id)`.

## Production Baseline

```text
PHASE=2F.18
STATUS=D1_PERSISTENCE_VALIDATED

Storage: Cloudflare D1 (pub-ecom-master-catalog)
Table: master_products
Identity: source + sourceStoreId + externalProductId

Shop test:
9r18ht6m88

ShopID:
1729928484

Products validated:
>=3

Restart Durability:
PROVED (Unchanged on re-import across worker restarts)
```
