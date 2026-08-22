# PUB ECOM Catalog Worker

Adaptador e consumidor oficial do ecossistema PUB ECOM para ingestão de catálogos e persistência no **Master Catalog**.

---

## 🚀 Arquitetura Atual

```text
PUB ECOM HUB / Client
        ↓
POST /ingestion/shopee (pub-ecom-catalog-worker)
        ↓
ShopeeScraperClient (HTTP / Service Binding: SHOPEE_SCRAPER_SERVICE)
        ↓
pub-shopee-scraper (https://pub-shopee-scraper.contato-pubcore.workers.dev)
        ↓
ShopeeCatalogImporter ➔ D1MasterCatalogRepository (Cloudflare D1 SQL)
```

---

## ⚙️ Variáveis de Ambiente, Secrets e Bindings

| Nome | Tipo | Descrição |
| :--- | :--- | :--- |
| `CATALOG_WORKER_TOKEN` | Secret | Bearer Token para autenticação dos chamadores no `/ingestion/shopee` |
| `SHOPEE_SCRAPER_TOKEN` | Secret | Bearer Token para autenticação no `pub-shopee-scraper` |
| `SHOPEE_SCRAPER_URL` | Var (Opcional) | URL base do microserviço de scraping |
| `DB` | D1 Binding | Binding para o banco Cloudflare D1 `pub-ecom-master-catalog` |
| `SHOPEE_SCRAPER_SERVICE` | Service Binding | Binding direto para o worker `pub-shopee-scraper` |

---

## 📦 Endpoint

### `POST /ingestion/shopee`

**Header:**
```text
Authorization: Bearer <CATALOG_WORKER_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "url": "https://shopee.com.br/9r18ht6m88",
  "limit": 100
}
```

**Resposta:**
```json
{
  "success": true,
  "source": "shopee",
  "shopId": "1729928484",
  "items": [
    {
      "source": "shopee",
      "sourceStoreId": "1729928484",
      "externalProductId": "23299366739",
      "sourceProductUrl": "https://shopee.com.br/...",
      "title": "Babuche Infantil EVA",
      "price": 40.32,
      "images": ["https://down-br.img.susercontent.com/..."],
      "sellerName": "Zentta Babuche"
    }
  ],
  "masterCatalog": {
    "total": 3,
    "created": 0,
    "updated": 0,
    "unchanged": 3,
    "failed": 0,
    "storageProvider": "d1",
    "importDurationMs": 734
  },
  "metadata": {
    "totalFound": 3,
    "executionTimeMs": 8097,
    "provider": "apify",
    "costUsd": 0.0406,
    "requestId": "410acc87-ad4f-4e23-8e8d-01089030b1bd",
    "fallbackUsed": false,
    "storageProvider": "d1",
    "importDurationMs": 734
  },
  "errors": []
}
```

---

## 🛠️ Comandos

```bash
# Instalar dependências
npm install

# Executar testes unitários (19 testes isolados)
npm test

# Validar tipagem TypeScript
npm run typecheck

# Validar build
npm run build

# Executar migração D1 (remoto)
npx wrangler d1 execute pub-ecom-master-catalog --remote --file=./migrations/0001_create_master_products.sql

# Deploy no Cloudflare Workers
npm run deploy
```
