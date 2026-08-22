# PUB ECOM Catalog Worker

Adaptador e consumidor oficial do ecossistema PUB ECOM para ingestão de catálogos públicos.

---

## 🚀 Arquitetura Atual

O `pub-ecom-catalog-worker` não realiza mais scraping direto. Toda a responsabilidade de extração, resolução de ShopID e multi-provider reside no microserviço autônomo **`pub-shopee-scraper`**.

```text
PUB ECOM HUB / Client
        ↓
POST /ingestion/shopee (pub-ecom-catalog-worker)
        ↓
ShopeeScraperClient (HTTP / Service Binding)
        ↓
pub-shopee-scraper (https://pub-shopee-scraper.contato-pubcore.workers.dev)
        ↓
Apify / Browser Run Fallback
        ↓
Shopee Brasil Pública
```

---

## ⚙️ Variáveis de Ambiente & Secrets

| Nome | Tipo | Descrição |
| :--- | :--- | :--- |
| `CATALOG_WORKER_TOKEN` | Secret | Bearer Token para autenticação dos chamadores no `/ingestion/shopee` |
| `SHOPEE_SCRAPER_TOKEN` | Secret | Bearer Token para autenticação no `pub-shopee-scraper` |
| `SHOPEE_SCRAPER_URL` | Var (Opcional) | URL base do microserviço de scraping (Default: `https://pub-shopee-scraper.contato-pubcore.workers.dev`) |

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
      "description": null,
      "price": 40.32,
      "originalPrice": null,
      "stock": null,
      "sku": null,
      "images": ["https://down-br.img.susercontent.com/file/..."],
      "category": null,
      "sellerName": "Zentta Babuche",
      "metadata": {}
    }
  ],
  "metadata": {
    "totalFound": 3,
    "executionTimeMs": 9730,
    "provider": "apify",
    "costUsd": 0.0408,
    "requestId": "8a43748b-990a-43df-a29f-2c4d8bc51cc5",
    "fallbackUsed": false
  },
  "errors": []
}
```

---

## 🛠️ Comandos

```bash
# Instalar dependências
npm install

# Executar testes unitários (mocks isolados)
npm test

# Validar tipagem
npm run typecheck

# Validar build
npm run build

# Deploy no Cloudflare Workers
npm run deploy
```
