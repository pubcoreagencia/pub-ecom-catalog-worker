import { Env } from "../types";
import { createCatalogStoreRepository, createMasterCatalogRepository } from "../master-catalog/repositoryFactory";

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function isAuthorized(request: Request, token?: string): boolean {
  const auth = request.headers.get("authorization") ?? "";
  if (!token) return false;
  return auth === `Bearer ${token}`;
}

export async function handleGetStats(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env?.CATALOG_WORKER_TOKEN)) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const storeRepo = createCatalogStoreRepository(env);
  const productRepo = createMasterCatalogRepository(env);

  const productCount = await productRepo.count();
  const stats = await storeRepo.getStats(productCount);

  const executionTimeMs = Date.now() - start;
  const storageProvider = env?.DB ? "d1" : "memory";

  return json({
    success: true,
    stats,
    metadata: {
      storageProvider,
      executionTimeMs,
    },
  }, { status: 200 });
}
