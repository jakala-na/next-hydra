# @repo/commerce

Provider-agnostic commerce orchestrator that exposes the shared domain contracts and resolves the active provider adapter at runtime. The default provider is Commercetools, but additional adapters can be registered via the `COMMERCE_PROVIDER` environment variable.

## Usage

```ts
import { getProduct } from '@repo/commerce';

const product = await getProduct({
  productKey: 'tee-123',
  locale: 'en-US',
  currency: 'USD',
  channelId: 'channel-id',
});
```

## Configuration

Set the provider identifier if you need to override the default:

```bash
COMMERCE_PROVIDER=commercetools
```

Any new adapter should implement the interfaces exported from `@repo/commerce-domain` and update the switch statement in `provider-registry.ts`.
