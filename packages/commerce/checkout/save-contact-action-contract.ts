import { makeDisplayActionResultSchema } from "@repo/actions";

import type { SaveCheckoutContactInput } from "../domain/checkout";
import { SaveCheckoutContactPublicError } from "./public-errors";
import { CheckoutPublicState } from "./public-state";

export const SaveCheckoutContactActionError = SaveCheckoutContactPublicError;
export type SaveCheckoutContactActionError =
  typeof SaveCheckoutContactActionError.Type;

export const SaveCheckoutContactActionResult = makeDisplayActionResultSchema(
  CheckoutPublicState,
  SaveCheckoutContactActionError
);
export type SaveCheckoutContactActionResult =
  typeof SaveCheckoutContactActionResult.Encoded;
export type SaveCheckoutContactActionFailure = Extract<
  typeof SaveCheckoutContactActionResult.Type,
  { readonly _tag: "Failure" }
>["failure"];
export type SaveCheckoutContactActionInput =
  typeof SaveCheckoutContactInput.Encoded;

export type SaveCheckoutContactAction = (
  previousResult: SaveCheckoutContactActionResult | null,
  input: SaveCheckoutContactActionInput
) => Promise<SaveCheckoutContactActionResult>;
