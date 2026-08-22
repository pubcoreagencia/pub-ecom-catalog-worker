# PUB ECOM Catalog Worker

Microserviço e adaptador oficial do ecossistema PUB ECOM para ingestão, gerenciamento de lojas (`catalog_stores`) e API operacional do **Master Catalog**.

---

## 🚀 Arquitetura Atual

```text
PUB ECOM HUB / Clientes
        │
        ├──► Operações & Leitura
        │      ├── GET /v1/catalog/stats (Métricas Globais)
        │      ├── GET /v1/catalog/stores (Listagem e Busca de Lojas)
        │      ├── GET /v1/catalog/stores/:id (Detalhes da Loja)
        │      ├── GET /v1/catalog/stores/:id/products (Produtos da Loja)
        │      ├── GET /v1/catalog/products (Filtros, Busca, Paginação)
        │      └── GET /v1/catalog/products/:id (Recuperação por Chave Canônica)
        │
        └──► Ingestão de Catálogos
               └── POST /ingestion/shopee ➔ pub-shopee-scraper ➔ D1 (Stores + Products)
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

Consulte as especificações detalhadas:
- [docs/CATALOG_API.md](docs/CATALOG_API.md) — API de Produtos
- [docs/CATALOG_OPERATIONS.md](docs/CATALOG_OPERATIONS.md) — API de Lojas e Estatísticas

---

## 🛠️ Comandos

```bash
# Instalar dependências
npm install

# Executar suíte de testes unitários (48 testes isolados)
npm test

# Validar tipagem TypeScript
npm run typecheck

# Validar build
npm run build

# Aplicar migrações D1 (remoto)
npx wrangler d1 execute pub-ecom-master-catalog --remote --file=./migrations/0002_create_catalog_stores.sql

# Deploy no Cloudflare Workers
npm run deploy
```
