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
