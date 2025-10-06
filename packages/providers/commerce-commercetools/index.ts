import 'server-only';

import type { CommerceAdapter } from '@repo/commerce-domain';

import { createCatalogAdapter } from './lib/catalog-adapter';

export const provider = 'commercetools' as const;

export function createCommerceAdapter(): CommerceAdapter {
  return {
    catalog: createCatalogAdapter(),
  };
}
