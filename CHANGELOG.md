# Changelog

All notable changes to this project will be documented in this file.

## [2.2.0] - 2026-08-22 (Fase 2H - Master Catalog Operations & Stores)
### Added
- Created `catalog_stores` entity and migration `0002_create_catalog_stores.sql`.
- Store operations API: `GET /v1/catalog/stores`, `GET /v1/catalog/stores/:id`, `GET /v1/catalog/stores/:id/products`.
- Global stats endpoint: `GET /v1/catalog/stats`.
- Ingestion pipeline store integration: automatically upserts store and maintains accurate `product_count` and `last_sync_status`.
- 12 new unit tests covering stores, store products, and catalog stats (48 total tests).
- Operations documentation in `docs/CATALOG_OPERATIONS.md`.

## [2.1.0] - 2026-08-22 (Fase 2G - Master Catalog API)
### Added
- Dedicated read API endpoints `GET /v1/catalog/products` and `GET /v1/catalog/products/:id`.
- Parameterized SQL query builder `buildCatalogSqlQuery`.
