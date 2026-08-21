# PUB ECOM Catalog Worker

Infraestrutura independente para execução de browser automation do PUB ECOM, inicialmente focada em ingestão de catálogo Shopee.

## Arquitetura

```text
PUB ECOM HUB
    ↓
CloudflareExecutionProvider
    ↓
POST /ingestion/shopee
    ↓
Cloudflare Worker
    ↓
Browser Run + Playwright
    ↓
Shopee
    ↓
RawProduct[]
```

## Requisitos

- Conta Cloudflare com Browser Run habilitado.
- Wrangler atual.
- Secret `CATALOG_WORKER_TOKEN` configurado no Worker.

A configuração atual usa `@cloudflare/playwright` com Browser Run binding. A Cloudflare documenta `nodejs_compat` para uso dessa biblioteca e browser binding em Wrangler. Consulte a documentação oficial antes do deploy para conferir limites e mudanças de runtime.

## Desenvolvimento

```bash
npm install
npm run typecheck
npm run dev
```

Para testar Browser Run real localmente:

```bash
npm run dev:remote
```

## Secret

```bash
npx wrangler secret put CATALOG_WORKER_TOKEN
```

Nunca comite o valor do token.

## Endpoint

`POST /ingestion/shopee`

Header:

```text
Authorization: Bearer <CATALOG_WORKER_TOKEN>
```

Body:

```json
{
  "url": "https://shopee.com.br/9r18ht6m88",
  "limit": 100,
  "pageSize": 30
}
```

## Segurança

O Worker aceita somente hosts `shopee.com.br` e subdomínios legítimos desse domínio. URLs locais, IPs privados, metadata endpoints e esquemas não HTTP/HTTPS devem ser rejeitados.

O Worker não implementa CAPTCHA bypass, stealth, fingerprint spoofing ou mecanismos de anti-detection.

## Deploy

```bash
npm run deploy
```

Depois do deploy, configurar a URL resultante como `CATALOG_WORKER_URL` no backend do PUB ECOM HUB e o mesmo token em `CATALOG_WORKER_TOKEN`.

## Status

Scaffold e endpoint inicial implementados. O próximo marco é validar o Browser Run real com uma loja Shopee pública e registrar o resultado objetivo, incluindo quantidade de produtos, páginas, duração e bloqueios.
