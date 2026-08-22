# Changelog

All notable changes to this project will be documented in this file.

## [2.3.1] - 2026-08-22 (Fase 2I.1 - Hardening de Consistência do Sync Engine)
### Fixed
- Atomic lock acquisition (`acquireSyncLock`) on D1 preventing race conditions.
- Ownership-based lock release (`releaseSyncLock`) requiring matching `sync_run_id`.
- Decoupled `ShopeeCatalogImporter` from `syncState` and `syncLockUntil` management.
- Store-scoped product count (`countBySourceStore`) isolating counts per store.
- Zero orphan `shopee:unknown` protection by resolving ShopID before store persistence.
- Empty catalog & error protection ensuring historical products and product counts remain intact.
