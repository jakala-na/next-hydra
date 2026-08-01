import type { CurrentCartState } from "@repo/commerce/domain/cart-snapshot";
import type { ActionResult } from "@repo/commerce/lib/utils/errors";
import type { SafeActionFn, ValidationErrors } from "next-safe-action";
import { z } from "zod";

export const changeCartItemsQuantityInputSchema = z.object({
  lineItemId: z.string(),
  quantity: z.number().int().positive(),
});

export type ChangeCartItemsQuantityInput = z.infer<
  typeof changeCartItemsQuantityInputSchema
>;

export type ChangeCartItemsQuantityData = ActionResult<CurrentCartState>;

export type ChangeCartItemsQuantityAction = SafeActionFn<
  string,
  typeof changeCartItemsQuantityInputSchema,
  [],
  ValidationErrors<typeof changeCartItemsQuantityInputSchema>,
  ChangeCartItemsQuantityData
>;
