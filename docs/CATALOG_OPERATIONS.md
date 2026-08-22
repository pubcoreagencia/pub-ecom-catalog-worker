# Master Catalog Operations & Stores Specification

Este documento detalha os fluxos operacionais, gerenciamento de lojas (`catalog_stores`), estatísticas globais (`/v1/catalog/stats`) e o ciclo de sincronização resiliente e atômico do **Master Catalog** no PUB ECOM.

---

## 🏛️ Entidade Loja (`catalog_stores`)

Toda loja do ecossistema é identificada pela sua chave canônica `${source}:${sourceStoreId}` (ex: `shopee:1729928484`).

### Schema D1 (`catalog_stores`)

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `TEXT PRIMARY KEY` | Chave canônica `${source}:${sourceStoreId}` |
| `source` | `TEXT NOT NULL` | Origem da loja (ex: `shopee`) |
| `source_store_id` | `TEXT NOT NULL` | ID numérico da loja na plataforma de origem |
| `username` | `TEXT` | Handle ou username amigável da loja |
| `name` | `TEXT` | Nome exibido da loja |
| `store_url` | `TEXT` | URL pública da loja |
| `status` | `TEXT NOT NULL` | `active`, `inactive`, `error`, `unknown` |
| `product_count` | `INTEGER` | Contagem de produtos pertencentes exclusivamente a esta loja |
| `first_seen_at` | `TEXT NOT NULL` | Data/hora ISO 8601 da primeira descoberta |
| `last_seen_at` | `TEXT NOT NULL` | Data/hora ISO 8601 do último contato |
| `last_sync_at` | `TEXT` | Data/hora ISO 8601 da última sincronização |
| `last_sync_status` | `TEXT` | `success`, `partial`, `error` |
| `last_sync_error` | `TEXT` | Mensagem de erro sanitizada caso a sincronização falhe |
| `sync_state` | `TEXT NOT NULL` | `idle`, `running`, `success`, `partial`, `error` |
| `sync_lock_until` | `TEXT` | Timestamp ISO 8601 de expiração do lock atômico (TTL: 10 min) |
| `sync_run_id` | `TEXT` | UUID da execução ativa de sincronização |
| `created_at` | `TEXT NOT NULL` | Data de criação do registro |
| `updated_at` | `TEXT NOT NULL` | Data de última atualização |
| `metadata` | `TEXT NOT NULL` | JSON com dados complementares |

---

## 🔒 Garantias de Consistência e Concorrência

1. **Lock Atômico (`acquireSyncLock`):**
   - A reserva de lock é realizada com condição atômica SQL no Cloudflare D1 (`WHERE sync_lock_until IS NULL OR sync_lock_until <= ?`).
   - Evita condições de corrida em disparos concorrentes. Se uma sincronização estiver ativa, requisições subsequentes recebem **HTTP 409 Conflict**.
2. **Ownership de Liberação (`releaseSyncLock`):**
   - O lock só é liberado no `finally` se o `sync_run_id` no banco coincidir exatamente com a execução atual (`WHERE sync_run_id = ?`). Uma execução demorada/expirada não derruba o lock de uma execução mais nova.
3. **Desacoplamento de Responsabilidades:**
   - `ShopeeCatalogImporter`: Responsável exclusivo por upsert de `master_products` e metadados descritivos da loja. Não altera `sync_state` ou `sync_lock_until`.
   - `SyncEngine`: Responsável exclusivo pelo ciclo de vida, lock atômico, contagem de produtos da loja (`countBySourceStore`) e estados do sync.
4. **Isolamento de Contagem por Loja (`countBySourceStore`):**
   - O `product_count` da loja reflete única e exclusivamente os produtos pertencentes a `(source, source_store_id)`.
5. **Proteção de Catálogo Vazio e Erro:**
   - Coletas que retornem 0 produtos ou falhem na rede preservam 100% dos produtos históricos e o `product_count` anterior.
