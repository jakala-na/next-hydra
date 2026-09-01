import type { CheckoutPayments } from "@repo/payments";
import { Effect, Layer } from "effect";

import type {
  CommerceContextRequest,
  CommerceRequestContextNotFound,
} from "../domain/commerce-request-context";
import type { CheckoutPolicies } from "../lib/checkout/checkout-policy";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import type { ProductDiscovery } from "../product/product-discovery";
import type { AddressBook } from "../services/address-book";
import type { CartPolicies } from "../services/cart-policies";
import type { Carts } from "../services/carts";
import type {
  CommerceAccountUnavailable,
  CommerceAccounts,
} from "../services/commerce-accounts";
import type { CommerceCompanyMemberships } from "../services/commerce-company-memberships";
import { CommerceContext } from "../services/commerce-context";
import { CurrentCart } from "../services/current-cart";
import type { DeliveryPlanning } from "../services/delivery-planning";
import type { CommerceRequestInput } from "./commerce-request";

export type CommerceRequestServices =
  | AddressBook
  | CheckoutSession
  | CommerceAccounts
  | CommerceContext
  | CurrentCart
  | ProductDiscovery;

export type CommerceRequestLayerServices = Exclude<
  CommerceRequestServices,
  CommerceAccounts
>;

export type AddressBookRequestServices = AddressBook | CommerceContext;

export type CommerceStableServices =
  | CartPolicies
  | Carts
  | CheckoutPolicies
  | CheckoutPayments
  | CommerceAccounts
  | CommerceCompanyMemberships
  | DeliveryPlanning;

export type CommerceApplicationServices =
  | CommerceRequestServices
  | CommerceStableServices;

export type CommerceRequestProvisionError =
  | CommerceAccountUnavailable
  | CommerceRequestContextNotFound;

export interface CommerceAppBindings<
  AddressBookError,
  CartPoliciesError,
  CartsError,
  CheckoutPoliciesError,
  CheckoutPaymentsError,
  CommerceAccountsError,
  CommerceCompanyMembershipsError,
  DeliveryPlanningError,
  ProductDiscoveryError,
> {
  readonly addressBookLayer: Layer.Layer<
    AddressBook,
    AddressBookError,
    CommerceContext
  >;
  readonly cartPoliciesLayer: Layer.Layer<CartPolicies, CartPoliciesError>;
  readonly cartsLayer: Layer.Layer<Carts, CartsError>;
  readonly checkoutPoliciesLayer: Layer.Layer<
    CheckoutPolicies,
    CheckoutPoliciesError
  >;
  readonly checkoutPaymentsLayer: Layer.Layer<
    CheckoutPayments,
    CheckoutPaymentsError
  >;
  readonly commerceAccountsLayer: Layer.Layer<
    CommerceAccounts,
    CommerceAccountsError
  >;
  readonly commerceCompanyMembershipsLayer: Layer.Layer<
    CommerceCompanyMemberships,
    CommerceCompanyMembershipsError
  >;
  readonly deliveryPlanningLayer: Layer.Layer<
    DeliveryPlanning,
    DeliveryPlanningError
  >;
  readonly productDiscoveryLayer: Layer.Layer<
    ProductDiscovery,
    ProductDiscoveryError,
    CommerceContext
  >;
}

export interface CommerceApplication<
  LayerError,
  ProvisionError,
  AddressBookProvisionError = ProvisionError,
> {
  readonly layer: Layer.Layer<CommerceStableServices, LayerError>;
  readonly requestLayer: (
    request: CommerceRequestInput
  ) => Layer.Layer<
    CommerceRequestLayerServices,
    ProvisionError,
    CommerceStableServices
  >;
  readonly provide: (
    request: CommerceRequestInput
  ) => <A, E>(
    program: Effect.Effect<A, E, CommerceApplicationServices>
  ) => Effect.Effect<A, E | ProvisionError, CommerceStableServices>;
  readonly provideAddressBook: (
    request: CommerceContextRequest
  ) => <A, E>(
    program: Effect.Effect<A, E, AddressBookRequestServices>
  ) => Effect.Effect<A, E | AddressBookProvisionError, CommerceStableServices>;
}

