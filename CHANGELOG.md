# Changelog

All notable changes to this project will be documented in this file.

## [2.3.0] - 2026-08-22 (Fase 2I - Master Catalog Sync Engine)
### Added
- Created `syncEngine.ts` coordinating ingestion lifecycle, locking, and state transitions.
- Store refresh endpoint `POST /v1/catalog/stores/:id/refresh` triggering extraction via `pub-shopee-scraper`.
- Concurrency protection using store locking (`sync_lock_until`, `sync_run_id`) returning HTTP 409 Conflict during active syncs.
- Migration `0003_add_store_sync_lock.sql` adding `sync_state`, `sync_lock_until`, and `sync_run_id`.
- Global stats endpoint updated with `sync` state distribution breakdown.
- 7 new unit tests in `tests/syncEngine.test.ts` (55 total tests).

## [2.2.0] - 2026-08-22 (Fase 2H - Master Catalog Operations & Stores)
### Added
- Created `catalog_stores` entity and migration `0002_create_catalog_stores.sql`.
- Store operations API: `GET /v1/catalog/stores`, `GET /v1/catalog/stores/:id`, `GET /v1/catalog/stores/:id/products`.
- Global stats endpoint: `GET /v1/catalog/stats`.
