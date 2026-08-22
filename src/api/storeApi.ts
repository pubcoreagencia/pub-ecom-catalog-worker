import { Env } from "../types";
import { createCatalogStoreRepository, createMasterCatalogRepository } from "../master-catalog/repositoryFactory";
import { parseStoreQueryParams } from "../master-catalog/storeQuery";
import { parseCatalogQueryParams } from "../master-catalog/catalogQuery";
import { StoreSyncConflictError, syncStore } from "../master-catalog/syncEngine";

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
      syncState: store.syncState,
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
  const storeRepo = createCatalogStoreRepository(env);
  const existingStore = await storeRepo.findById(storeId);

  if (!existingStore) {
    return json({
      success: false,
      error: "Store not found",
      id: storeId,
    }, { status: 404 });
  }

  try {
    const result = await syncStore({
      storeId,
      source: existingStore.source as "shopee",
      sourceStoreId: existingStore.sourceStoreId,
      shopUrl: existingStore.storeUrl || undefined,
      shopUsername: existingStore.username || undefined,
      env,
    });

    if (!result.success) {
      return json({
        success: false,
        error: result.error,
        store: {
          id: result.store.id,
          source: result.store.source,
          sourceStoreId: result.store.sourceStoreId,
          username: result.store.username,
          name: result.store.name,
          status: result.store.status,
          syncState: result.store.syncState,
          productCount: result.store.productCount,
        },
        sync: result.sync,
      }, { status: 502 });
    }

    return json({
      success: true,
      store: {
        id: result.store.id,
        source: result.store.source,
        sourceStoreId: result.store.sourceStoreId,
        username: result.store.username,
        name: result.store.name,
        status: result.store.status,
        syncState: result.store.syncState,
        productCount: result.store.productCount,
      },
      sync: result.sync,
    }, { status: 200 });
  } catch (err) {
    if (err instanceof StoreSyncConflictError) {
      return json({
        success: false,
        error: "Store sync already running",
        storeId: err.storeId,
        syncRunId: err.syncRunId,
      }, { status: 409 });
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    return json({
      success: false,
      error: errMsg,
      storeId,
    }, { status: 502 });
  }
}
