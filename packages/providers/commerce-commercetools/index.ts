import 'server-only';

import type { CommerceAdapter } from '@repo/commerce-domain';

import { createCatalogAdapter } from './lib/catalog-adapter';

export function createCommerceAdapter(): CommerceAdapter {
  return {
    catalog: createCatalogAdapter(),
  };
}
