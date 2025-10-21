import type { CartWithIssues } from '@repo/commerce/lib/cart/types';
import type { ActionResult } from '@repo/commerce/lib/utils/errors';
import type { SafeActionFn, ValidationErrors } from 'next-safe-action';
import { z } from 'zod';

export const changeCartItemsQuantityInputSchema = z.object({
  lineItemId: z.string(),
  quantity: z.number(),
});

export type ChangeCartItemsQuantityInput = z.infer<
  typeof changeCartItemsQuantityInputSchema
>;

export type ChangeCartItemsQuantityData = ActionResult<CartWithIssues>;

export type ChangeCartItemsQuantityAction = SafeActionFn<
  string,
  typeof changeCartItemsQuantityInputSchema,
  [],
  ValidationErrors<typeof changeCartItemsQuantityInputSchema>,
  ChangeCartItemsQuantityData
>;
