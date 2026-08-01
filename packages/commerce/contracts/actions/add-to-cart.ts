import type { CurrentCartState } from "@repo/commerce/domain/cart-snapshot";
import type { ActionResult } from "@repo/commerce/lib/utils/errors";
import type { SafeActionFn, ValidationErrors } from "next-safe-action";
import { z } from "zod";

export const addToCartInputSchema = z.object({
  productId: z.string(),
  variantId: z.string(),
  quantity: z.number().int().positive(),
});

export type AddToCartInput = z.infer<typeof addToCartInputSchema>;

export type AddToCartData = ActionResult<CurrentCartState>;

export type AddToCartAction = SafeActionFn<
  string,
  typeof addToCartInputSchema,
  [],
  ValidationErrors<typeof addToCartInputSchema>,
  AddToCartData
>;