const makeRequestLayer = <
  AddressBookError,
  CartPoliciesError,
  CartsError,
  CheckoutPoliciesError,
  CheckoutPaymentsError,
  CommerceAccountsError,
  CommerceCompanyMembershipsError,
  DeliveryPlanningError,
  ProductDiscoveryError,
>(
  bindings: CommerceAppBindings<
    AddressBookError,
    CartPoliciesError,
    CartsError,
    CheckoutPoliciesError,
    CheckoutPaymentsError,
    CommerceAccountsError,
    CommerceCompanyMembershipsError,
    DeliveryPlanningError,
    ProductDiscoveryError
  >,
  request: CommerceRequestInput
) => {
  const commerceContext = CommerceContext.layer(request.context);
  const currentCart = CurrentCart.layer(request.currentCartCookie).pipe(
    Layer.provideMerge(commerceContext)
  );
  const addressBook = bindings.addressBookLayer.pipe(
    Layer.provideMerge(commerceContext)
  );
  const productDiscovery = bindings.productDiscoveryLayer.pipe(
    Layer.provideMerge(commerceContext)
  );
  const checkoutSession = CheckoutSession.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(commerceContext, currentCart, addressBook)
    )
  );

  return Layer.mergeAll(
    commerceContext,
    currentCart,
    addressBook,
    productDiscovery,
    checkoutSession
  );
};

const makeAddressBookRequestLayer = <
  AddressBookError,
  CartPoliciesError,
  CartsError,
  CheckoutPoliciesError,
  CheckoutPaymentsError,
  CommerceAccountsError,
  CommerceCompanyMembershipsError,
  DeliveryPlanningError,
  ProductDiscoveryError,
>(
  bindings: CommerceAppBindings<
    AddressBookError,
    CartPoliciesError,
    CartsError,
    CheckoutPoliciesError,
    CheckoutPaymentsError,
    CommerceAccountsError,
    CommerceCompanyMembershipsError,
    DeliveryPlanningError,
    ProductDiscoveryError
  >,
  request: CommerceContextRequest
) => {
  const commerceContext = CommerceContext.layer(request);
  const addressBook = bindings.addressBookLayer.pipe(
    Layer.provideMerge(commerceContext)
  );

  return Layer.mergeAll(commerceContext, addressBook);
};

export const makeCommerceApp = <
  AddressBookError,
  CartPoliciesError,
  CartsError,
  CheckoutPoliciesError,
  CheckoutPaymentsError,
  CommerceAccountsError,
  CommerceCompanyMembershipsError,
  DeliveryPlanningError,
  ProductDiscoveryError,
>(
  bindings: CommerceAppBindings<
    AddressBookError,
    CartPoliciesError,
    CartsError,
    CheckoutPoliciesError,
    CheckoutPaymentsError,
    CommerceAccountsError,
    CommerceCompanyMembershipsError,
    DeliveryPlanningError,
    ProductDiscoveryError
  >
): CommerceApplication<
  | CartPoliciesError
  | CartsError
  | CheckoutPoliciesError
  | CheckoutPaymentsError
  | CommerceAccountsError
  | CommerceCompanyMembershipsError
  | DeliveryPlanningError,
  AddressBookError | ProductDiscoveryError | CommerceRequestProvisionError,
  AddressBookError | CommerceRequestProvisionError
> => {
  const layer = Layer.mergeAll(
    bindings.cartPoliciesLayer,
    bindings.cartsLayer,
    bindings.checkoutPoliciesLayer,
    bindings.checkoutPaymentsLayer,
    bindings.commerceAccountsLayer,
    bindings.commerceCompanyMembershipsLayer,
    bindings.deliveryPlanningLayer
  );

  return {
    layer,
    provide: (request) => Effect.provide(makeRequestLayer(bindings, request)),
    provideAddressBook: (request) =>
      Effect.provide(makeAddressBookRequestLayer(bindings, request)),
    requestLayer: (request) => makeRequestLayer(bindings, request),
  };
};
