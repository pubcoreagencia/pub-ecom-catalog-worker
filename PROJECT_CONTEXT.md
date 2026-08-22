# PUB ECOM Catalog Worker — Project Context

## Purpose

O `pub-ecom-catalog-worker` é a camada de integração do PUB ECOM responsável por receber pedidos de ingestão e delegar a extração para o microserviço autônomo `pub-shopee-scraper`.

## Architecture

```text
PUB ECOM HUB
   ↓
POST /ingestion/shopee
   ↓
PUB ECOM Catalog Worker
   ↓
ShopeeScraperClient (HTTP / Service Binding)
   ↓
PUB Shopee Scraper (pub-shopee-scraper)
   ↓
Apify / Browser Run Fallback
   ↓
Shopee Pública
```

## Decoupling Rules

1. O `pub-ecom-catalog-worker` não possui bindings de `BROWSER` nem executa Playwright diretamente.
2. O `pub-ecom-catalog-worker` não possui `APIFY_TOKEN`.
3. Todo scraping e resolução de ShopID é de responsabilidade do `pub-shopee-scraper`.
4. Comunicação autenticada via `SHOPEE_SCRAPER_TOKEN` e acelerada por Service Binding `SHOPEE_SCRAPER_SERVICE`.

## E2E Baseline

```text
PHASE=2F.16
STATUS=E2E_VALIDATED

Shopee scraping owner:
pub-shopee-scraper

ECOM role:
HTTP adapter / consumer

Primary provider:
Apify

Fallback:
Cloudflare Browser Run

Shop test:
9r18ht6m88

ShopID:
1729928484

Products validated:
>=3
```
