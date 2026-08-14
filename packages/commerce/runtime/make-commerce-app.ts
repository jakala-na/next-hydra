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
  CommerceAccountError,
  CommerceAccounts,
} from "../services/commerce-accounts";
import { CommerceContext } from "../services/commerce-context";
import { CurrentCart } from "../services/current-cart";
import type { CommerceRequestInput } from "./commerce-request";

export type CommerceRequestServices =
  | AddressBook
  | CheckoutSession
  | CommerceAccounts
  | CommerceContext
  | CurrentCart
  | ProductDiscovery;

export type AddressBookRequestServices = AddressBook | CommerceContext;

export type CommerceStableServices =
  | CartPolicies
  | Carts
  | CheckoutPolicies
  | CommerceAccounts;

export type CommerceRequestProvisionError =
  | CommerceAccountError
  | CommerceRequestContextNotFound;

export interface CommerceAppBindings<
  AddressBookError,
  CartPoliciesError,
  CartsError,
  CheckoutPoliciesError,
  CommerceAccountsError,
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
  readonly commerceAccountsLayer: Layer.Layer<
    CommerceAccounts,
    CommerceAccountsError
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
  readonly provide: (
    request: CommerceRequestInput
  ) => <A, E>(
    program: Effect.Effect<A, E, CommerceRequestServices>
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
  CommerceAccountsError,
  ProductDiscoveryError,
>(
  bindings: CommerceAppBindings<
    AddressBookError,
    CartPoliciesError,
    CartsError,
    CheckoutPoliciesError,
    CommerceAccountsError,
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
  CommerceAccountsError,
  ProductDiscoveryError,
>(
  bindings: CommerceAppBindings<
    AddressBookError,
    CartPoliciesError,
    CartsError,
    CheckoutPoliciesError,
    CommerceAccountsError,
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

export function makeCommerceApp<
  AddressBookError,
  CartPoliciesError,
  CartsError,
  CheckoutPoliciesError,
  CommerceAccountsError,
  ProductDiscoveryError,
>(
  bindings: CommerceAppBindings<
    AddressBookError,
    CartPoliciesError,
    CartsError,
    CheckoutPoliciesError,
    CommerceAccountsError,
    ProductDiscoveryError
  >
): CommerceApplication<
  | CartPoliciesError
  | CartsError
  | CheckoutPoliciesError
  | CommerceAccountsError,
  AddressBookError | ProductDiscoveryError | CommerceRequestProvisionError,
  AddressBookError | CommerceRequestProvisionError
> {
  const layer = Layer.mergeAll(
    bindings.cartPoliciesLayer,
    bindings.cartsLayer,
    bindings.checkoutPoliciesLayer,
    bindings.commerceAccountsLayer
  );

  return {
    layer,
    provide: (request) => Effect.provide(makeRequestLayer(bindings, request)),
    provideAddressBook: (request) =>
      Effect.provide(makeAddressBookRequestLayer(bindings, request)),
  };
}
