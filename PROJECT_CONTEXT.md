# PUB ECOM Catalog Worker — Project Context

## Purpose

Independent Cloudflare Worker infrastructure for PUB ECOM catalog ingestion. The main consumer is `pubcoreagencia/pubecomhub`.

## Current Scope

- Cloudflare Workers
- Browser Run browser binding
- `@cloudflare/playwright`
- `POST /ingestion/shopee`
- Bearer-token authentication
- Strict Shopee hostname validation
- Raw product extraction contract

## Architecture

```text
PUB ECOM HUB
  ↓
CloudflareExecutionProvider
  ↓
POST /ingestion/shopee
  ↓
PUB ECOM Catalog Worker
  ↓
Cloudflare Browser Run
  ↓
Shopee
  ↓
RawProduct[]
```

## Security Rules

The worker must reject arbitrary hosts, private/local addresses, unsafe schemes, missing/invalid authorization, and must not become an open SSRF proxy.

No CAPTCHA bypass, stealth, fingerprint spoofing, anti-detection, credential reuse, or other attempts to defeat platform protections are part of the design.

## Current Status

Scaffold and first endpoint are committed. Browser Run execution has not yet been validated against a real Shopee store from the deployed Worker.

The first real test target is:

`https://shopee.com.br/9r18ht6m88`

Success must be demonstrated with measured product results. A block must be recorded as a real blocker rather than replaced with mock data.

## Git Continuity

Every meaningful change must be committed and pushed. Future agents should read this file and `README.md` before making changes.
