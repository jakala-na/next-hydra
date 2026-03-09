import type { CartWithIssues } from "@repo/commerce/lib/cart/types";
import type { ActionResult } from "@repo/commerce/lib/utils/errors";
import type { SafeActionFn, ValidationErrors } from "next-safe-action";
import { z } from "zod";

export const removeCartItemInputSchema = z.object({
  lineItemId: z.string(),
});

export type RemoveCartItemInput = z.infer<typeof removeCartItemInputSchema>;

export type RemoveCartItemData = ActionResult<CartWithIssues>;

export type RemoveCartItemAction = SafeActionFn<
  string,
  typeof removeCartItemInputSchema,
  [],
  ValidationErrors<typeof removeCartItemInputSchema>,
  RemoveCartItemData
>;
