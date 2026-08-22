# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2026-08-22 (Fase 2G - Master Catalog API)
### Added
- Dedicated read API endpoints `GET /v1/catalog/products` and `GET /v1/catalog/products/:id`.
- Parameterized SQL query builder `buildCatalogSqlQuery` with whitelist sorting (`updated_at`, `created_at`, `price`, `title`).
- Query filtering support: `source`, `sourceStoreId`, `search`, `category`, `seller`, `minPrice`, `maxPrice`.
- Standardized pagination metadata (`page`, `pageSize`, `total`, `totalPages`, `hasNextPage`, `hasPreviousPage`).
- Master Catalog API documentation in `docs/CATALOG_API.md`.
- 17 comprehensive unit tests in `tests/catalogApi.test.ts` (36 total tests across project).

## [2.0.0] - 2026-08-22 (Fase 2F.18 - Master Catalog Persistence)
### Added
- Persistent Master Catalog repository implementation (`D1MasterCatalogRepository`) using Cloudflare D1.
- Schema migration `0001_create_master_products.sql` with unique constraint `uq_canonical_product`.
