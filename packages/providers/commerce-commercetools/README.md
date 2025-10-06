# @repo/commerce-commercetools

Commercetools adapter implementing the shared `@repo/commerce-domain` contracts. It exposes a single factory, `createCommerceAdapter`, that wires the Commercetools GraphQL client, catalog mappers, and cart helpers into the provider-agnostic commerce layer.

## Environment variables

Copy the Commercetools credentials into your runtime environment:

```bash
COMMERCETOOLS_PROJECT_KEY=your-project-key
COMMERCETOOLS_CLIENT_ID=your-client-id
COMMERCETOOLS_CLIENT_SECRET=your-client-secret
COMMERCETOOLS_SCOPE=manage_project:your-project-key
COMMERCETOOLS_REGION=us-central1
```

Public variables remain available for client-side needs when required:

```bash
NEXT_PUBLIC_COMMERCETOOLS_PROJECT_KEY=your-project-key
NEXT_PUBLIC_COMMERCETOOLS_REGION=us-central1
```

## Usage

```ts
import { createCommerceAdapter } from '@repo/commerce-commercetools';

const commerce = createCommerceAdapter();
const product = await commerce.catalog.getProduct({
  productKey: 'tee-123',
  locale: 'en-US',
  currency: 'USD',
  channelId: 'channel-id',
});
```

This adapter is resolved automatically by the `@repo/commerce` orchestrator when `COMMERCE_PROVIDER` is set to `commercetools` (the default).
