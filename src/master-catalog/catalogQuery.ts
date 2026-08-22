import { CatalogPagination, CatalogQueryParams, CatalogSortField, CatalogSortOrder } from "./types";

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;

export const ALLOWED_SORT_FIELDS = new Set<CatalogSortField>(["updated_at", "created_at", "price", "title"]);
export const ALLOWED_SORT_ORDERS = new Set<CatalogSortOrder>(["asc", "desc"]);

export function parseCatalogQueryParams(url: URL): CatalogQueryParams {
  const params = url.searchParams;

  let page = DEFAULT_PAGE;
  if (params.has("page")) {
    const rawPage = Number(params.get("page"));
    if (Number.isFinite(rawPage) && rawPage >= 1) {
      page = Math.floor(rawPage);
    }
  }

  let pageSize = DEFAULT_PAGE_SIZE;
  if (params.has("pageSize")) {
    const rawPageSize = Number(params.get("pageSize"));
    if (Number.isFinite(rawPageSize) && rawPageSize >= 1) {
      pageSize = Math.min(Math.floor(rawPageSize), MAX_PAGE_SIZE);
    }
  }

  let sort: CatalogSortField = "updated_at";
  if (params.has("sort")) {
    const rawSort = (params.get("sort") || "").trim().toLowerCase() as CatalogSortField;
    if (ALLOWED_SORT_FIELDS.has(rawSort)) {
      sort = rawSort;
    }
  }

  let order: CatalogSortOrder = "desc";
  if (params.has("order")) {
    const rawOrder = (params.get("order") || "").trim().toLowerCase() as CatalogSortOrder;
    if (ALLOWED_SORT_ORDERS.has(rawOrder)) {
      order = rawOrder;
    }
  }

  let minPrice: number | undefined;
  if (params.has("minPrice")) {
    const rawMinPrice = Number(params.get("minPrice"));
    if (Number.isFinite(rawMinPrice) && rawMinPrice >= 0) {
      minPrice = rawMinPrice;
    }
  }

  let maxPrice: number | undefined;
  if (params.has("maxPrice")) {
    const rawMaxPrice = Number(params.get("maxPrice"));
    if (Number.isFinite(rawMaxPrice) && rawMaxPrice >= 0) {
      maxPrice = rawMaxPrice;
    }
  }

  return {
    source: params.get("source")?.trim() || undefined,
    sourceStoreId: params.get("sourceStoreId")?.trim() || undefined,
    search: params.get("search")?.trim() || undefined,
    category: params.get("category")?.trim() || undefined,
    seller: params.get("seller")?.trim() || undefined,
    minPrice,
    maxPrice,
    page,
    pageSize,
    sort,
    order,
  };
}

export interface SqlQueryPlan {
  whereSql: string;
  dataSql: string;
  countSql: string;
  params: any[];
  limit: number;
  offset: number;
}

export function buildCatalogSqlQuery(params: CatalogQueryParams): SqlQueryPlan {
  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (params.source) {
    conditions.push("source = ?");
    queryParams.push(params.source.toLowerCase());
  }

  if (params.sourceStoreId) {
    conditions.push("source_store_id = ?");
    queryParams.push(params.sourceStoreId);
  }

  if (params.search) {
    conditions.push("title LIKE ?");
    queryParams.push(`%${params.search}%`);
  }

  if (params.category) {
    conditions.push("category LIKE ?");
    queryParams.push(`%${params.category}%`);
  }

  if (params.seller) {
    conditions.push("seller_name LIKE ?");
    queryParams.push(`%${params.seller}%`);
  }

  if (params.minPrice !== undefined) {
    conditions.push("price >= ?");
    queryParams.push(params.minPrice);
  }

  if (params.maxPrice !== undefined) {
    conditions.push("price <= ?");
    queryParams.push(params.maxPrice);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(*) as count FROM master_products ${whereSql}`;

  const sortColumn = params.sort && ALLOWED_SORT_FIELDS.has(params.sort) ? params.sort : "updated_at";
  const sortDirection = params.order && ALLOWED_SORT_ORDERS.has(params.order) ? params.order.toUpperCase() : "DESC";

  const page = params.page || DEFAULT_PAGE;
  const limit = params.pageSize || DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * limit;

  const dataSql = `SELECT * FROM master_products ${whereSql} ORDER BY ${sortColumn} ${sortDirection} LIMIT ? OFFSET ?`;

  return {
    whereSql,
    countSql,
    dataSql,
    params: queryParams,
    limit,
    offset,
  };
}

export function calculatePagination(total: number, page: number, pageSize: number): CatalogPagination {
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
