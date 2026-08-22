# PUB ECOM Catalog Worker

Adaptador e consumidor oficial do ecossistema PUB ECOM para ingestão de catálogos e API de leitura do **Master Catalog**.

---

## 🚀 Arquitetura Atual

```text
PUB ECOM HUB / Consumidores
        │
        ├──► Leitura do Catálogo
        │      ├── GET /v1/catalog/products (Filtros, Busca, Paginação)
        │      └── GET /v1/catalog/products/:id (Recuperação por Chave Canônica)
        │
        └──► Ingestão de Lojas
               └── POST /ingestion/shopee ➔ pub-shopee-scraper ➔ D1 (Master Catalog)
```

---

## ⚙️ Variáveis de Ambiente, Secrets e Bindings

| Nome | Tipo | Descrição |
| :--- | :--- | :--- |
| `CATALOG_WORKER_TOKEN` | Secret | Bearer Token para autenticação dos chamadores da API |
| `SHOPEE_SCRAPER_TOKEN` | Secret | Bearer Token para autenticação no `pub-shopee-scraper` |
| `SHOPEE_SCRAPER_URL` | Var (Opcional) | URL base do microserviço de scraping |
| `DB` | D1 Binding | Binding para o banco Cloudflare D1 `pub-ecom-master-catalog` |
| `SHOPEE_SCRAPER_SERVICE` | Service Binding | Binding direto para o worker `pub-shopee-scraper` |

---

## 📦 Endpoints Principais

### 1. `GET /v1/catalog/products`
Consulta paginada com suporte a filtros: `source`, `sourceStoreId`, `search`, `category`, `seller`, `minPrice`, `maxPrice`, `sort`, `order`, `page`, `pageSize`.

### 2. `GET /v1/catalog/products/:id`
Recuperação direta de produto através de sua chave canônica (`shopee:1729928484:23299366739`).

### 3. `POST /ingestion/shopee`
Ingestão de catálogo a partir de URL de loja Shopee Brasil com persistência atômica no Cloudflare D1.

Consulte a especificação completa em [docs/CATALOG_API.md](docs/CATALOG_API.md).

---

## 🛠️ Comandos

```bash
# Instalar dependências
npm install

# Executar suíte de testes unitários (36 testes isolados)
npm test

# Validar tipagem TypeScript
npm run typecheck

# Validar build
npm run build

# Deploy no Cloudflare Workers
npm run deploy
```
