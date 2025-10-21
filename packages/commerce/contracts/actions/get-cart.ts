import type { CartWithIssues } from '@repo/commerce/lib/cart/types';
import type { ActionResult } from '@repo/commerce/lib/utils/errors';
import type { SafeActionFn } from 'next-safe-action';

export type GetCartData = ActionResult<CartWithIssues>;

export type GetCartAction = SafeActionFn<
  string,
  undefined,
  [],
  undefined,
  GetCartData
>;
