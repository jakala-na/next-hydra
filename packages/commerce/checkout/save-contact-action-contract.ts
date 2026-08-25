import { makeDisplayActionResultSchema } from "@repo/actions";

import { CheckoutState } from "../domain/checkout";
import { SaveCheckoutContactPublicError } from "./public-errors";

export const SaveCheckoutContactActionError = SaveCheckoutContactPublicError;
export type SaveCheckoutContactActionError =
  typeof SaveCheckoutContactActionError.Type;

export const SaveCheckoutContactActionResult = makeDisplayActionResultSchema(
  CheckoutState,
  SaveCheckoutContactActionError
);
export type SaveCheckoutContactActionResult =
  typeof SaveCheckoutContactActionResult.Encoded;
export type SaveCheckoutContactActionFailure = Extract<
  typeof SaveCheckoutContactActionResult.Type,
  { readonly _tag: "Failure" }
>["failure"];

export type SaveCheckoutContactAction = (
  previousResult: SaveCheckoutContactActionResult | null,
  formData: FormData
) => Promise<SaveCheckoutContactActionResult>;
