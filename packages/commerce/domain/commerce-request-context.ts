import { Schema } from "effect";
import { CartId } from "./cart";
import { CheckoutLocale } from "./checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "./commerce-account";

export const AuthUserId = Schema.NonEmptyString.pipe(
  Schema.brand("AuthUserId")
);
export type AuthUserId = typeof AuthUserId.Type;

export class AnonymousCommercePrincipal extends Schema.TaggedClass<AnonymousCommercePrincipal>()(
  "AnonymousCommercePrincipal",
  {
    anonymousCartId: CartId,
  }
) {}

export class CustomerCommercePrincipal extends Schema.TaggedClass<CustomerCommercePrincipal>()(
  "CustomerCommercePrincipal",
  {
    authUserId: AuthUserId,
    customerId: CommerceCustomerId,
    businessUnitId: CommerceBusinessUnitId,
    businessUnitKey: CommerceBusinessUnitKey,
  }
) {}

export const CommercePrincipal = Schema.Union([
  AnonymousCommercePrincipal,
  CustomerCommercePrincipal,
]);
export type CommercePrincipal = typeof CommercePrincipal.Type;

export class CommerceRequestContext extends Schema.Class<CommerceRequestContext>(
  "CommerceRequestContext"
)({
  locale: CheckoutLocale,
  principal: CommercePrincipal,
}) {}

export class CommerceRequestContextNotFound extends Schema.TaggedErrorClass<CommerceRequestContextNotFound>()(
  "CommerceRequestContextNotFound",
  {
    message: Schema.String,
    reason: Schema.Literals([
      "noPrincipal",
      "noCustomerMapping",
      "noBuyingContext",
    ]),
  }
) {}
