import { IngestionResponse, RawProduct, ShopeeScraperResponse } from "../types";

export function mapShopeeScraperResponseToIngestion(
  response: ShopeeScraperResponse,
  fallbackShopId: string | null = null
): IngestionResponse {
  const products = Array.isArray(response.products) ? response.products : [];
  const resolvedShopId = response.shop?.shopId || fallbackShopId;

  const items: RawProduct[] = products.map((p) => ({
    source: "shopee",
    sourceStoreId: p.shopId || resolvedShopId,
    externalProductId: p.itemId,
    sourceProductUrl: p.productUrl,
    title: p.title,
    description: null,
    price: p.price,
    originalPrice: p.originalPrice ?? null,
    stock: p.stock ?? null,
    sku: p.sku ?? null,
    images: Array.isArray(p.images) ? p.images : [],
    category: p.category ?? null,
    sellerName: p.sellerName ?? response.shop?.name ?? null,
    metadata: p.metadata ?? {},
  }));

  return {
    success: response.success,
    source: "shopee",
    shopId: resolvedShopId,
    items,
    metadata: {
      totalFound: items.length,
      executionTimeMs: response.metadata?.executionTimeMs,
      provider: response.provider || response.metadata?.provider,
      costUsd: response.metadata?.costUsd,
      requestId: response.requestId || response.metadata?.requestId,
      fallbackUsed: response.metadata?.fallbackUsed,
    },
    errors: Array.isArray(response.errors) ? response.errors : [],
  };
}
