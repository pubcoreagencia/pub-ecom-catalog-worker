# Architecture — Master Catalog Persistence

## Diagrama da Arquitetura

```text
Shopee Pública (Brasil)
        ↓
PUB Shopee Scraper (https://pub-shopee-scraper.contato-pubcore.workers.dev)
        │  (Primary: Apify / Fallback: Cloudflare Browser Run)
        ▼
PUB ECOM Catalog Worker (POST /ingestion/shopee)
        │
        ├──► ShopeeScraperClient (HTTP / Service Binding: SHOPEE_SCRAPER_SERVICE)
        │
        ├──► ShopeeCatalogImporter
        │          │
        │          ▼
        └──► IMasterCatalogRepository
                   │
                   ├──► D1MasterCatalogRepository (Produção: Cloudflare D1 SQL)
                   │          └── Table: master_products (id: source:sourceStoreId:externalProductId)
                   │
                   └──► MemoryMasterCatalogRepository (Testes isolados)
```

## Escolha de Persistência: Cloudflare D1
- **Motivo:** Banco relacional SQL nativo do Cloudflare Workers (SQLite globalmente replicado), sem necessidade de connection poolers ou custos adicionais de rede.
- **Identidade Canônica:** `(source, source_store_id, external_product_id)` mapeada em constraint `UNIQUE` e chave primária `${source}:${sourceStoreId}:${externalProductId}`.
- **Upsert Atômico:** Executado via `INSERT INTO master_products (...) ON CONFLICT(id) DO UPDATE SET ...` prevenindo duplicações em coletas concorrentes.
- **Preservação de Timestamps:** `first_seen_at` e `created_at` mantidos imutáveis após inserção; `last_seen_at` atualizado a cada coleta; `updated_at` atualizado apenas mediante alterações reais no conteúdo do anúncio.
