import { IMasterCatalogRepository } from "../repository";
import { buildCanonicalProductId, CatalogQueryParams, CatalogQueryResult, MasterProduct } from "../types";
import { buildCatalogSqlQuery, calculatePagination, DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "../catalogQuery";

interface D1Row {
  id: string;
  source: string;
  source_store_id: string;
  external_product_id: string;
  source_product_url: string;
  title: string;
  description: string | null;
  price: number | null;
  original_price: number | null;
  stock: number | null;
  sku: string | null;
  images: string;
  category: string | null;
  seller_name: string | null;
  metadata: string;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

function mapRowToProduct(row: D1Row): MasterProduct {
  let parsedImages: string[] = [];
  try {
    parsedImages = JSON.parse(row.images);
    if (!Array.isArray(parsedImages)) parsedImages = [];
  } catch {
    parsedImages = [];
  }

  let parsedMetadata: Record<string, unknown> = {};
  try {
    parsedMetadata = JSON.parse(row.metadata);
    if (!parsedMetadata || typeof parsedMetadata !== "object") parsedMetadata = {};
  } catch {
    parsedMetadata = {};
  }

  return {
    id: row.id,
    source: row.source,
    sourceStoreId: row.source_store_id,
    externalProductId: row.external_product_id,
    sourceProductUrl: row.source_product_url,
    title: row.title,
    description: row.description,
    price: row.price,
    originalPrice: row.original_price,
    stock: row.stock,
    sku: row.sku,
    images: parsedImages,
    category: row.category,
    sellerName: row.seller_name,
    metadata: parsedMetadata,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class D1MasterCatalogRepository implements IMasterCatalogRepository {
  readonly storageProvider = "d1" as const;
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async findById(id: string): Promise<MasterProduct | null> {
    const query = "SELECT * FROM master_products WHERE id = ? LIMIT 1";
    const row = await this.db.prepare(query).bind(id).first<D1Row>();
    return row ? mapRowToProduct(row) : null;
  }

  async findByCanonicalKey(
    source: string,
    sourceStoreId: string | null | undefined,
    externalProductId: string
  ): Promise<MasterProduct | null> {
    const id = buildCanonicalProductId(source, sourceStoreId, externalProductId);
    return this.findById(id);
  }

  async upsert(product: MasterProduct): Promise<MasterProduct> {
    const imagesJson = JSON.stringify(product.images || []);
    const metadataJson = JSON.stringify(product.metadata || {});

    const query = `
      INSERT INTO master_products (
        id, source, source_store_id, external_product_id, source_product_url,
        title, description, price, original_price, stock, sku,
        images, category, seller_name, metadata,
        first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        source_product_url = excluded.source_product_url,
        title = excluded.title,
        description = coalesce(excluded.description, master_products.description),
        price = excluded.price,
        original_price = coalesce(excluded.original_price, master_products.original_price),
        stock = coalesce(excluded.stock, master_products.stock),
        sku = coalesce(excluded.sku, master_products.sku),
        images = excluded.images,
        category = coalesce(excluded.category, master_products.category),
        seller_name = coalesce(excluded.seller_name, master_products.seller_name),
        metadata = excluded.metadata,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    `;

    await this.db
      .prepare(query)
      .bind(
        product.id,
        product.source,
        product.sourceStoreId,
        product.externalProductId,
        product.sourceProductUrl,
        product.title,
        product.description,
        product.price,
        product.originalPrice,
        product.stock,
        product.sku,
        imagesJson,
        product.category,
        product.sellerName,
        metadataJson,
        product.firstSeenAt,
        product.lastSeenAt,
        product.createdAt,
        product.updatedAt
      )
      .run();

    return { ...product };
  }

  async listBySource(source: string, sourceStoreId?: string): Promise<MasterProduct[]> {
    let query = "SELECT * FROM master_products WHERE source = ?";
    const params: string[] = [source];

    if (sourceStoreId) {
      query += " AND source_store_id = ?";
      params.push(sourceStoreId);
    }

    query += " ORDER BY updated_at DESC";

    const { results } = await this.db.prepare(query).bind(...params).all<D1Row>();
    return Array.isArray(results) ? results.map(mapRowToProduct) : [];
  }

  async query(params: CatalogQueryParams): Promise<CatalogQueryResult> {
    const plan = buildCatalogSqlQuery(params);

    const countRow = await this.db.prepare(plan.countSql).bind(...plan.params).first<{ count: number }>();
    const total = countRow?.count ?? 0;

    const dataParams = [...plan.params, plan.limit, plan.offset];
    const { results } = await this.db.prepare(plan.dataSql).bind(...dataParams).all<D1Row>();
    const items = Array.isArray(results) ? results.map(mapRowToProduct) : [];

    const page = params.page || DEFAULT_PAGE;
    const pageSize = params.pageSize || DEFAULT_PAGE_SIZE;

    return {
      items,
      pagination: calculatePagination(total, page, pageSize),
    };
  }

  async count(): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) as count FROM master_products").first<{ count: number }>();
    return row?.count ?? 0;
  }

  async clear(): Promise<void> {
    await this.db.prepare("DELETE FROM master_products").run();
  }
}
