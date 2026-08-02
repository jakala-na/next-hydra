import { Schema } from "effect";
import { CartId } from "./cart";
import { CartStore } from "./cart-snapshot";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "./commerce-account";

export const AuthUserId = Schema.NonEmptyString.pipe(
  Schema.brand("AuthUserId")
);
export type AuthUserId = typeof AuthUserId.Type;

export class AnonymousCommerceContextRequest extends Schema.TaggedClass<AnonymousCommerceContextRequest>()(
  "AnonymousCommerceContextRequest",
  {
    store: CartStore,
    anonymousCartId: Schema.optional(CartId),
  }
) {}

export class CustomerCommerceContextRequest extends Schema.TaggedClass<CustomerCommerceContextRequest>()(
  "CustomerCommerceContextRequest",
  {
    store: CartStore,
    authUserId: AuthUserId,
    businessUnitId: Schema.optional(CommerceBusinessUnitId),
  }
) {}

export const CommerceContextRequest = Schema.Union([
  AnonymousCommerceContextRequest,
  CustomerCommerceContextRequest,
]);
export type CommerceContextRequest = typeof CommerceContextRequest.Type;

export class AnonymousCommercePrincipal extends Schema.TaggedClass<AnonymousCommercePrincipal>()(
  "AnonymousCommercePrincipal",
  {
    anonymousCartId: Schema.optional(CartId),
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
