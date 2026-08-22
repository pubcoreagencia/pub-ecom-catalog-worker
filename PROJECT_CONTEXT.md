# PUB ECOM Catalog Worker — Project Context

## Purpose

O `pub-ecom-catalog-worker` é o microserviço do ecossistema PUB ECOM responsável por:
1. Receber pedidos de ingestão e delegar o scraping ao `pub-shopee-scraper`.
2. Persistir, gerenciar e deduplicar lojas (`catalog_stores`) e produtos (`master_products`) no Cloudflare D1.
3. Expor uma API operacional e de leitura estável (`/v1/catalog/stats`, `/v1/catalog/stores`, `/v1/catalog/products`).

## Entities & Canonical Identity

- **Store Identity:** `source` + `sourceStoreId` ➔ `${source}:${sourceStoreId}` (ex: `shopee:1729928484`)
- **Product Identity:** `source` + `sourceStoreId` + `externalProductId` ➔ `${source}:${sourceStoreId}:${externalProductId}`

## Production Baseline

```text
PHASE=2H
STATUS=MASTER_CATALOG_OPERATIONS_VALIDATED

Storage: Cloudflare D1 (pub-ecom-master-catalog)
Tables:
- catalog_stores
- master_products

Endpoints:
- GET /v1/catalog/stats
- GET /v1/catalog/stores
- GET /v1/catalog/stores/:id
- GET /v1/catalog/stores/:id/products
- POST /v1/catalog/stores/:id/refresh (501)
- GET /v1/catalog/products
- GET /v1/catalog/products/:id
- POST /ingestion/shopee

Shop test:
9r18ht6m88 (ShopID: 1729928484)
```
