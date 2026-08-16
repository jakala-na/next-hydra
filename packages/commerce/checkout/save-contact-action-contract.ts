import { makeDisplayActionResultSchema } from "@repo/actions";
import { Schema } from "effect";

import {
  CheckoutCartMismatch,
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

export const SaveCheckoutContactActionError = Schema.Union([
  CheckoutMutationSchemaFailure,
  CheckoutMutationSourceUnavailable,
  CheckoutCartMismatch,
  CheckoutVersionConflict,
  CheckoutMutationProviderActionError,
  CheckoutMutationUnsupported,
  CheckoutUnavailable,
  CommerceRequestContextNotFound,
  CommerceRequestActionError,
  CommerceAccountActionError,
]);
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
