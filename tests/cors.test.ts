import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { isOriginAllowed, getCorsHeaders, handleCorsPreflight } from "../src/cors.js";

test("1. isOriginAllowed valida corretamente a allowlist", () => {
  // Allowed
  assert.equal(isOriginAllowed("http://localhost"), true);
  assert.equal(isOriginAllowed("http://localhost:5173"), true);
  assert.equal(isOriginAllowed("http://localhost:3000"), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:8080"), true);
  assert.equal(isOriginAllowed("https://pubecomhub.lovable.app"), true);
  assert.equal(isOriginAllowed("https://preview--pubecomhub.lovable.app"), true);
  assert.equal(isOriginAllowed("https://my-preview.lovableproject.com"), true);
  assert.equal(isOriginAllowed("https://app.lovable.dev"), true);

  // Disallowed
  assert.equal(isOriginAllowed("https://malicious.com"), false);
  assert.equal(isOriginAllowed("http://lovable.app.evil.com"), false);
  assert.equal(isOriginAllowed(null), false);
  assert.equal(isOriginAllowed(undefined), false);
  assert.equal(isOriginAllowed(""), false);
});

test("2. handleCorsPreflight responde 204 para origens permitidas", () => {
  const req = new Request("https://pub-ecom-catalog-worker.internal/ingestion/shopee", {
    method: "OPTIONS",
    headers: {
      Origin: "https://pubecomhub.lovable.app",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });

  const res = handleCorsPreflight(req);
  assert.ok(res);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://pubecomhub.lovable.app");
  assert.ok(res.headers.get("Access-Control-Allow-Methods")?.includes("POST"));
  assert.ok(res.headers.get("Access-Control-Allow-Headers")?.toLowerCase().includes("authorization"));
  assert.ok(res.headers.get("Access-Control-Allow-Headers")?.toLowerCase().includes("content-type"));
  assert.equal(res.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.equal(res.headers.get("Access-Control-Max-Age"), "86400");
});

test("3. handleCorsPreflight responde 403 para origens não permitidas", () => {
  const req = new Request("https://pub-ecom-catalog-worker.internal/ingestion/shopee", {
    method: "OPTIONS",
    headers: {
      Origin: "https://attacker.com",
      "Access-Control-Request-Method": "POST",
    },
  });

  const res = handleCorsPreflight(req);
  assert.ok(res);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});

test("4. Worker fetch aplica CORS em respostas 200 OK", async () => {
  const req = new Request("https://pub-ecom-catalog-worker.internal/health", {
    method: "GET",
    headers: {
      Origin: "https://pubecomhub.lovable.app",
    },
  });

  const res = await worker.fetch(req, {} as any);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://pubecomhub.lovable.app");
  assert.equal(res.headers.get("Vary"), "Origin");
});

test("5. Worker fetch aplica CORS em respostas 401 Unauthorized", async () => {
  const req = new Request("https://pub-ecom-catalog-worker.internal/ingestion/shopee", {
    method: "POST",
    headers: {
      Origin: "https://pubecomhub.lovable.app",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: "https://shopee.com.br/shop/123" }),
  });

  const res = await worker.fetch(req, { CATALOG_WORKER_TOKEN: "secret" } as any);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://pubecomhub.lovable.app");
});

test("6. Worker fetch aplica CORS em respostas 404 Not Found", async () => {
  const req = new Request("https://pub-ecom-catalog-worker.internal/v1/catalog/stores/shopee:999999", {
    method: "GET",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: "Bearer test",
    },
  });

  const res = await worker.fetch(req, { CATALOG_WORKER_TOKEN: "test" } as any);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
});

test("7. Worker fetch NÃO inclui CORS para origens não permitidas", async () => {
  const req = new Request("https://pub-ecom-catalog-worker.internal/health", {
    method: "GET",
    headers: {
      Origin: "https://unauthorized-domain.com",
    },
  });

  const res = await worker.fetch(req, {} as any);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
});
