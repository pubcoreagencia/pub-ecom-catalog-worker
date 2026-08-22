# Architecture — Master Catalog & Sync Engine

## Diagrama da Arquitetura

```text
Shopee Pública (Brasil)
        ↓
PUB Shopee Scraper (https://pub-shopee-scraper.contato-pubcore.workers.dev)
        │  (Primary: Apify / Fallback: Cloudflare Browser Run)
        ▼
PUB ECOM Catalog Worker (https://pub-ecom-catalog-worker.contato-pubcore.workers.dev)
        │
        ├──► SYNC ENGINE (syncStore())
        │         ├── Concurrency Locking (sync_lock_until / sync_run_id / 409 Conflict)
        │         ├── ShopeeScraperClient (HTTP / Service Binding: SHOPEE_SCRAPER_SERVICE)
        │         ├── ShopeeCatalogImporter (Atomic Upsert)
        │         └── Sync State Transitions (running ➔ success / partial / error)
        │
        ├──► MASTER CATALOG STORAGE (Cloudflare D1 SQL)
        │         ├── Table: catalog_stores (id: source:sourceStoreId)
        │         └── Table: master_products (id: source:sourceStoreId:externalProductId)
        │
        └──► MASTER CATALOG OPERATIONS & READ API
                  ├── POST /v1/catalog/stores/:id/refresh (Trigger de Sync Operacional)
                  ├── GET /v1/catalog/stats (Estatísticas Globais & Sync States)
                  ├── GET /v1/catalog/stores (Listagem Paginada de Lojas)
                  ├── GET /v1/catalog/stores/:id (Detalhes da Loja)
                  ├── GET /v1/catalog/stores/:id/products (Produtos da Loja)
                  ├── GET /v1/catalog/products (Filtros, Busca, Paginação)
                  └── GET /v1/catalog/products/:id (Produto por Chave Canônica)
```
