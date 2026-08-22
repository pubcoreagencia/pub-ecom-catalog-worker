export interface MasterProduct {
  id: string; // Canonical key: `${source}:${sourceStoreId}:${externalProductId}`
  source: "shopee" | string;
  sourceStoreId: string;
  externalProductId: string;
  sourceProductUrl: string;
  title: string;
  description: string | null;
  price: number | null;
  originalPrice: number | null;
  stock: number | null;
  sku: string | null;
  images: string[];
  category: string | null;
  sellerName: string | null;
  metadata: Record<string, unknown>;
  firstSeenAt: string; // ISO 8601
  lastSeenAt: string;  // ISO 8601
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}

export interface ImportStats {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
}

export interface ImportResult {
  success: boolean;
  source: string;
  sourceStoreId: string | null;
  stats: ImportStats;
  products: MasterProduct[];
  errors: string[];
  importedAt: string;
}

export type CatalogSortField = "updated_at" | "created_at" | "price" | "title";
export type CatalogSortOrder = "asc" | "desc";

export interface CatalogQueryParams {
  source?: string;
  sourceStoreId?: string;
  search?: string;
  category?: string;
  seller?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
  sort?: CatalogSortField;
  order?: CatalogSortOrder;
}

export interface CatalogPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface CatalogQueryResult {
  items: MasterProduct[];
  pagination: CatalogPagination;
}

export type StoreStatus = "active" | "inactive" | "error" | "unknown";
export type StoreSyncStatus = "success" | "partial" | "error";
export type SyncState = "idle" | "running" | "success" | "partial" | "error";

export interface CatalogStore {
  id: string; // Canonical key: `${source}:${sourceStoreId}`
  source: "shopee" | string;
  sourceStoreId: string;
  username: string | null;
  name: string | null;
  storeUrl: string | null;
  status: StoreStatus;
  productCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSyncAt: string | null;
  lastSyncStatus: StoreSyncStatus | null;
  lastSyncError: string | null;
  syncState: SyncState;
  syncLockUntil: string | null;
  syncRunId: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export type StoreSortField = "updated_at" | "created_at" | "product_count" | "name" | "username" | "last_sync_at";
export type StoreSortOrder = "asc" | "desc";

export interface StoreQueryParams {
  source?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: StoreSortField;
  order?: StoreSortOrder;
}

export interface StorePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface StoreQueryResult {
  items: CatalogStore[];
  pagination: StorePagination;
}

export interface CatalogStats {
  products: number;
  stores: number;
  activeStores: number;
  errorStores: number;
  sources: Record<string, { products: number; stores: number }>;
  sync: Record<SyncState, number>;
}

export interface SyncResult {
  success: boolean;
  store: CatalogStore;
  sync: {
    syncRunId: string;
    provider?: string;
    productsFound: number;
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
    durationMs: number;
  };
  error?: string;
}

export function buildCanonicalProductId(
  source: string,
  sourceStoreId: string | null | undefined,
  externalProductId: string
): string {
  const cleanSource = (source || "unknown").trim().toLowerCase();
  const cleanStore = (sourceStoreId || "unknown").trim();
  const cleanItem = (externalProductId || "").trim();
  return `${cleanSource}:${cleanStore}:${cleanItem}`;
}

export function buildCanonicalStoreId(
  source: string,
  sourceStoreId: string | null | undefined
): string {
  const cleanSource = (source || "unknown").trim().toLowerCase();
  const cleanStore = (sourceStoreId || "unknown").trim();
  return `${cleanSource}:${cleanStore}`;
}
