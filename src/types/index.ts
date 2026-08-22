export interface Env {
  CATALOG_WORKER_TOKEN: string;
  SHOPEE_SCRAPER_TOKEN: string;
  SHOPEE_SCRAPER_URL?: string;
  SHOPEE_SCRAPER_SERVICE?: Fetcher;
}

export interface IngestionRequest {
  url: string;
  limit?: number;
  pageSize?: number;
}

export interface RawProduct {
  source: "shopee";
  sourceStoreId: string | null;
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
}

export interface IngestionResponse {
  success: boolean;
  source: "shopee";
  shopId: string | null;
  items: RawProduct[];
  metadata: {
    pagesProcessed?: number;
    totalFound?: number;
    executionTimeMs?: number;
    provider?: string;
    costUsd?: number | null;
    requestId?: string;
    fallbackUsed?: boolean;
    [key: string]: unknown;
  };
  errors: string[];
}

export interface ShopeeScraperProduct {
  itemId: string;
  shopId: string | null;
  title: string;
  price: number | null;
  originalPrice: number | null;
  stock: number | null;
  sku: string | null;
  images: string[];
  category: string | null;
  sellerName: string | null;
  productUrl: string;
  metadata: Record<string, unknown>;
}

export interface ShopeeScraperResponse {
  success: boolean;
  requestId?: string;
  provider?: string;
  shop: {
    shopId: string | null;
    username: string | null;
    name: string | null;
  };
  products: ShopeeScraperProduct[];
  metadata?: {
    provider?: string;
    productsFound?: number;
    executionTimeMs?: number;
    costUsd?: number | null;
    fallbackUsed?: boolean;
    requestId?: string;
    [key: string]: unknown;
  };
  errors?: string[];
}

export interface ShopeeScraperClientInput {
  shopUrl?: string;
  shopUsername?: string;
  shopId?: string;
  limit?: number;
}
