import { Schema } from "effect";

import { LineItemId } from "../domain/cart";
import type { RemoveCartLineItemActionResult } from "./action-result";

export const RemoveCartItemInputSchema = Schema.Struct({
  lineItemId: LineItemId,
});

export type RemoveCartItemInput = typeof RemoveCartItemInputSchema.Encoded;

export type RemoveCartItemData = RemoveCartLineItemActionResult;

export type RemoveCartItemAction = (
  input: RemoveCartItemInput
) => Promise<RemoveCartItemData>;
