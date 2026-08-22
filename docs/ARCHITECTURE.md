# Architecture — Master Catalog & Operations API

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
        │         └── D1 Repositories (Upsert store + products + product count)
        │
        ├──► MASTER CATALOG STORAGE (Cloudflare D1 SQL)
        │         ├── Table: catalog_stores (id: source:sourceStoreId)
        │         └── Table: master_products (id: source:sourceStoreId:externalProductId)
        │
        └──► MASTER CATALOG OPERATIONS & READ API
                  ├── GET /v1/catalog/stats (Estatísticas Globais)
                  ├── GET /v1/catalog/stores (Listagem Paginada de Lojas)
                  ├── GET /v1/catalog/stores/:id (Detalhes da Loja)
                  ├── GET /v1/catalog/stores/:id/products (Produtos da Loja)
                  ├── GET /v1/catalog/products (Filtros, Busca, Paginação)
                  └── GET /v1/catalog/products/:id (Produto por Chave Canônica)
```

## Escolha de Persistência: Cloudflare D1
- **Tecnologia:** Banco relacional SQL nativo do Cloudflare Workers (SQLite globalmente replicado).
- **Identidade Canônica da Loja:** `(source, source_store_id)` ➔ `${source}:${sourceStoreId}`.
- **Identidade Canônica do Produto:** `(source, source_store_id, external_product_id)` ➔ `${source}:${sourceStoreId}:${externalProductId}`.
- **Sincronização Segura:** Upsert atômico com transições de estado (`active`, `error`), contagem em tempo real e proteção contra exclusão inadvertida em coletas vazias.
