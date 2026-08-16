import { Struct } from "effect";

import { CheckoutMutationProviderFailure } from "../domain/checkout";
import { CommerceRequestFailure } from "../runtime/commerce-request";
import { CommerceAccountError } from "../services/commerce-accounts";

export const CheckoutMutationProviderActionError =
  CheckoutMutationProviderFailure.mapFields(Struct.omit(["cause"]));

export const CommerceAccountActionError = CommerceAccountError.mapFields(
  Struct.omit(["cause"])
);

export const CommerceRequestActionError = CommerceRequestFailure.mapFields(
  Struct.omit(["cause"])
);
