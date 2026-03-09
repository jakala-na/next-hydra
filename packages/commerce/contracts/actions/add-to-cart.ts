import type { CartWithIssues } from "@repo/commerce/lib/cart/types";
import type { ActionResult } from "@repo/commerce/lib/utils/errors";
import type { SafeActionFn, ValidationErrors } from "next-safe-action";
import { z } from "zod";

export const addToCartInputSchema = z.object({
  productId: z.string(),
  variantId: z.string(),
  quantity: z.number().min(1),
});

export type AddToCartInput = z.infer<typeof addToCartInputSchema>;

export type AddToCartData = ActionResult<CartWithIssues>;

export type AddToCartAction = SafeActionFn<
  string,
  typeof addToCartInputSchema,
  [],
  ValidationErrors<typeof addToCartInputSchema>,
  AddToCartData
>;
