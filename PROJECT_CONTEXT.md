# PUB ECOM Catalog Worker — Project Context

## Purpose

O `pub-ecom-catalog-worker` é o microserviço do ecossistema PUB ECOM responsável por:
1. Receber pedidos de ingestão e delegar o scraping ao `pub-shopee-scraper`.
2. Persistir e deduplicar os produtos no **Master Catalog** (Cloudflare D1).
3. Expor uma API de leitura estável e padronizada (`/v1/catalog/products`).

## Architecture

```text
MASTER CATALOG
       │
       ├── Ingestion (Write)
       │      POST /ingestion/shopee
       │         ↓
       │      pub-shopee-scraper ➔ ShopeeCatalogImporter ➔ Cloudflare D1
       │
       └── Read API
              GET /v1/catalog/products
              GET /v1/catalog/products/:id
                 ↓
              Cloudflare D1 (SQL Parametrizado)
```

## Master Catalog Canonical Identity

- `source` = `"shopee"`
- `sourceStoreId` = `shopId`
- `externalProductId` = `itemId`
- **Canonical Key:** `(source, sourceStoreId, externalProductId)` ➔ `${source}:${sourceStoreId}:${externalProductId}`

## Production Baseline

```text
PHASE=2G
STATUS=MASTER_CATALOG_API_VALIDATED

Storage: Cloudflare D1 (pub-ecom-master-catalog)
Table: master_products
Identity: source + sourceStoreId + externalProductId

Endpoints:
- GET /v1/catalog/products
- GET /v1/catalog/products/:id
- POST /ingestion/shopee

Shop test:
9r18ht6m88 (ShopID: 1729928484)
```
