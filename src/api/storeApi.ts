import { Env } from "../types";
import { createCatalogStoreRepository, createMasterCatalogRepository } from "../master-catalog/repositoryFactory";
import { parseStoreQueryParams } from "../master-catalog/storeQuery";
import { parseCatalogQueryParams } from "../master-catalog/catalogQuery";

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

export async function handleListStores(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env?.CATALOG_WORKER_TOKEN)) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const url = new URL(request.url);
  const params = parseStoreQueryParams(url);

  const repository = createCatalogStoreRepository(env);
  const queryResult = await repository.query(params);

  const executionTimeMs = Date.now() - start;
  const storageProvider = env?.DB ? "d1" : "memory";

  return json({
    success: true,
    items: queryResult.items,
    pagination: queryResult.pagination,
    metadata: {
      storageProvider,
      executionTimeMs,
    },
  }, { status: 200 });
}

export async function handleGetStoreById(
  request: Request,
  env: Env,
  rawStoreId: string
): Promise<Response> {
  if (!isAuthorized(request, env?.CATALOG_WORKER_TOKEN)) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const storeId = decodeURIComponent(rawStoreId);
  const repository = createCatalogStoreRepository(env);
  const item = await repository.findById(storeId);

  if (!item) {
    return json({
      success: false,
      error: "Store not found",
      id: storeId,
    }, { status: 404 });
  }

  return json({
    success: true,
    item,
  }, { status: 200 });
}

export async function handleGetStoreProducts(
  request: Request,
  env: Env,
  rawStoreId: string
): Promise<Response> {
  if (!isAuthorized(request, env?.CATALOG_WORKER_TOKEN)) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const storeId = decodeURIComponent(rawStoreId);
  const storeRepo = createCatalogStoreRepository(env);
  const store = await storeRepo.findById(storeId);

  if (!store) {
    return json({
      success: false,
      error: "Store not found",
      id: storeId,
    }, { status: 404 });
  }

  const url = new URL(request.url);
  const params = parseCatalogQueryParams(url);

  // Force scope to store
  params.source = store.source;
  params.sourceStoreId = store.sourceStoreId;

  const productRepo = createMasterCatalogRepository(env);
  const queryResult = await productRepo.query(params);

  const executionTimeMs = Date.now() - start;
  const storageProvider = env?.DB ? "d1" : "memory";

  return json({
    success: true,
    store: {
      id: store.id,
      name: store.name,
      username: store.username,
      status: store.status,
    },
    items: queryResult.items,
    pagination: queryResult.pagination,
    metadata: {
      storageProvider,
      executionTimeMs,
    },
  }, { status: 200 });
}

export async function handleRefreshStore(
  request: Request,
  env: Env,
  rawStoreId: string
): Promise<Response> {
  if (!isAuthorized(request, env?.CATALOG_WORKER_TOKEN)) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const storeId = decodeURIComponent(rawStoreId);
  return json({
    success: false,
    error: "Scheduled store refresh is not implemented yet. Trigger ingestion via POST /ingestion/shopee.",
    id: storeId,
  }, { status: 501 });
}
