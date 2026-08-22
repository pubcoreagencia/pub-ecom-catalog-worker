# Master Catalog API Specification (v1)

A API do **Master Catalog** do PUB ECOM disponibiliza endpoints seguros e otimizados para consulta paginada e recuperação individual de produtos persistidos no Cloudflare D1.

---

## 🔒 Autenticação

Todos os endpoints da API do catálogo exigem autenticação via Bearer Token no cabeçalho HTTP:

```http
Authorization: Bearer <CATALOG_WORKER_TOKEN>
```

Se o token for omitido ou inválido, a API retornará:
- **HTTP 401 Unauthorized**
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

---

## 📋 Endpoints

### 1. Listar Produtos com Filtros e Paginação

```http
GET /v1/catalog/products
```

#### Query Parameters

| Parâmetro | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `source` | `string` | `undefined` | Filtra pela origem do produto (ex: `shopee`) |
| `sourceStoreId` | `string` | `undefined` | Filtra pelo ID numérico da loja externa (ex: `1729928484`) |
| `search` | `string` | `undefined` | Busca textual no título do produto (`title LIKE %search%`) |
| `category` | `string` | `undefined` | Filtra pela categoria do produto |
| `seller` | `string` | `undefined` | Filtra pelo nome do vendedor |
| `minPrice` | `number` | `undefined` | Preço mínimo em BRL (ex: `30`) |
| `maxPrice` | `number` | `undefined` | Preço máximo em BRL (ex: `100`) |
| `page` | `integer` | `1` | Número da página (mínimo `1`) |
| `pageSize` | `integer` | `30` | Quantidade de itens por página (máximo `100`) |
| `sort` | `string` | `updated_at` | Campo de ordenação (`updated_at`, `created_at`, `price`, `title`) |
| `order` | `string` | `desc` | Direção da ordenação (`asc`, `desc`) |

#### Exemplo de Requisição

```bash
curl -X GET "https://pub-ecom-catalog-worker.contato-pubcore.workers.dev/v1/catalog/products?source=shopee&sourceStoreId=1729928484&search=Babuche&minPrice=30&maxPrice=60&page=1&pageSize=10&sort=price&order=asc" \
  -H "Authorization: Bearer <CATALOG_WORKER_TOKEN>"
```

#### Exemplo de Resposta (HTTP 200 OK)

```json
{
  "success": true,
  "items": [
    {
      "id": "shopee:1729928484:23299366739",
      "source": "shopee",
      "sourceStoreId": "1729928484",
      "externalProductId": "23299366739",
      "sourceProductUrl": "https://shopee.com.br/product/1729928484/23299366739",
      "title": "Babuche Infantil EVA com Apliques Decorativos",
      "description": null,
      "price": 40.32,
      "originalPrice": 100.80,
      "stock": null,
      "sku": null,
      "images": [
        "https://down-br.img.susercontent.com/file/sg-11134201-8261r-mm76a9htyw3la4"
      ],
      "category": null,
      "sellerName": null,
      "metadata": {
        "provider": "apify",
        "requestId": "1e64fb94-e00a-4e09-9143-ba9ad083464b",
        "importedAt": "2026-08-22T10:43:12.406Z"
      },
      "firstSeenAt": "2026-08-22T10:43:12.406Z",
      "lastSeenAt": "2026-08-22T10:43:22.577Z",
      "createdAt": "2026-08-22T10:43:12.406Z",
      "updatedAt": "2026-08-22T10:43:12.406Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 3,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "metadata": {
    "storageProvider": "d1",
    "executionTimeMs": 14
  }
}
```

---

### 2. Buscar Produto por ID Canônico

```http
GET /v1/catalog/products/:id
```

O parâmetro `:id` deve corresponder à chave canônica `${source}:${sourceStoreId}:${externalProductId}` (ex: `shopee:1729928484:23299366739`).

#### Exemplo de Requisição

```bash
curl -X GET "https://pub-ecom-catalog-worker.contato-pubcore.workers.dev/v1/catalog/products/shopee:1729928484:23299366739" \
  -H "Authorization: Bearer <CATALOG_WORKER_TOKEN>"
```

#### Exemplo de Resposta (HTTP 200 OK)

```json
{
  "success": true,
  "item": {
    "id": "shopee:1729928484:23299366739",
    "source": "shopee",
    "sourceStoreId": "1729928484",
    "externalProductId": "23299366739",
    "sourceProductUrl": "https://shopee.com.br/product/1729928484/23299366739",
    "title": "Babuche Infantil EVA com Apliques Decorativos",
    "description": null,
    "price": 40.32,
    "originalPrice": 100.80,
    "stock": null,
    "sku": null,
    "images": [
      "https://down-br.img.susercontent.com/file/sg-11134201-8261r-mm76a9htyw3la4"
    ],
    "category": null,
    "sellerName": null,
    "metadata": {
      "provider": "apify",
      "requestId": "1e64fb94-e00a-4e09-9143-ba9ad083464b",
      "importedAt": "2026-08-22T10:43:12.406Z"
    },
    "firstSeenAt": "2026-08-22T10:43:12.406Z",
    "lastSeenAt": "2026-08-22T10:43:22.577Z",
    "createdAt": "2026-08-22T10:43:12.406Z",
    "updatedAt": "2026-08-22T10:43:12.406Z"
  }
}
```

#### Exemplo de Resposta de Produto Não Encontrado (HTTP 404 Not Found)

```json
{
  "success": false,
  "error": "Product not found",
  "id": "shopee:1729928484:99999999999"
}
```
