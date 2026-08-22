# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-08-22 (Fase 2F.18 - Master Catalog Persistence)
### Added
- Persistent Master Catalog repository implementation (`D1MasterCatalogRepository`) using Cloudflare D1.
- Schema migration `0001_create_master_products.sql` with unique constraint `uq_canonical_product`.
- Repository factory `createMasterCatalogRepository` routing to D1 in production and in-memory for unit tests.
- Unit test suite for `D1MasterCatalogRepository` validating `findById`, `findByCanonicalKey`, `upsert`, `listBySource`, `count`, and `clear`.
- Production verification proving restart durability and zero duplication across re-imports.
