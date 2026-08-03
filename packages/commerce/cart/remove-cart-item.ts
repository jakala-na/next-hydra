import type { SafeActionFn, ValidationErrors } from "next-safe-action";
import { z } from "zod";
import type { CurrentCartState } from "../domain/cart-snapshot";
import type { ActionResult } from "../lib/utils/errors";

export const removeCartItemInputSchema = z.object({
  lineItemId: z.string(),
});

export type RemoveCartItemInput = z.infer<typeof removeCartItemInputSchema>;

export type RemoveCartItemData = ActionResult<CurrentCartState>;

export type RemoveCartItemAction = SafeActionFn<
  string,
  typeof removeCartItemInputSchema,
  [],
  ValidationErrors<typeof removeCartItemInputSchema>,
  RemoveCartItemData
>;
