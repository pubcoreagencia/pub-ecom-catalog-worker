import { Env } from "../types";
import { createMasterCatalogRepository } from "../master-catalog/repositoryFactory";
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

export async function handleListProducts(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request, env?.CATALOG_WORKER_TOKEN)) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const url = new URL(request.url);
  const params = parseCatalogQueryParams(url);

  const repository = createMasterCatalogRepository(env);
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

export async function handleGetProductById(
  request: Request,
  env: Env,
  rawProductId: string
): Promise<Response> {
  if (!isAuthorized(request, env?.CATALOG_WORKER_TOKEN)) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const productId = decodeURIComponent(rawProductId);
  const repository = createMasterCatalogRepository(env);
  const item = await repository.findById(productId);

  if (!item) {
    return json({
      success: false,
      error: "Product not found",
      id: productId,
    }, { status: 404 });
  }

  return json({
    success: true,
    item,
  }, { status: 200 });
}
