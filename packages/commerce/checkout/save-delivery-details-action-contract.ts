import { makeDisplayActionResultSchema } from "@repo/actions";

import type { SaveCheckoutDeliveryDetailsInput } from "../domain/checkout";
import { SaveCheckoutDeliveryDetailsPublicError } from "./public-errors";
import { CheckoutPublicState } from "./public-state";

/** This sentinel cannot decode as an AddressBookReference because `:` is forbidden there. */
export const MANUAL_DELIVERY_ADDRESS_CHOICE = "manual:";

export const SaveCheckoutDeliveryDetailsActionError =
  SaveCheckoutDeliveryDetailsPublicError;
export type SaveCheckoutDeliveryDetailsActionError =
  typeof SaveCheckoutDeliveryDetailsActionError.Type;

export const SaveCheckoutDeliveryDetailsActionResult =
  makeDisplayActionResultSchema(
    CheckoutPublicState,
    SaveCheckoutDeliveryDetailsActionError
  );
export type SaveCheckoutDeliveryDetailsActionResult =
  typeof SaveCheckoutDeliveryDetailsActionResult.Encoded;
export type SaveCheckoutDeliveryDetailsActionFailure = Extract<
  typeof SaveCheckoutDeliveryDetailsActionResult.Type,
  { readonly _tag: "Failure" }
>["failure"];
export type SaveCheckoutDeliveryDetailsActionInput =
  typeof SaveCheckoutDeliveryDetailsInput.Encoded;

export type SaveCheckoutDeliveryDetailsAction = (
  previousResult: SaveCheckoutDeliveryDetailsActionResult | null,
  input: SaveCheckoutDeliveryDetailsActionInput
) => Promise<SaveCheckoutDeliveryDetailsActionResult>;
