import { makeDisplayActionResultSchema } from "@repo/actions";
import { Schema } from "effect";

import {
  CheckoutCartMismatch,
  CheckoutMutationAddressBookEntryUnavailable,
  CheckoutMutationSchemaFailure,
  CheckoutMutationSourceUnavailable,
  CheckoutMutationUnsupported,
  CheckoutState,
  CheckoutUnavailable,
  CheckoutVersionConflict,
} from "../domain/checkout";
import { CommerceRequestContextNotFound } from "../domain/commerce-request-context";
import {
  CheckoutMutationProviderActionError,
  CommerceAccountActionError,
  CommerceRequestActionError,
} from "./public-action-errors";

/** This sentinel cannot decode as an AddressBookReference because `:` is forbidden there. */
export const MANUAL_DELIVERY_ADDRESS_CHOICE = "manual:";

export const SaveCheckoutDeliveryDetailsActionError = Schema.Union([
  CheckoutMutationSchemaFailure,
  CheckoutMutationSourceUnavailable,
  CheckoutMutationAddressBookEntryUnavailable,
  CheckoutCartMismatch,
  CheckoutVersionConflict,
  CheckoutMutationProviderActionError,
  CheckoutMutationUnsupported,
  CheckoutUnavailable,
  CommerceRequestContextNotFound,
  CommerceRequestActionError,
  CommerceAccountActionError,
]);
export type SaveCheckoutDeliveryDetailsActionError =
  typeof SaveCheckoutDeliveryDetailsActionError.Type;

export const SaveCheckoutDeliveryDetailsActionResult =
  makeDisplayActionResultSchema(
    CheckoutState,
    SaveCheckoutDeliveryDetailsActionError
  );
export type SaveCheckoutDeliveryDetailsActionResult =
  typeof SaveCheckoutDeliveryDetailsActionResult.Encoded;
export type SaveCheckoutDeliveryDetailsActionFailure = Extract<
  typeof SaveCheckoutDeliveryDetailsActionResult.Type,
  { readonly _tag: "Failure" }
>["failure"];

export type SaveCheckoutDeliveryDetailsAction = (
  previousResult: SaveCheckoutDeliveryDetailsActionResult | null,
  formData: FormData
) => Promise<SaveCheckoutDeliveryDetailsActionResult>;
