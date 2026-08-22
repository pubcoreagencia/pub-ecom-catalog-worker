import { StorePagination, StoreQueryParams, StoreSortField, StoreSortOrder } from "./types";

export const DEFAULT_STORE_PAGE = 1;
export const DEFAULT_STORE_PAGE_SIZE = 30;
export const MAX_STORE_PAGE_SIZE = 100;

export const ALLOWED_STORE_SORT_FIELDS = new Set<StoreSortField>([
  "updated_at",
  "created_at",
  "product_count",
  "name",
  "username",
  "last_sync_at",
]);
export const ALLOWED_STORE_SORT_ORDERS = new Set<StoreSortOrder>(["asc", "desc"]);

export function parseStoreQueryParams(url: URL): StoreQueryParams {
  const params = url.searchParams;

  let page = DEFAULT_STORE_PAGE;
  if (params.has("page")) {
    const rawPage = Number(params.get("page"));
    if (Number.isFinite(rawPage) && rawPage >= 1) {
      page = Math.floor(rawPage);
    }
  }

  let pageSize = DEFAULT_STORE_PAGE_SIZE;
  if (params.has("pageSize")) {
    const rawPageSize = Number(params.get("pageSize"));
    if (Number.isFinite(rawPageSize) && rawPageSize >= 1) {
      pageSize = Math.min(Math.floor(rawPageSize), MAX_STORE_PAGE_SIZE);
    }
  }

  let sort: StoreSortField = "updated_at";
  if (params.has("sort")) {
    const rawSort = (params.get("sort") || "").trim().toLowerCase() as StoreSortField;
    if (ALLOWED_STORE_SORT_FIELDS.has(rawSort)) {
      sort = rawSort;
    }
  }

  let order: StoreSortOrder = "desc";
  if (params.has("order")) {
    const rawOrder = (params.get("order") || "").trim().toLowerCase() as StoreSortOrder;
    if (ALLOWED_STORE_SORT_ORDERS.has(rawOrder)) {
      order = rawOrder;
    }
  }

  return {
    source: params.get("source")?.trim() || undefined,
    status: params.get("status")?.trim() || undefined,
    search: params.get("search")?.trim() || undefined,
    page,
    pageSize,
    sort,
    order,
  };
}

export interface StoreSqlQueryPlan {
  whereSql: string;
  dataSql: string;
  countSql: string;
  params: any[];
  limit: number;
  offset: number;
}

export function buildStoreSqlQuery(params: StoreQueryParams): StoreSqlQueryPlan {
  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (params.source) {
    conditions.push("source = ?");
    queryParams.push(params.source.toLowerCase());
  }

  if (params.status) {
    conditions.push("status = ?");
    queryParams.push(params.status.toLowerCase());
  }

  if (params.search) {
    conditions.push("(username LIKE ? OR name LIKE ? OR source_store_id LIKE ?)");
    const pattern = `%${params.search}%`;
    queryParams.push(pattern, pattern, pattern);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(*) as count FROM catalog_stores ${whereSql}`;

  const sortColumn = params.sort && ALLOWED_STORE_SORT_FIELDS.has(params.sort) ? params.sort : "updated_at";
  const sortDirection = params.order && ALLOWED_STORE_SORT_ORDERS.has(params.order) ? params.order.toUpperCase() : "DESC";

  const page = params.page || DEFAULT_STORE_PAGE;
  const limit = params.pageSize || DEFAULT_STORE_PAGE_SIZE;
  const offset = (page - 1) * limit;

  const dataSql = `SELECT * FROM catalog_stores ${whereSql} ORDER BY ${sortColumn} ${sortDirection} LIMIT ? OFFSET ?`;

  return {
    whereSql,
    countSql,
    dataSql,
    params: queryParams,
    limit,
    offset,
  };
}

export function calculateStorePagination(total: number, page: number, pageSize: number): StorePagination {
  const safeTotal = Math.max(0, total);
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.ceil(safeTotal / safePageSize) || 1;
  const safePage = Math.max(1, page);

  return {
    page: safePage,
    pageSize: safePageSize,
    total: safeTotal,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1 && safePage <= totalPages,
  };
}
