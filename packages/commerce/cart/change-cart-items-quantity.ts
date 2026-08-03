import type { SafeActionFn, ValidationErrors } from "next-safe-action";
import { z } from "zod";
import type { CurrentCartState } from "../domain/cart-snapshot";
import type { ActionResult } from "../lib/utils/errors";

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
