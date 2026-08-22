# Master Catalog Operations & Stores Specification

Este documento detalha os fluxos operacionais, gerenciamento de lojas (`catalog_stores`), estatísticas globais (`/v1/catalog/stats`) e o ciclo de sincronização do **Master Catalog** no PUB ECOM.

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
| `product_count` | `INTEGER` | Contagem total de produtos ativos no Master Catalog |
| `first_seen_at` | `TEXT NOT NULL` | Data/hora ISO 8601 da primeira descoberta |
| `last_seen_at` | `TEXT NOT NULL` | Data/hora ISO 8601 do último contato |
| `last_sync_at` | `TEXT` | Data/hora ISO 8601 da última sincronização |
| `last_sync_status` | `TEXT` | `success`, `partial`, `error` |
| `last_sync_error` | `TEXT` | Mensagem de erro caso a sincronização falhe |
| `created_at` | `TEXT NOT NULL` | Data de criação do registro |
| `updated_at` | `TEXT NOT NULL` | Data de última atualização |
| `metadata` | `TEXT NOT NULL` | JSON com dados complementares |

---

## 🚀 Endpoints Operacionais

### 1. Listar Lojas do Catálogo

```http
GET /v1/catalog/stores
```

#### Query Parameters

- `source`: filtra por origem (ex: `shopee`)
- `status`: filtra por status (`active`, `inactive`, `error`)
- `search`: busca textual por `username`, `name` ou `sourceStoreId`
- `page`: número da página (default: 1)
- `pageSize`: itens por página (default: 30, max: 100)
- `sort`: `updated_at`, `created_at`, `product_count`, `name`, `username`, `last_sync_at`
- `order`: `asc`, `desc`

#### Exemplo de Resposta (HTTP 200 OK)

```json
{
  "success": true,
  "items": [
    {
      "id": "shopee:1729928484",
      "source": "shopee",
      "sourceStoreId": "1729928484",
      "username": "9r18ht6m88",
      "name": "Zentta Babuche",
      "storeUrl": "https://shopee.com.br/9r18ht6m88",
      "status": "active",
      "productCount": 3,
      "firstSeenAt": "2026-08-22T10:43:12.406Z",
      "lastSeenAt": "2026-08-22T10:55:00.000Z",
      "lastSyncAt": "2026-08-22T10:55:00.000Z",
      "lastSyncStatus": "success",
      "lastSyncError": null
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 30,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "metadata": {
    "storageProvider": "d1",
    "executionTimeMs": 6
  }
}
```

---

### 2. Buscar Loja por ID Canônico

```http
GET /v1/catalog/stores/:id
```

Retorna os detalhes completos da loja ou **HTTP 404** se não encontrada.

---

### 3. Listar Produtos de uma Loja Específica

```http
GET /v1/catalog/stores/:id/products
```

Aplica os filtros de `GET /v1/catalog/products` escopados exclusivamente para a loja informada.

---

### 4. Estatísticas Globais do Catálogo

```http
GET /v1/catalog/stats
```

#### Exemplo de Resposta (HTTP 200 OK)

```json
{
  "success": true,
  "stats": {
    "products": 3,
    "stores": 1,
    "activeStores": 1,
    "errorStores": 0,
    "sources": {
      "shopee": {
        "products": 3,
        "stores": 1
      }
    }
  },
  "metadata": {
    "storageProvider": "d1",
    "executionTimeMs": 5
  }
}
```

---

### 5. Trigger Manual de Refresh (Arquitetura Futura)

```http
POST /v1/catalog/stores/:id/refresh
```

Retorna **HTTP 501 Not Implemented**. O refresh em lote/agendado será acoplado via Filas/Cloudflare Queues em fases futuras. Para ingestão imediata, utilize `POST /ingestion/shopee`.

---

## 🔄 Ciclo de Sincronização & Proteção do Catálogo

1. **Catálogo Vazio:** Se uma coleta retornar 0 produtos, o catálogo anterior é preservado e a loja permanece `status: active` com `last_sync_status: success`.
2. **Falha de Scraping:** Se o provedor/scraper falhar, a loja é marcada com `last_sync_status: error` e `status: error`, mas **nenhum produto existente é apagado**.
3. **Idempotência:** Múltiplas coletas da mesma loja nunca duplicam a entrada em `catalog_stores` ou em `master_products`.
