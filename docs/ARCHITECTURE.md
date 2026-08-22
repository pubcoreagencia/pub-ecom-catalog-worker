# Architecture — Master Catalog & Reading API

## Diagrama da Arquitetura

```text
Shopee Pública (Brasil)
        ↓
PUB Shopee Scraper (https://pub-shopee-scraper.contato-pubcore.workers.dev)
        │  (Primary: Apify / Fallback: Cloudflare Browser Run)
        ▼
PUB ECOM Catalog Worker (https://pub-ecom-catalog-worker.contato-pubcore.workers.dev)
        │
        ├──► INGESTION PIPELINE
        │         ├── POST /ingestion/shopee
        │         ├── ShopeeScraperClient (HTTP / Service Binding: SHOPEE_SCRAPER_SERVICE)
        │         ├── ShopeeCatalogImporter
        │         └── D1MasterCatalogRepository (Atomic Upsert)
        │
        ├──► MASTER CATALOG STORAGE (Cloudflare D1 SQL)
        │         └── Table: master_products (id: source:sourceStoreId:externalProductId)
        │
        └──► MASTER CATALOG READ API
                  ├── GET /v1/catalog/products (Filtros, Busca, Paginação, Ordenação)
                  └── GET /v1/catalog/products/:id (Busca Direta por Chave Canônica)
```

## Escolha de Persistência: Cloudflare D1
- **Tecnologia:** Banco relacional SQL nativo do Cloudflare Workers (SQLite globalmente replicado).
- **Identidade Canônica:** `(source, source_store_id, external_product_id)` mapeada em constraint `UNIQUE` e chave primária `${source}:${sourceStoreId}:${externalProductId}`.
- **Consultas Paginadas:** Filtros SQL dinâmicos parametrizados e ordenação por whitelist (`updated_at`, `created_at`, `price`, `title`), evitando injeção de SQL e otimizando performance.
