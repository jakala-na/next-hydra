import { makeDisplayActionResultSchema } from "@repo/actions";

import type { SaveCheckoutShippingOptionsInput } from "../domain/checkout";
import { SaveCheckoutShippingOptionsPublicError } from "./public-errors";
import { CheckoutPublicState } from "./public-state";

export const SaveCheckoutShippingOptionsActionError =
  SaveCheckoutShippingOptionsPublicError;
export type SaveCheckoutShippingOptionsActionError =
  typeof SaveCheckoutShippingOptionsActionError.Type;

export const SaveCheckoutShippingOptionsActionResult =
  makeDisplayActionResultSchema(
    CheckoutPublicState,
    SaveCheckoutShippingOptionsActionError
  );
export type SaveCheckoutShippingOptionsActionResult =
  typeof SaveCheckoutShippingOptionsActionResult.Encoded;
export type SaveCheckoutShippingOptionsActionInput =
  typeof SaveCheckoutShippingOptionsInput.Encoded;

export type SaveCheckoutShippingOptionsAction = (
  previousResult: SaveCheckoutShippingOptionsActionResult | null,
  input: SaveCheckoutShippingOptionsActionInput
) => Promise<SaveCheckoutShippingOptionsActionResult>;
