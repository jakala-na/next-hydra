# @repo/commerce

A commerce package for integrating with Commercetools GraphQL API, built following the same patterns as the CMS package.

## Features

- **Product Management**: Fetch products and product details
- **Cart Operations**: Add to cart, update quantities, remove items
- **Checkout Integration**: Basic checkout session creation
- **TypeScript Support**: Full type safety with gql.tada integration
- **Server Actions**: Ready-to-use Next.js server actions
- **React Components**: Pre-built product card component

## Setup

1. Copy the environment variables from `.env.example` to your app's `.env.local`:

```bash
# Commercetools Configuration
COMMERCETOOLS_PROJECT_KEY=your-project-key
COMMERCETOOLS_CLIENT_ID=your-client-id
COMMERCETOOLS_CLIENT_SECRET=your-client-secret
COMMERCETOOLS_SCOPE=manage_project:your-project-key
COMMERCETOOLS_REGION=us-central1
```

2. Install the package in your app:

```json
{
  "dependencies": {
    "@repo/commerce": "workspace:*"
  }
}
```

## Usage

### Products

```typescript
import { getProducts, getProductByKey } from '@repo/commerce';

// Get all products
const { products, total } = await getProducts(20, 0);

// Get product by key
const product = await getProductByKey('my-product-key');
```

### Cart Operations

```typescript
import { addToCart, updateLineItemQuantity, removeFromCart } from '@repo/commerce';

// Add to cart
const cart = await addToCart({
  productId: 'product-id',
  variantId: 1,
  quantity: 2,
  cartId: 'existing-cart-id' // optional
});

// Update quantity
const updatedCart = await updateLineItemQuantity('cart-id', 'line-item-id', 3);

// Remove from cart
const cartAfterRemoval = await removeFromCart('cart-id', 'line-item-id');
```

### Server Actions

```typescript
// app/lib/actions/cart.ts
import { addToCartAction } from '@repo/commerce';

export async function handleAddToCart(productId: string, variantId: number) {
  const result = await addToCartAction(productId, variantId, 1);
  if (result.success) {
    // Handle success
  } else {
    // Handle error
  }
}
```

### Components

```tsx
import { ProductCard } from '@repo/commerce';

function ProductGrid({ products }) {
  const handleAddToCart = async (productId: string, variantId: number, quantity: number) => {
    // Your add to cart logic
  };

  return (
    <div className="grid grid-cols-4 gap-4">
      {products.map(product => (
        <ProductCard
          key={product.id}
          product={product}
          onAddToCart={handleAddToCart}
        />
      ))}
    </div>
  );
}
```

## Architecture

This package follows the same structure as the CMS package:

- `client.ts` - GraphQL client with OAuth authentication
- `types.ts` - TypeScript type definitions
- `lib/` - Core functionality organized by domain
  - `products/` - Product-related operations
  - `cart/` - Cart management
  - `checkout/` - Checkout operations
- `components/` - React components
- `graphql.ts` - GraphQL utilities (simplified for demo)

## Development

The package uses a simplified GraphQL setup for demonstration. In a production environment, you should:

1. Generate proper TypeScript types from your Commercetools schema
2. Use gql.tada with full introspection support
3. Implement proper error handling and retry logic
4. Add comprehensive testing

## Demo

Visit `/commerce` in the web app to see the commerce functionality in action, including:

- Product listing with images and prices
- Add to cart functionality
- Cart management
- Basic checkout flow
