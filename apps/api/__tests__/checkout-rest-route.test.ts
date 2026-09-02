/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access -- These HTTP contract tests intentionally inspect the untyped JSON returned by the platform Response API. */
/* oxlint-disable typescript/no-explicit-any -- The test Layer harness composes heterogeneous service and error channels that each scenario narrows through its supplied programs. */
/* oxlint-disable anti-slop/no-unknown-parameters -- Request builders deliberately accept malformed unknown payloads to exercise the HTTP schema boundary. */
/* oxlint-disable vitest/max-expects -- HTTP contract scenarios assert status, public shape, and absence of private fields together. */
import {
  AuthUserId as AccessTokenAuthUserId,
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
  AccessTokenVerifier,
  VerifiedAccessToken,
} from "@repo/auth/access-token";
import {
  AddressBookEntry,
  AddressBookEntryNotFound,
  AddressBookReference,
  normalizeAddressTypes,
} from "@repo/commerce/domain/address-book";
import {
  CartId,
  LineItemId,
  ProductId,
  Sku,
  VariantId,
} from "@repo/commerce/domain/cart";
import {
  CartProviderFailure,
  CartShippingOptionsRefreshRequired,
  CartWriteOutcomeUnknown,
} from "@repo/commerce/domain/cart-errors";
import type {
  CartPolicyViolation,
  CartSnapshot,
} from "@repo/commerce/domain/cart-snapshot";
import {
  CheckoutMutationProviderFailure,
  CheckoutProviderFailure,
  CountryCode,
} from "@repo/commerce/domain/checkout";
import type {
  CartOnlyCheckoutDeliveryDetailsInput,
  CheckoutContact,
  CheckoutContactInput,
  CheckoutDeliveryDetails,
  CheckoutDeliveryDetailsInput,
} from "@repo/commerce/domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "@repo/commerce/domain/commerce-account";
import { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import type { CustomerCommercePrincipal } from "@repo/commerce/domain/commerce-request-context";
import {
  DeliveryGroupReference,
  DeliveryPlanQuoteReference,
  DeliveryPlanReference,
  ShippingOptionReference,
} from "@repo/commerce/domain/delivery-plan";
import type {
  DeliveryPlanQuote,
  DeliveryPlanSelection,
  SelectedDeliveryPlan,
} from "@repo/commerce/domain/delivery-plan";
import {
  OrderId,
  OrderPlacementOutcomeUnknown,
  OrderPlacementRejected,
  orderNumberForCart,
} from "@repo/commerce/domain/order";
import type { ProviderFailureReason } from "@repo/commerce/domain/provider-failure";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  encodeAnonymousCartCookie,
  makeAnonymousCartCookie,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { ProductDiscovery } from "@repo/commerce/product";
import { makeCommerceApp } from "@repo/commerce/runtime/make-commerce-app";
import { AddressBook } from "@repo/commerce/services/address-book";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import type { SaveCartShippingOptionsFailure } from "@repo/commerce/services/carts";
import { Carts } from "@repo/commerce/services/carts";
import {
  CommerceAccountUnavailable,
  CommerceAccounts,
  CommerceCustomerIdNotFound,
} from "@repo/commerce/services/commerce-accounts";
import { CommerceCompanyMemberships } from "@repo/commerce/services/commerce-company-memberships";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { DeliveryPlanning } from "@repo/commerce/services/delivery-planning";
import { Orders } from "@repo/commerce/services/orders";
import { CommerceLocale, Store, StoreKey } from "@repo/commerce/store";
import type { CurrencyCode, Locale } from "@repo/i18n/types";
import {
  CardBrand,
  CardLastFour,
  CheckoutPayments,
  PaymentAttemptReference,
  PaymentConfirmationReference,
  PaymentMethodUnavailable,
  PaymentProvider,
  PaymentProviderFailure,
  PaymentReference,
  PreparedPaymentReference,
} from "@repo/payments";
import type {
  AuthorizeCheckoutPaymentInput,
  CheckoutPaymentOperationInput,
  FinalizeCheckoutPaymentInput,
  PaymentAuthorization,
  PaymentOptions,
  SaveCheckoutPaymentFailure,
  SaveCheckoutPaymentInput,
} from "@repo/payments";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { describe, expect, test } from "vitest";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE_CONTENT = 422;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;
const ADDRESS_BOOK_REFERENCE_PATTERN = /^[A-Za-z0-9_-]+$/u;

const money = {
  centAmount: 2500,
  currencyCode: "USD",
} as const;

type TestLineItem = CartSnapshot["lineItems"][number];

const defaultLineItems: TestLineItem[] = [
  {
    id: LineItemId.make("line-1"),
    quantity: 1,
    totalPrice: money,
    unitPrice: money,
    variant: {
      attributes: {},
      id: VariantId.make("1"),
      images: [],
      name: "Hydra Wrench",
      productId: ProductId.make("product-1"),
      sku: Sku.make("HYDRA-WRENCH"),
    },
  },
];

const forAnonymous = (value: CartSnapshot): CartSnapshot => {
  const { buyingContext: _buyingContext, ...anonymous } = value;
  return anonymous;
};

const forBusinessUnit = (value: CartSnapshot): CartSnapshot => ({
  ...value,
  buyingContext: {
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  },
});

const cart = ({
  lineItems,
  totalLineItemQuantity,
}: {
  readonly lineItems?: TestLineItem[];
  readonly totalLineItemQuantity?: number;
} = {}): CartSnapshot => {
  const resolvedLineItems = lineItems ?? defaultLineItems;

  return {
    checkoutDetails: {},
    id: CartId.make("cart-1"),
    lineItems: resolvedLineItems,
    status: "active" as const,
    storeKey: StoreKey.make("default-store"),
    totalLineItemQuantity:
      totalLineItemQuantity ??
      resolvedLineItems.reduce(
        (total, lineItem) => total + lineItem.quantity,
        0
      ),
    totalPrice: money,
  };
};

const anonymousCartCookieHeader = ({
  cartId = "cart-1",
  currency = "USD",
  locale = "en-US",
  storeKey = "default-store",
}: {
  readonly cartId?: string;
  readonly currency?: CurrencyCode;
  readonly locale?: Locale;
  readonly storeKey?: string;
} = {}) => {
  const cookie = makeAnonymousCartCookie({
    cartId,
    store: new Store({
      currency,
      locale: CommerceLocale.make(locale),
      storeKey: StoreKey.make(storeKey),
    }),
  });

  return `${ANONYMOUS_CART_COOKIE_NAME}=${encodeAnonymousCartCookie(cookie)}`;
};

const request = (headers?: Record<string, string>) =>
  new Request("http://api.test/checkout/current", {
    headers: {
      cookie: anonymousCartCookieHeader(),
      "x-context-locale": "en-US",
      ...headers,
    },
    method: "GET",
  });

const requestWithoutAnonymousCart = (headers?: Record<string, string>) =>
  new Request("http://api.test/checkout/current", {
    headers: {
      "x-context-locale": "en-US",
      ...headers,
    },
    method: "GET",
  });

const manualContact: CheckoutContact = {
  buyerContact: {
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    phoneNumber: "+15551234567",
  },
  source: "manual",
};

const customerProfile = new CommerceCustomerProfile({
  customerId: CommerceCustomerId.make("customer-1"),
  email: Redacted.make("profile@example.com", { label: "email" }),
  firstName: Redacted.make("Profile", { label: "personName" }),
  lastName: Redacted.make("Buyer", { label: "personName" }),
});

const saveContactPayload = ({
  cartId = "cart-1",
  contact = manualContact,
}: {
  readonly cartId?: string;
  readonly contact?: CheckoutContactInput;
} = {}) => ({
  cart: {
    id: cartId,
  },
  contact,
});

const saveContactRequest = (
  payload: unknown = saveContactPayload(),
  headers?: Record<string, string>
) =>
  new Request("http://api.test/checkout/contact", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      cookie: anonymousCartCookieHeader(),
      "x-context-locale": "en-US",
      ...headers,
    },
    method: "POST",
  });

const manualDeliveryDetails: CheckoutDeliveryDetails = {
  shippingAddress: {
    addressLine1: "123 Analytical Engine Way",
    addressLine2: "Suite 42",
    city: "London",
    country: CountryCode.make("GB"),
    postalCode: "SW1A 1AA",
    region: "Greater London",
  },
  source: "manual",
};

const cartOnlyDeliveryDetailsInput: CartOnlyCheckoutDeliveryDetailsInput = {
  saveToAddressBook: false,
  shippingAddress: manualDeliveryDetails.shippingAddress,
  type: "manual",
};

const standardShippingOption = {
  name: "Standard",
  price: { centAmount: 500, currencyCode: "USD" as const },
  reference: ShippingOptionReference.make("standard"),
};

const deliveryPlanQuote = {
  plans: [
    {
      groups: [
        {
          reference: DeliveryGroupReference.make("delivery-1"),
          shippingAddress: manualDeliveryDetails.shippingAddress,
          shippingOptions: [standardShippingOption],
          targets: [{ lineItemId: LineItemId.make("line-1"), quantity: 1 }],
        },
      ],
      reference: DeliveryPlanReference.make("plan-1"),
    },
  ],
  reference: DeliveryPlanQuoteReference.make("quote-1"),
} as const satisfies DeliveryPlanQuote;

const deliveryPlanSelection = {
  groups: [
    {
      deliveryGroupReference: DeliveryGroupReference.make("delivery-1"),
      shippingOptionReference: standardShippingOption.reference,
    },
  ],
  quoteReference: deliveryPlanQuote.reference,
  reference: deliveryPlanQuote.plans[0].reference,
} as const satisfies DeliveryPlanSelection;

const selectedDeliveryPlan = {
  groups: [
    {
      reference: deliveryPlanQuote.plans[0].groups[0].reference,
      selectedShippingOption: standardShippingOption,
      shippingAddress: manualDeliveryDetails.shippingAddress,
      targets: deliveryPlanQuote.plans[0].groups[0].targets,
    },
  ],
  quoteReference: deliveryPlanQuote.reference,
  reference: deliveryPlanQuote.plans[0].reference,
} as const satisfies SelectedDeliveryPlan;

const cardPreparationReference = PreparedPaymentReference.make(
  "checkout-card-cart-1:USD:2500"
);
const cardPaymentReference = PaymentReference.make("payment-from-api-input");
const paymentAttemptReference = PaymentAttemptReference.make(
  "attempt-from-api-input"
);

const paymentReadyCart = (): CartSnapshot => ({
  ...cart(),
  checkoutDetails: {
    contact: manualContact,
    deliveryDetails: manualDeliveryDetails,
    selectedDeliveryPlan,
  },
});

const orderReadyCart = (): CartSnapshot => ({
  ...paymentReadyCart(),
  checkoutDetails: {
    ...paymentReadyCart().checkoutDetails,
    preparedPayment: {
      amount: money,
      attemptReference: paymentAttemptReference,
      billingAddress: manualDeliveryDetails.shippingAddress,
      method: "card",
      paymentReference: cardPaymentReference,
      preparationReference: cardPreparationReference,
    },
  },
});

const cardPaymentOptions: PaymentOptions = {
  amount: money,
  methods: [
    {
      availability: "available",
      displayName: "Card",
      input: {
        clientIntegration: {
          clientToken: "pi-client-secret-from-api",
          provider: PaymentProvider.make("Stripe"),
          publicConfiguration: "pk_test_from_api",
        },
        preparationReference: cardPreparationReference,
      },
      method: "card",
    },
  ],
};

const cardPaymentMethod = {
  cardBrand: CardBrand.make("visa"),
  lastFour: CardLastFour.make("4242"),
  method: "card" as const,
};

const makeCheckoutPaymentsLayer = ({
  authorization = { _tag: "Authorized", paymentMethod: cardPaymentMethod },
  finalizeFailure,
  onAuthorize,
  onCancelAuthorization,
  onFinalize,
  onPrepare,
  onSave,
  saveFailure,
}: {
  readonly authorization?: PaymentAuthorization;
  readonly finalizeFailure?: PaymentProviderFailure;
  readonly onAuthorize?: (input: AuthorizeCheckoutPaymentInput) => void;
  readonly onCancelAuthorization?: (
    input: CheckoutPaymentOperationInput
  ) => void;
  readonly onFinalize?: (input: FinalizeCheckoutPaymentInput) => void;
  readonly onPrepare?: () => void;
  readonly onSave?: (input: SaveCheckoutPaymentInput) => void;
  readonly saveFailure?: SaveCheckoutPaymentFailure;
} = {}) =>
  Layer.succeed(
    CheckoutPayments,
    CheckoutPayments.of({
      authorize: (input) => {
        onAuthorize?.(input);
        return Effect.succeed(authorization);
      },
      cancelAuthorization: (input) => {
        onCancelAuthorization?.(input);
        return Effect.void;
      },
      finalize: (input) => {
        onFinalize?.(input);
        return finalizeFailure === undefined
          ? Effect.void
          : Effect.fail(finalizeFailure);
      },
      getFinalizationStatus: () => Effect.succeed("confirmed"),
      getPaymentMethod: () => Effect.succeed(cardPaymentMethod),
      prepare: () => {
        onPrepare?.();
        return Effect.succeed(cardPaymentOptions);
      },
      save: (input) => {
        onSave?.(input);
        if (saveFailure !== undefined) {
          return Effect.fail(saveFailure);
        }
        const prepared = {
          amount: input.checkout.amount,
          attemptReference: input.attemptReference,
          billingAddress: input.billingAddress,
          paymentReference: cardPaymentReference,
        };
        return Effect.succeed(
          input.selection.method === "card"
            ? {
                ...prepared,
                method: "card" as const,
                preparationReference: cardPreparationReference,
              }
            : {
                ...prepared,
                method: "netTerms" as const,
                termsInDays: 30,
              }
        );
      },
    })
  );

const saveDeliveryDetailsPayload = ({
  cartId = "cart-1",
  deliveryDetails = cartOnlyDeliveryDetailsInput,
}: {
  readonly cartId?: string;
  readonly deliveryDetails?: CheckoutDeliveryDetailsInput;
} = {}) => ({
  cart: {
    id: cartId,
  },
  deliveryDetails,
});

const saveDeliveryDetailsRequest = (
  payload: unknown = saveDeliveryDetailsPayload(),
  headers?: Record<string, string>
) =>
  new Request("http://api.test/checkout/delivery-details", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      cookie: anonymousCartCookieHeader(),
      "x-context-locale": "en-US",
      ...headers,
    },
    method: "POST",
  });

const saveShippingOptionsPayload = ({
  cartId = "cart-1",
  selection = deliveryPlanSelection,
}: {
  readonly cartId?: string;
  readonly selection?: DeliveryPlanSelection;
} = {}) => ({
  cart: { id: cartId },
  selection,
});

const saveShippingOptionsRequest = (
  payload: unknown = saveShippingOptionsPayload(),
  headers?: Record<string, string>
) =>
  new Request("http://api.test/checkout/shipping-options", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      cookie: anonymousCartCookieHeader(),
      "x-context-locale": "en-US",
      ...headers,
    },
    method: "POST",
  });

const preparePaymentOptionsRequest = () =>
  new Request("http://api.test/checkout/payment-options/prepare", {
    headers: {
      cookie: anonymousCartCookieHeader(),
      "x-context-locale": "en-US",
    },
    method: "POST",
  });

const savePaymentOptionsRequest = (payment: {
  readonly confirmationReference?: string;
  readonly method: "card";
  readonly preparationReference: string;
}) =>
  new Request("http://api.test/checkout/payment-options", {
    body: JSON.stringify({
      cart: { id: "cart-1" },
      selection: {
        billingAddress: { source: "shippingAddress" },
        payment,
      },
    }),
    headers: {
      "content-type": "application/json",
      cookie: anonymousCartCookieHeader(),
      "x-context-locale": "en-US",
    },
    method: "POST",
  });

const DEFAULT_PLACE_ORDER_PAYLOAD = {
  cart: { id: "cart-1" },
};

const placeOrderRequest = (payload?: unknown) =>
  new Request("http://api.test/checkout/orders", {
    body: JSON.stringify(
      payload === undefined ? DEFAULT_PLACE_ORDER_PAYLOAD : payload
    ),
    headers: {
      "content-type": "application/json",
      cookie: anonymousCartCookieHeader(),
      "x-context-locale": "en-US",
    },
    method: "POST",
  });

const makeCheckoutLayer = (
  input: {
    readonly currentCart?: ReturnType<typeof cart> | undefined;
    readonly allowedContactSources?: readonly string[];
    readonly cartPolicyViolations?: readonly CartPolicyViolation[];
    readonly saveContactFailure?:
      | CartWriteOutcomeUnknown
      | CheckoutMutationProviderFailure;
    readonly saveDeliveryDetailsFailure?:
      | CartWriteOutcomeUnknown
      | CheckoutMutationProviderFailure;
    readonly saveShippingOptionsFailure?: SaveCartShippingOptionsFailure;
    readonly savePaymentOptionsFailure?:
      | CartWriteOutcomeUnknown
      | CheckoutMutationProviderFailure;
    readonly deliveryPlanQuote?: DeliveryPlanQuote;
    readonly getCurrentFailure?: CheckoutProviderFailure;
    readonly onCurrentCartRead?: () => void;
    readonly customerProfiles?: readonly CommerceCustomerProfile[];
    readonly providerFailureReason?: ProviderFailureReason;
  } = {}
) => {
  const {
    cartPolicyViolations = [],
    saveContactFailure,
    saveDeliveryDetailsFailure,
    saveShippingOptionsFailure,
    savePaymentOptionsFailure,
    getCurrentFailure,
    onCurrentCartRead,
    customerProfiles = [],
    deliveryPlanQuote: configuredDeliveryPlanQuote,
    providerFailureReason = "unavailable",
  } = input;
  const currentCart = "currentCart" in input ? input.currentCart : cart();
  const providerFailure = (
    operation:
      | "findById"
      | "saveContact"
      | "saveDeliveryDetails"
      | "savePaymentOptions",
    cause: unknown
  ) =>
    new CartProviderFailure({
      cause,
      operation,
      reason: providerFailureReason,
    });
  const saveFailure = (
    operation: "saveContact" | "saveDeliveryDetails" | "savePaymentOptions",
    failure: CartWriteOutcomeUnknown | CheckoutMutationProviderFailure
  ) =>
    failure._tag === "CartWriteOutcomeUnknown"
      ? failure
      : providerFailure(operation, failure);
  let activeCart = currentCart;
  const cartsLayer = Layer.succeed(
    Carts,
    Carts.of({
      addItem: () => Effect.die("not used"),
      clearPaymentOptions: ({ target }) => {
        if (activeCart === undefined) {
          return Effect.die("Cart missing");
        }
        activeCart = {
          ...activeCart,
          checkoutDetails: {
            ...activeCart.checkoutDetails,
            preparedPayment: undefined,
          },
        };
        return Effect.succeed(
          target._tag === "AnonymousCartTarget"
            ? forAnonymous(activeCart)
            : forBusinessUnit(activeCart)
        );
      },
      createAnonymous: () => Effect.die("not used"),
      createForBusinessUnit: () => Effect.die("not used"),
      findActiveForBusinessUnit: ({ store }) => {
        onCurrentCartRead?.();
        if (getCurrentFailure !== undefined) {
          return Effect.fail(providerFailure("findById", getCurrentFailure));
        }
        return Effect.succeed(
          activeCart?.storeKey === store.storeKey
            ? [forBusinessUnit(activeCart)]
            : []
        );
      },
      findById: ({ id, store }) => {
        onCurrentCartRead?.();
        if (getCurrentFailure !== undefined) {
          return Effect.fail(providerFailure("findById", getCurrentFailure));
        }
        return Effect.succeed(
          activeCart?.id === id && activeCart.storeKey === store.storeKey
            ? Option.some(forAnonymous(activeCart))
            : Option.none()
        );
      },
      removeLineItem: () => Effect.die("not used"),
      saveContact: ({ target, contact }) => {
        if (saveContactFailure !== undefined) {
          return Effect.fail(saveFailure("saveContact", saveContactFailure));
        }
        if (activeCart === undefined) {
          return Effect.die("Cart missing");
        }
        activeCart = {
          ...activeCart,
          checkoutDetails: { ...activeCart.checkoutDetails, contact },
        };
        return Effect.succeed(
          target._tag === "AnonymousCartTarget"
            ? forAnonymous(activeCart)
            : forBusinessUnit(activeCart)
        );
      },
      saveDeliveryDetails: ({ target, deliveryDetails }) => {
        if (saveDeliveryDetailsFailure !== undefined) {
          return Effect.fail(
            saveFailure("saveDeliveryDetails", saveDeliveryDetailsFailure)
          );
        }
        if (activeCart === undefined) {
          return Effect.die("Cart missing");
        }
        activeCart = {
          ...activeCart,
          checkoutDetails: {
            ...activeCart.checkoutDetails,
            deliveryDetails,
          },
        };
        return Effect.succeed(
          target._tag === "AnonymousCartTarget"
            ? forAnonymous(activeCart)
            : forBusinessUnit(activeCart)
        );
      },
      savePaymentOptions: ({ target, preparedPayment }) => {
        if (savePaymentOptionsFailure !== undefined) {
          return Effect.fail(
            saveFailure("savePaymentOptions", savePaymentOptionsFailure)
          );
        }
        if (activeCart === undefined) {
          return Effect.die("Cart missing");
        }
        activeCart = {
          ...activeCart,
          checkoutDetails: {
            ...activeCart.checkoutDetails,
            preparedPayment,
          },
        };
        return Effect.succeed(
          target._tag === "AnonymousCartTarget"
            ? forAnonymous(activeCart)
            : forBusinessUnit(activeCart)
        );
      },
      saveShippingOptions: ({ target, selectedDeliveryPlan: selection }) => {
        if (saveShippingOptionsFailure !== undefined) {
          return Effect.fail(saveShippingOptionsFailure);
        }
        if (activeCart === undefined) {
          return Effect.die("Cart missing");
        }
        activeCart = {
          ...activeCart,
          checkoutDetails: {
            ...activeCart.checkoutDetails,
            selectedDeliveryPlan: selection,
          },
        };
        return Effect.succeed(
          target._tag === "AnonymousCartTarget"
            ? forAnonymous(activeCart)
            : forBusinessUnit(activeCart)
        );
      },
      setLineItemQuantity: () => Effect.die("not used"),
    })
  );
  const cartPoliciesLayer = Layer.succeed(
    CartPolicies,
    CartPolicies.of({
      evaluate: () => Effect.succeed(cartPolicyViolations),
    })
  );

  return Layer.mergeAll(
    cartsLayer,
    cartPoliciesLayer,
    CheckoutPolicies.layer,
    CommerceAccounts.layerMemoryFrom({ customerProfiles }),
    configuredDeliveryPlanQuote === undefined
      ? DeliveryPlanning.emptyLayer
      : DeliveryPlanning.layerMemory(() =>
          Effect.succeed(configuredDeliveryPlanQuote)
        ),
    // oxlint-disable-next-line eslint/no-use-before-define -- The Layer factory runs only after module initialization completes.
    makeJwtVerifierLayer()
  );
};

const makeAddressBookLayer = (
  initialEntries: readonly AddressBookEntry[] = [],
  onPrincipal?: (principal: CustomerCommercePrincipal) => void
) => {
  let entries = [...initialEntries];

  return Layer.effect(
    AddressBook,
    Effect.gen(function* makeAddressBookLayer() {
      const commerceContext = yield* CommerceContext;
      const withPrincipal = <A, E>(
        effect: (principal: CustomerCommercePrincipal) => Effect.Effect<A, E>
      ) => commerceContext.customerPrincipal().pipe(Effect.flatMap(effect));

      return AddressBook.of({
        get: (reference) =>
          withPrincipal((principal) =>
            Effect.gen(function* get() {
              onPrincipal?.(principal);
              const entry = entries.find(
                (candidate) => candidate.reference === reference
              );

              if (!entry) {
                return yield* new AddressBookEntryNotFound({
                  message: "Address Book entry does not exist",
                  reference,
                });
              }

              return entry;
            })
          ),
        list: () =>
          withPrincipal((principal) =>
            Effect.sync(() => {
              onPrincipal?.(principal);
              return entries;
            })
          ),
        save: (input) =>
          withPrincipal((principal) =>
            Effect.sync(() => {
              onPrincipal?.(principal);
              const existing = entries.find(
                (candidate) => candidate.reference === input.reference
              );

              if (existing) {
                return existing;
              }

              const entry = new AddressBookEntry({
                address: input.address,
                defaultBilling: input.defaultBilling,
                defaultShipping: input.defaultShipping,
                reference: input.reference,
                types: normalizeAddressTypes(input.types, input),
              });
              entries = [...entries, entry];
              return entry;
            })
          ),
      });
    })
  );
};

const makeCommerceAccountsLayer = (
  customerId = CommerceCustomerId.make("customer-1"),
  profile = customerProfile
) =>
  Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
      addAssociate: () => Effect.die("not used"),
      createFromRegistration: () => Effect.die("not used"),
      getCustomerIdByAuthUserId: () => Effect.succeed(customerId),
      getCustomerProfile: () => Effect.succeed(profile),
      hasCustomerWithEmail: () => Effect.die("not used"),
      linkRegistrantIdentity: () => Effect.die("not used"),
      listBusinessUnitMembershipsForCustomerInStore: () =>
        Effect.succeed([
          new CommerceBusinessUnitMembership({
            businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
            businessUnitKey: CommerceBusinessUnitKey.make(
              "business-unit-key-1"
            ),
            businessUnitLabel:
              CommerceBusinessUnitLabel.make("Business Unit One"),
            roles: ["admin", "buyer"],
          }),
        ]),
    })
  );

const makeCommerceAccountsWithoutCustomerLayer = (
  authUserId = AuthUserId.make("auth-user-1")
) =>
  Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
      addAssociate: () => Effect.die("not used"),
      createFromRegistration: () => Effect.die("not used"),
      getCustomerIdByAuthUserId: () =>
        Effect.fail(
          new CommerceCustomerIdNotFound({
            authUserId,
            message: "Commerce customer id does not exist for auth user",
          })
        ),
      getCustomerProfile: () => Effect.die("not used"),
      hasCustomerWithEmail: () => Effect.die("not used"),
      linkRegistrantIdentity: () => Effect.die("not used"),
      listBusinessUnitMembershipsForCustomerInStore: () =>
        Effect.die("not used"),
    })
  );

const makeCommerceAccountsWithoutBusinessUnitLayer = (
  customerId = CommerceCustomerId.make("customer-1")
) =>
  Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
      addAssociate: () => Effect.die("not used"),
      createFromRegistration: () => Effect.die("not used"),
      getCustomerIdByAuthUserId: () => Effect.succeed(customerId),
      getCustomerProfile: () => Effect.die("not used"),
      hasCustomerWithEmail: () => Effect.die("not used"),
      linkRegistrantIdentity: () => Effect.die("not used"),
      listBusinessUnitMembershipsForCustomerInStore: () => Effect.succeed([]),
    })
  );

const makeFailingCommerceAccountsLayer = () =>
  Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
      addAssociate: () => Effect.die("not used"),
      createFromRegistration: () => Effect.die("not used"),
      getCustomerIdByAuthUserId: () =>
        Effect.fail(
          new CommerceAccountUnavailable({
            message: "Commerce account lookup failed",
          })
        ),
      getCustomerProfile: () => Effect.die("not used"),
      hasCustomerWithEmail: () => Effect.die("not used"),
      linkRegistrantIdentity: () => Effect.die("not used"),
      listBusinessUnitMembershipsForCustomerInStore: () =>
        Effect.die("not used"),
    })
  );

const makeJwtVerifierLayer = (authUserId = AuthUserId.make("auth-user-1")) =>
  Layer.succeed(
    AccessTokenVerifier,
    AccessTokenVerifier.of({
      verify: (token) =>
        token === "valid-token"
          ? Effect.succeed(
              new VerifiedAccessToken({
                authUserId: AccessTokenAuthUserId.make(authUserId),
              })
            )
          : Effect.fail(
              new AccessTokenInvalid({
                message: "Invalid commerce customer JWT",
                reason: "invalidToken",
              })
            ),
    })
  );

const makeFailingJwtVerifierLayer = () =>
  Layer.succeed(
    AccessTokenVerifier,
    AccessTokenVerifier.of({
      verify: () =>
        Effect.fail(
          new AccessTokenVerificationFailure({
            message: "JWT verifier unavailable",
            reason: "unavailable",
          })
        ),
    })
  );

const makeUnexpectedJwtVerifierLayer = () =>
  Layer.succeed(
    AccessTokenVerifier,
    AccessTokenVerifier.of({
      verify: () =>
        Effect.fail(
          new AccessTokenVerificationFailure({
            cause: new Error("invalid JWKS configuration"),
            message: "Private verifier diagnostic",
            reason: "unexpected",
          })
        ),
    })
  );

const makeTestCommerceApp = (
  layer: Layer.Layer<any, any>,
  addressBookLayer: Layer.Layer<
    AddressBook,
    never,
    CommerceContext
  > = AddressBook.layerMemory(),
  checkoutPaymentsLayer: Layer.Layer<CheckoutPayments> = CheckoutPayments.unavailableLayer,
  ordersLayer: Layer.Layer<Orders> = Orders.layerMemory()
) =>
  makeCommerceApp({
    addressBookLayer,
    cartPoliciesLayer: Layer.effect(CartPolicies, CartPolicies).pipe(
      Layer.provide(layer)
    ),
    cartsLayer: Layer.effect(Carts, Carts).pipe(Layer.provide(layer)),
    checkoutPaymentsLayer,
    checkoutPoliciesLayer: Layer.effect(
      CheckoutPolicies,
      CheckoutPolicies
    ).pipe(Layer.provide(layer)),
    commerceAccountsLayer: Layer.effect(
      CommerceAccounts,
      CommerceAccounts
    ).pipe(Layer.provide(layer)),
    commerceCompanyMembershipsLayer: CommerceCompanyMemberships.layerMemory,
    deliveryPlanningLayer: Layer.effect(
      DeliveryPlanning,
      DeliveryPlanning
    ).pipe(Layer.provide(layer)),
    ordersLayer,
    productDiscoveryLayer: ProductDiscovery.testLayer(),
  });

const makeAuthenticationLayer = (layer: Layer.Layer<any, any>) =>
  Layer.effect(AccessTokenVerifier, AccessTokenVerifier).pipe(
    Layer.provide(layer)
  );

const makeHandler = async (
  layer: Layer.Layer<any, any>,
  addressBookLayer: Layer.Layer<
    AddressBook,
    never,
    CommerceContext
  > = AddressBook.layerMemory(),
  checkoutPaymentsLayer: Layer.Layer<CheckoutPayments> = CheckoutPayments.unavailableLayer,
  ordersLayer: Layer.Layer<Orders> = Orders.layerMemory()
) => {
  const { makeCheckoutHttpHandler } = await import("../lib/checkout/http");
  const commerceApp = makeTestCommerceApp(
    layer,
    addressBookLayer,
    checkoutPaymentsLayer,
    ordersLayer
  );
  const authenticationLayer = makeAuthenticationLayer(layer);

  return makeCheckoutHttpHandler({ authenticationLayer, commerceApp });
};

const emptyContext = () => Context.empty();

describe("Checkout REST API", () => {
  test("GET /checkout/current reads current checkout state through CheckoutSession", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(request(), emptyContext());
      const body = await response.json();
      expect(response.status).toBe(HTTP_OK);
      expect(body).toMatchObject({
        activeStep: "contact",
        cart: {
          id: "cart-1",
          lineItems: [{ id: "line-1" }],
        },
        deliveryPlanQuote: {
          plans: [],
          reference: "empty-delivery-quote",
        },
        details: {},
        scope: {
          channel: "storefrontAnonymous",
          locale: "en-US",
        },
        steps: [
          { id: "contact", status: "incomplete" },
          { id: "deliveryDetails", status: "incomplete" },
          { id: "shippingOptions", status: "incomplete" },
          { id: "paymentOptions", status: "incomplete" },
          { id: "reviewOrder", status: "incomplete" },
        ],
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current returns available and selected Shipping Options", async () => {
    const currentCart = {
      ...cart(),
      checkoutDetails: { selectedDeliveryPlan },
    };
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({ currentCart, deliveryPlanQuote })
    );

    try {
      const response = await handler(request(), emptyContext());
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.deliveryPlanQuote).toStrictEqual(deliveryPlanQuote);
      expect(body.details.selectedDeliveryPlan).toStrictEqual(
        selectedDeliveryPlan
      );
      expect(body.cart.checkoutDetails.selectedDeliveryPlan).toStrictEqual(
        selectedDeliveryPlan
      );
      expect(body.steps).toContainEqual({
        id: "shippingOptions",
        status: "complete",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/payment-options/prepare returns a self-describing Card client integration", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        currentCart: paymentReadyCart(),
        deliveryPlanQuote,
      }),
      AddressBook.layerMemory(),
      makeCheckoutPaymentsLayer()
    );

    try {
      const response = await handler(
        preparePaymentOptionsRequest(),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.paymentOptions).toStrictEqual(cardPaymentOptions);
      expect(body.state.activeStep).toBe("paymentOptions");
      expect(JSON.stringify(body)).not.toContain(cardPaymentReference);
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/payment-options/prepare rejects Checkout before Shipping Options", async () => {
    let prepareCalled = false;
    const cartBeforeShipping = {
      ...cart(),
      checkoutDetails: {
        contact: manualContact,
        deliveryDetails: manualDeliveryDetails,
      },
    };
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({ currentCart: cartBeforeShipping, deliveryPlanQuote }),
      AddressBook.layerMemory(),
      makeCheckoutPaymentsLayer({
        onPrepare: () => {
          prepareCalled = true;
        },
      })
    );

    try {
      const response = await handler(
        preparePaymentOptionsRequest(),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_CONFLICT);
      expect(body).toStrictEqual({
        _tag: "CheckoutPaymentOptionsUnavailable",
        category: "conflict",
        code: "checkout.paymentOptions.unavailable",
        message: "Complete the current checkout step before preparing payment.",
        reason: "shippingOptionsIncomplete",
        recovery: "refresh",
      });
      expect(prepareCalled).toBeFalsy();
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/payment-options accepts a client ConfirmationToken handoff", async () => {
    let received: SaveCheckoutPaymentInput | undefined;
    const confirmationReference = PaymentConfirmationReference.make(
      "ctoken-from-mobile-client"
    );
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        currentCart: paymentReadyCart(),
        deliveryPlanQuote,
      }),
      AddressBook.layerMemory(),
      makeCheckoutPaymentsLayer({
        onSave: (input) => {
          received = input;
        },
      })
    );

    try {
      const response = await handler(
        savePaymentOptionsRequest({
          confirmationReference,
          method: "card",
          preparationReference: cardPreparationReference,
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(received).toMatchObject({
        billingAddress: manualDeliveryDetails.shippingAddress,
        checkout: {
          amount: money,
          reference: "cart-1",
        },
        selection: {
          confirmationReference,
          method: "card",
          preparationReference: cardPreparationReference,
        },
      });
      expect(body.details.preparedPayment).toStrictEqual({
        amount: money,
        method: "card",
      });
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain(confirmationReference);
      expect(serialized).not.toContain(cardPaymentReference);
      expect(serialized).not.toContain(cardPreparationReference);
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/payment-options preserves Payment Method unavailability", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        currentCart: paymentReadyCart(),
        deliveryPlanQuote,
      }),
      AddressBook.layerMemory(),
      makeCheckoutPaymentsLayer({
        saveFailure: new PaymentMethodUnavailable({
          method: "card",
          reason: "notEligible",
        }),
      })
    );

    try {
      const response = await handler(
        savePaymentOptionsRequest({
          confirmationReference: "ctoken-from-api-input",
          method: "card",
          preparationReference: cardPreparationReference,
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_CONFLICT);
      expect(body).toMatchObject({
        _tag: "CheckoutPaymentMethodUnavailable",
        category: "conflict",
        code: "checkout.paymentOptions.methodUnavailable",
        method: "card",
        reason: "notEligible",
        recovery: "refresh",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/payment-options preserves an ambiguous Cart write outcome", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        currentCart: paymentReadyCart(),
        deliveryPlanQuote,
        savePaymentOptionsFailure: new CartWriteOutcomeUnknown({
          cartId: CartId.make("cart-1"),
          operation: "savePaymentOptions",
        }),
      }),
      AddressBook.layerMemory(),
      makeCheckoutPaymentsLayer()
    );

    try {
      const response = await handler(
        savePaymentOptionsRequest({
          confirmationReference: "ctoken-from-api-input",
          method: "card",
          preparationReference: cardPreparationReference,
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationOutcomeUnknown",
        cartId: "cart-1",
        category: "unavailable",
        code: "checkout.paymentOptions.outcomeUnknown",
        recovery: "refresh",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/payment-options maps a transient Payment provider failure", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        currentCart: paymentReadyCart(),
        deliveryPlanQuote,
      }),
      AddressBook.layerMemory(),
      makeCheckoutPaymentsLayer({
        saveFailure: new PaymentProviderFailure({
          operation: "cardPayment.save",
          reason: "unavailable",
        }),
      })
    );

    try {
      const response = await handler(
        savePaymentOptionsRequest({
          confirmationReference: "ctoken-from-api-input",
          method: "card",
          preparationReference: cardPreparationReference,
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationProviderFailure",
        category: "unavailable",
        code: "checkout.paymentOptions.providerFailure",
        recovery: "retry",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current adds localized fallback messages to public violations", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        cartPolicyViolations: [
          {
            code: "INCOMPATIBLE_CART_ITEMS",
            targets: [{ type: "cart" }],
          },
        ],
        currentCart: {
          ...cart(),
          storeKey: StoreKey.make("de-fr-uk"),
        },
      })
    );

    try {
      const response = await handler(
        request({
          cookie: anonymousCartCookieHeader({
            currency: "EUR",
            locale: "de-DE",
            storeKey: "de-fr-uk",
          }),
          "x-context-locale": "de-DE",
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.violations).toStrictEqual([
        expect.objectContaining({
          code: "INCOMPATIBLE_CART_ITEMS",
          message: "Diese Artikel können nicht zusammen gekauft werden.",
          source: "cartPolicy",
        }),
      ]);
      expect(body.violations[0].message).not.toContain("Internal diagnostic");
    } finally {
      await dispose();
    }
  });

  test.each(["en-CA", "toString"])(
    "GET /checkout/current rejects unsupported locale %s with a typed bad request",
    async (locale) => {
      const { dispose, handler } = await makeHandler(makeCheckoutLayer());

      try {
        const response = await handler(
          request({ "x-context-locale": locale }),
          emptyContext()
        );
        const body = await response.json();

        expect(response.status).toBe(HTTP_BAD_REQUEST);
        expect(body).toMatchObject({
          _tag: "InputInvalid",
          code: "input.invalid",
          issues: [{ path: ["x-context-locale"] }],
          message: "The checkout request is invalid.",
        });
      } finally {
        await dispose();
      }
    }
  );

  test("POST /checkout/delivery-details preserves HTTP payload schema paths", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        saveDeliveryDetailsRequest({
          deliveryDetails: cartOnlyDeliveryDetailsInput,
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(body).toMatchObject({
        _tag: "InputInvalid",
        issues: [{ path: ["cart"] }],
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/contact saves Manual Contact and returns recomputed checkout state", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(saveContactRequest(), emptyContext());
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body).toMatchObject({
        activeStep: "deliveryDetails",
        details: {
          contact: manualContact,
        },
      });
      expect(body.steps[0]).toMatchObject({
        id: "contact",
        status: "complete",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/contact resolves Customer Profile from verified bearer context and ignores spoofed customer headers", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer({
        allowedContactSources: ["customerProfile"],
        customerProfiles: [customerProfile],
      }),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        saveContactRequest(
          saveContactPayload({ contact: { source: "customerProfile" } }),
          {
            authorization: "Bearer valid-token",
            "x-context-customer-id": "customer-spoof",
          }
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.scope).toStrictEqual({
        channel: "storefrontCustomer",
        locale: "en-US",
      });
      expect(body.details.contact).toStrictEqual({
        buyerContact: {
          email: "profile@example.com",
          firstName: "Profile",
          lastName: "Buyer",
        },
        source: "customerProfile",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/contact reports an incomplete Customer Profile as unprocessable content", async () => {
    const incompleteProfile = new CommerceCustomerProfile({
      customerId: CommerceCustomerId.make("customer-1"),
      firstName: Redacted.make("Profile", { label: "personName" }),
      lastName: Redacted.make("Buyer", { label: "personName" }),
    });
    const layer = Layer.mergeAll(
      makeCheckoutLayer({
        allowedContactSources: ["customerProfile"],
        customerProfiles: [incompleteProfile],
      }),
      makeCommerceAccountsLayer(
        incompleteProfile.customerId,
        incompleteProfile
      ),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        saveContactRequest(
          saveContactPayload({ contact: { source: "customerProfile" } }),
          { authorization: "Bearer valid-token" }
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_UNPROCESSABLE_CONTENT);
      expect(body).toStrictEqual({
        _tag: "CheckoutCustomerProfileIncomplete",
        category: "bad_input",
        code: "checkout.contact.customerProfileIncomplete",
        message:
          "Your customer profile is missing required contact information. Enter it below to continue.",
        missingFields: ["email"],
        recovery: "fix_input",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/contact cannot save Customer Profile from a spoofed customer header", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({ customerProfiles: [customerProfile] })
    );

    try {
      const response = await handler(
        saveContactRequest(
          saveContactPayload({ contact: { source: "customerProfile" } }),
          { "x-context-customer-id": "customer-1" }
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationSourceUnavailable",
        category: "bad_input",
        code: "checkout.contact.sourceUnavailable",
        message: "This contact source is unavailable for this checkout.",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/contact obtains Checkout Scope from request context, not payload cart id", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        saveContactRequest(saveContactPayload({ cartId: "cart-from-payload" })),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_CONFLICT);
      expect(body).toMatchObject({
        _tag: "CheckoutCartMismatch",
        category: "conflict",
        code: "checkout.cartMismatch",
        message: "This checkout is no longer current. Refresh and try again.",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/contact maps invalid Manual Contact input to bad request", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        saveContactRequest(
          saveContactPayload({
            contact: {
              ...manualContact,
              buyerContact: {
                ...manualContact.buyerContact,
                firstName: "",
              },
            },
          })
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationSchemaFailure",
        category: "bad_input",
        code: "checkout.contact.invalidInput",
        issues: [{ path: ["firstName"] }],
        message: "Enter an email, first name, and last name.",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/contact allows Manual Contact for a signed-in customer", async () => {
    const { dispose, handler } = await makeHandler(
      Layer.mergeAll(
        makeCheckoutLayer(),
        makeCommerceAccountsLayer(),
        makeJwtVerifierLayer()
      )
    );

    try {
      const response = await handler(
        saveContactRequest(undefined, { authorization: "Bearer valid-token" }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body).toMatchObject({
        activeStep: "deliveryDetails",
        details: {
          contact: manualContact,
        },
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/contact maps provider failures to internal errors", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        saveContactFailure: new CheckoutMutationProviderFailure({
          message: "Commercetools update failed",
          operation: "checkout.contact.save",
          reason: "unavailable",
        }),
      })
    );

    try {
      const response = await handler(saveContactRequest(), emptyContext());
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationProviderFailure",
        category: "unavailable",
        code: "checkout.internal",
        message: "Checkout could not be completed. Try again.",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/contact preserves an ambiguous Cart write outcome", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        saveContactFailure: new CartWriteOutcomeUnknown({
          cartId: CartId.make("cart-1"),
          operation: "saveContact",
        }),
      })
    );

    try {
      const response = await handler(saveContactRequest(), emptyContext());
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationOutcomeUnknown",
        cartId: "cart-1",
        category: "unavailable",
        code: "checkout.contact.outcomeUnknown",
        recovery: "refresh",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/contact sanitizes invalid provider data as an unexpected defect", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        providerFailureReason: "invalidData",
        saveContactFailure: new CheckoutMutationProviderFailure({
          message: "Provider returned invalid Cart data",
          operation: "checkout.contact.save",
          reason: "invalidData",
        }),
      })
    );

    try {
      const response = await handler(saveContactRequest(), emptyContext());
      const body = await response.json();

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
      expect(body).toMatchObject({
        _tag: "Unexpected",
        code: "unexpected",
        message: "Something went wrong.",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/contact maps an unavailable Cart to checkout not found", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({ currentCart: undefined })
    );

    try {
      const response = await handler(saveContactRequest(), emptyContext());
      const body = await response.json();

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(body).toMatchObject({
        _tag: "CheckoutUnavailable",
        category: "not_found",
        code: "checkout.notFound",
        message: "Checkout was not found for the current request.",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details saves a Manual Shipping Address and returns recomputed checkout state", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.details.deliveryDetails).toStrictEqual(manualDeliveryDetails);
      expect(body.steps[1]).toMatchObject({
        id: "deliveryDetails",
        status: "complete",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details is idempotent for the same Manual Shipping Address", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const firstResponse = await handler(
        saveDeliveryDetailsRequest(),
        emptyContext()
      );
      const firstBody = await firstResponse.json();
      const secondResponse = await handler(
        saveDeliveryDetailsRequest(),
        emptyContext()
      );
      const secondBody = await secondResponse.json();

      expect(firstResponse.status).toBe(HTTP_OK);
      expect(secondResponse.status).toBe(HTTP_OK);
      expect(firstBody.cart).not.toHaveProperty("version");
      expect(secondBody.cart).not.toHaveProperty("version");
      expect(secondBody.details.deliveryDetails).toStrictEqual(
        manualDeliveryDetails
      );
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details copies an existing Address Book Entry to the Cart", async () => {
    const reference = AddressBookReference.make("london-office");
    const entry = new AddressBookEntry({
      address: {
        ...manualDeliveryDetails.shippingAddress,
        addressLine1: "10 Canonical Way",
      },
      defaultBilling: false,
      defaultShipping: false,
      reference,
      types: ["shipping"],
    });
    const addressBookLayer = makeAddressBookLayer([entry]);
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer, addressBookLayer);

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(
          saveDeliveryDetailsPayload({
            deliveryDetails: {
              addressBookReference: reference,
              type: "addressBook",
            },
          }),
          { authorization: "Bearer valid-token" }
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.details.deliveryDetails).toStrictEqual({
        addressBookReference: reference,
        shippingAddress: entry.address,
        source: "addressBook",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details returns a stable unavailable-entry error", async () => {
    const reference = AddressBookReference.make("missing-office");
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(
      layer,
      makeAddressBookLayer()
    );

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(
          saveDeliveryDetailsPayload({
            deliveryDetails: {
              addressBookReference: reference,
              type: "addressBook",
            },
          }),
          { authorization: "Bearer valid-token" }
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_CONFLICT);
      expect(body).toStrictEqual({
        _tag: "CheckoutMutationAddressBookEntryUnavailable",
        addressBookReference: reference,
        category: "conflict",
        code: "checkout.deliveryDetails.addressBookEntryUnavailable",
        message: "This saved address is no longer available.",
        recovery: "refresh",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details saves a new address with an internally generated reference", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(
      layer,
      makeAddressBookLayer()
    );

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(
          saveDeliveryDetailsPayload({
            deliveryDetails: {
              makeDefaultShipping: true,
              saveToAddressBook: true,
              shippingAddress: manualDeliveryDetails.shippingAddress,
              type: "manual",
            },
          }),
          { authorization: "Bearer valid-token" }
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.details.deliveryDetails).toMatchObject({
        shippingAddress: manualDeliveryDetails.shippingAddress,
        source: "addressBook",
      });
      expect(body.details.deliveryDetails.addressBookReference).toMatch(
        ADDRESS_BOOK_REFERENCE_PATTERN
      );
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details saves only for the verified Business Unit principal", async () => {
    let savingPrincipal: CustomerCommercePrincipal | undefined;
    const addressBookLayer = makeAddressBookLayer([], (principal) => {
      savingPrincipal = principal;
    });
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer, addressBookLayer);

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(
          saveDeliveryDetailsPayload({
            deliveryDetails: {
              makeDefaultShipping: false,
              saveToAddressBook: true,
              shippingAddress: manualDeliveryDetails.shippingAddress,
              type: "manual",
            },
          }),
          {
            authorization: "Bearer valid-token",
            "x-context-business-unit-id": "business-unit-1",
            "x-context-customer-id": "customer-spoof",
          }
        ),
        emptyContext()
      );

      expect(response.status).toBe(HTTP_OK);
      expect(savingPrincipal?.customerId).toBe("customer-1");
      expect(savingPrincipal?.businessUnitId).toBe("business-unit-1");
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details returns saved state without a response reread", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(
      layer,
      makeAddressBookLayer()
    );

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(
          saveDeliveryDetailsPayload({
            deliveryDetails: {
              makeDefaultShipping: false,
              saveToAddressBook: true,
              shippingAddress: manualDeliveryDetails.shippingAddress,
              type: "manual",
            },
          }),
          { authorization: "Bearer valid-token" }
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body).toMatchObject({
        details: {
          deliveryDetails: {
            addressBookReference: expect.stringMatching(
              ADDRESS_BOOK_REFERENCE_PATTERN
            ),
          },
        },
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details returns the saved reference after a Cart-phase failure", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer({
        saveDeliveryDetailsFailure: new CheckoutMutationProviderFailure({
          message: "Commercetools update failed",
          operation: "checkout.deliveryDetails.save",
          reason: "unavailable",
        }),
      }),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(
      layer,
      makeAddressBookLayer()
    );

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(
          saveDeliveryDetailsPayload({
            deliveryDetails: {
              makeDefaultShipping: false,
              saveToAddressBook: true,
              shippingAddress: manualDeliveryDetails.shippingAddress,
              type: "manual",
            },
          }),
          { authorization: "Bearer valid-token" }
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationProviderFailure",
        addressBookReference: expect.stringMatching(
          ADDRESS_BOOK_REFERENCE_PATTERN
        ),
        category: "unavailable",
        code: "checkout.deliveryDetails.providerFailure",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details preserves the saved reference when the Cart write outcome is unknown", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer({
        saveDeliveryDetailsFailure: new CartWriteOutcomeUnknown({
          cartId: CartId.make("cart-1"),
          operation: "saveDeliveryDetails",
        }),
      }),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(
      layer,
      makeAddressBookLayer()
    );

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(
          saveDeliveryDetailsPayload({
            deliveryDetails: {
              makeDefaultShipping: false,
              saveToAddressBook: true,
              shippingAddress: manualDeliveryDetails.shippingAddress,
              type: "manual",
            },
          }),
          { authorization: "Bearer valid-token" }
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationOutcomeUnknown",
        addressBookReference: expect.stringMatching(
          ADDRESS_BOOK_REFERENCE_PATTERN
        ),
        cartId: "cart-1",
        category: "unavailable",
        code: "checkout.deliveryDetails.outcomeUnknown",
        recovery: "refresh",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details obtains Checkout Scope from request context, not payload cart id", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(
          saveDeliveryDetailsPayload({ cartId: "cart-from-payload" })
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_CONFLICT);
      expect(body).toMatchObject({
        _tag: "CheckoutCartMismatch",
        category: "conflict",
        code: "checkout.cartMismatch",
        message: "This checkout is no longer current. Refresh and try again.",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details ignores caller-supplied customer id headers", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(undefined, {
          "x-context-customer-id": "customer-spoof",
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.scope).toStrictEqual({
        channel: "storefrontAnonymous",
        locale: "en-US",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details maps invalid Manual Shipping Address input to bad request", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(
          saveDeliveryDetailsPayload({
            deliveryDetails: {
              ...cartOnlyDeliveryDetailsInput,
              shippingAddress: {
                ...cartOnlyDeliveryDetailsInput.shippingAddress,
                city: "",
              },
            },
          })
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationSchemaFailure",
        category: "bad_input",
        code: "checkout.deliveryDetails.invalidInput",
        message: "Enter address line 1, postal code, city, and country.",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details rejects invalid ISO country codes at the schema boundary", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        saveDeliveryDetailsRequest({
          cart: { id: "cart-1" },
          deliveryDetails: {
            ...cartOnlyDeliveryDetailsInput,
            shippingAddress: {
              ...cartOnlyDeliveryDetailsInput.shippingAddress,
              country: "ZZ",
            },
          },
        }),
        emptyContext()
      );

      const body = await response.json();

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(body).toMatchObject({
        _tag: "InputInvalid",
        code: "input.invalid",
        message: "The checkout request is invalid.",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/delivery-details maps provider failures to internal errors", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        saveDeliveryDetailsFailure: new CheckoutMutationProviderFailure({
          message: "Commercetools update failed",
          operation: "checkout.deliveryDetails.save",
          reason: "unavailable",
        }),
      })
    );

    try {
      const response = await handler(
        saveDeliveryDetailsRequest(),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationProviderFailure",
        category: "unavailable",
        code: "checkout.deliveryDetails.providerFailure",
        message: "Delivery details could not be saved. Try again.",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/shipping-options saves an authoritative Shipping Option selection", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({ deliveryPlanQuote })
    );

    try {
      const response = await handler(
        saveShippingOptionsRequest(),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.details.selectedDeliveryPlan).toStrictEqual(
        selectedDeliveryPlan
      );
      expect(body.cart.checkoutDetails.selectedDeliveryPlan).toStrictEqual(
        selectedDeliveryPlan
      );
      expect(body.steps).toContainEqual({
        id: "shippingOptions",
        status: "complete",
      });
      expect(body.scope).toStrictEqual({
        channel: "storefrontAnonymous",
        locale: "en-US",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/shipping-options resolves authenticated Checkout Scope and ignores spoofed customer headers", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer({ deliveryPlanQuote }),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        saveShippingOptionsRequest(undefined, {
          authorization: "Bearer valid-token",
          "x-context-customer-id": "customer-spoof",
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.scope).toStrictEqual({
        channel: "storefrontCustomer",
        locale: "en-US",
      });
      expect(body.details.selectedDeliveryPlan).toStrictEqual(
        selectedDeliveryPlan
      );
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/shipping-options rejects an empty Delivery Group selection at the schema boundary", async () => {
    let currentCartWasRead = false;
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        deliveryPlanQuote,
        onCurrentCartRead: () => {
          currentCartWasRead = true;
        },
      })
    );

    try {
      const response = await handler(
        saveShippingOptionsRequest({
          cart: { id: "cart-1" },
          selection: { ...deliveryPlanSelection, groups: [] },
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(body).toMatchObject({
        _tag: "InputInvalid",
        code: "input.invalid",
        issues: [{ path: ["selection", "groups", "0"] }],
        message: "The checkout request is invalid.",
      });
      expect(currentCartWasRead).toBeFalsy();
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/shipping-options rejects a stale Delivery Plan Quote", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({ deliveryPlanQuote })
    );
    const staleSelection = {
      ...deliveryPlanSelection,
      quoteReference: DeliveryPlanQuoteReference.make("stale-quote"),
    };

    try {
      const response = await handler(
        saveShippingOptionsRequest(
          saveShippingOptionsPayload({ selection: staleSelection })
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_CONFLICT);
      expect(body).toMatchObject({
        _tag: "CheckoutShippingSelectionUnavailable",
        category: "conflict",
        code: "checkout.shippingOptions.selectionUnavailable",
        planReference: "plan-1",
        quoteReference: "stale-quote",
        recovery: "refresh",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/shipping-options obtains Checkout Scope from request context, not payload cart id", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({ deliveryPlanQuote })
    );

    try {
      const response = await handler(
        saveShippingOptionsRequest(
          saveShippingOptionsPayload({ cartId: "cart-from-payload" })
        ),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_CONFLICT);
      expect(body).toMatchObject({
        _tag: "CheckoutCartMismatch",
        category: "conflict",
        code: "checkout.cartMismatch",
        currentCartId: "cart-1",
        submittedCartId: "cart-from-payload",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/shipping-options preserves an ambiguous Cart write outcome", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        deliveryPlanQuote,
        saveShippingOptionsFailure: new CartWriteOutcomeUnknown({
          cartId: CartId.make("cart-1"),
          operation: "saveShippingOptions",
        }),
      })
    );

    try {
      const response = await handler(
        saveShippingOptionsRequest(),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationOutcomeUnknown",
        cartId: "cart-1",
        category: "unavailable",
        code: "checkout.shippingOptions.outcomeUnknown",
        recovery: "refresh",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/shipping-options distinguishes a saved selection that requires refresh", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        deliveryPlanQuote,
        saveShippingOptionsFailure: new CartShippingOptionsRefreshRequired({
          cartId: CartId.make("cart-1"),
          operation: "saveShippingOptions",
        }),
      })
    );

    try {
      const response = await handler(
        saveShippingOptionsRequest(),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CheckoutShippingOptionsRefreshRequired",
        cartId: "cart-1",
        category: "unavailable",
        code: "checkout.shippingOptions.refreshRequired",
        recovery: "refresh",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/shipping-options maps provider failures to a retryable response", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        deliveryPlanQuote,
        saveShippingOptionsFailure: new CartProviderFailure({
          cause: { authorization: "Bearer private-provider-secret" },
          operation: "saveShippingOptions",
          reason: "unavailable",
        }),
      })
    );

    try {
      const response = await handler(
        saveShippingOptionsRequest(),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CheckoutMutationProviderFailure",
        category: "unavailable",
        code: "checkout.shippingOptions.providerFailure",
        recovery: "retry",
      });
      expect(body).not.toHaveProperty("cause");
      expect(body).not.toHaveProperty("operation");
      expect(JSON.stringify(body)).not.toContain("private-provider-secret");
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current ignores caller-supplied customer id headers", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        request({ "x-context-customer-id": "customer-spoof" }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.scope).toStrictEqual({
        channel: "storefrontAnonymous",
        locale: "en-US",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current accepts anonymous cart possession from the cart cookie", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        requestWithoutAnonymousCart({ cookie: anonymousCartCookieHeader() }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.scope).toStrictEqual({
        channel: "storefrontAnonymous",
        locale: "en-US",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current expires a confirmed missing anonymous Cart cookie", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({ currentCart: undefined })
    );

    try {
      const response = await handler(
        requestWithoutAnonymousCart({ cookie: anonymousCartCookieHeader() }),
        emptyContext()
      );

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(response.headers.get("set-cookie")).toContain(
        `${ANONYMOUS_CART_COOKIE_NAME}=;`
      );
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current ignores a caller-supplied anonymous cart id header", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        requestWithoutAnonymousCart({
          "x-context-anonymous-cart-id": "cart-from-header",
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(body).toMatchObject({
        _tag: "CheckoutUnavailable",
        code: "checkout.notFound",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current ignores anonymous cart cookies for a different store context", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        requestWithoutAnonymousCart({
          cookie: anonymousCartCookieHeader({
            currency: "GBP",
            locale: "en-GB",
            storeKey: "de-fr-uk",
          }),
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(body).toMatchObject({
        _tag: "CheckoutUnavailable",
        code: "checkout.notFound",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current resolves customer scope from bearer JWT before anonymous cart", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        request({ authorization: "Bearer valid-token" }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.scope).toStrictEqual({
        channel: "storefrontCustomer",
        locale: "en-US",
      });
      expect(JSON.stringify(body)).not.toContain("businessUnitId");
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current ignores on-behalf-of customer id headers when a valid bearer JWT is present", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        request({
          authorization: "Bearer valid-token",
          "x-context-customer-id": "customer-spoof",
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.scope).toStrictEqual({
        channel: "storefrontCustomer",
        locale: "en-US",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current falls back when the Business Unit selector is outside the verified memberships", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        request({
          authorization: "Bearer valid-token",
          "x-context-business-unit-id": "business-unit-spoof",
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body.scope).toStrictEqual({
        channel: "storefrontCustomer",
        locale: "en-US",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current does not fall back to anonymous checkout for invalid bearer JWT", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        request({ authorization: "Bearer invalid-token" }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(body).toMatchObject({
        _tag: "CheckoutUnauthenticated",
        category: "unauthenticated",
        code: "checkout.unauthenticated",
        recovery: "reauthenticate",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current rejects malformed bearer authorization", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        request({ authorization: "1234567valid-token" }),
        emptyContext()
      );

      expect(response.status).toBe(HTTP_UNAUTHORIZED);
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current treats machine bearer tokens as unsupported for checkout", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        request({ authorization: "Bearer machine-token" }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(body).toMatchObject({
        _tag: "CheckoutUnauthenticated",
        code: "checkout.unauthenticated",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current maps missing customer account for valid bearer JWT to not found", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsWithoutCustomerLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        request({ authorization: "Bearer valid-token" }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(body).toMatchObject({
        _tag: "CommerceRequestContextNotFound",
        code: "checkout.notFound",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current maps missing Business Unit context for valid bearer JWT to not found", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsWithoutBusinessUnitLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        request({ authorization: "Bearer valid-token" }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(body).toMatchObject({
        _tag: "CommerceRequestContextNotFound",
        code: "checkout.notFound",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current maps JWT verifier runtime failures to an internal error", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeFailingJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        request({ authorization: "Bearer valid-token" }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CheckoutAuthenticationUnavailable",
        code: "checkout.internal",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current defects on unclassified JWT verifier failures", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeCommerceAccountsLayer(),
      makeUnexpectedJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        request({ authorization: "Bearer valid-token" }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
      expect(body).toStrictEqual({
        _tag: "Unexpected",
        category: "unexpected",
        code: "unexpected",
        message: "Something went wrong.",
        recovery: "none",
      });
      expect(JSON.stringify(body)).not.toContain("Private verifier diagnostic");
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current maps Commerce customer lookup runtime failures to an internal error", async () => {
    const layer = Layer.mergeAll(
      makeCheckoutLayer(),
      makeFailingCommerceAccountsLayer(),
      makeJwtVerifierLayer()
    );
    const { dispose, handler } = await makeHandler(layer);

    try {
      const response = await handler(
        request({ authorization: "Bearer valid-token" }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
      expect(body).toMatchObject({
        _tag: "CommerceAccountUnavailable",
        code: "checkout.internal",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current sanitizes invalid provider data as an unexpected defect", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        getCurrentFailure: new CheckoutProviderFailure({
          message: "Provider returned invalid Cart data",
          operation: "checkout.current",
          reason: "invalidData",
        }),
        providerFailureReason: "invalidData",
      })
    );

    try {
      const response = await handler(request(), emptyContext());
      const body = await response.json();

      expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
      expect(body).toMatchObject({
        _tag: "Unexpected",
        code: "unexpected",
        message: "Something went wrong.",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current maps an empty Cart to a checkout not-found response", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        currentCart: cart({ lineItems: [], totalLineItemQuantity: 0 }),
      })
    );

    try {
      const response = await handler(request(), emptyContext());

      expect(response.status).toBe(HTTP_NOT_FOUND);
      const body = await response.json();

      expect(body).toMatchObject({
        _tag: "CheckoutUnavailable",
        code: "checkout.notFound",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current maps missing checkout context to not found", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        requestWithoutAnonymousCart(),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(body).toMatchObject({
        _tag: "CheckoutUnavailable",
        code: "checkout.notFound",
      });
    } finally {
      await dispose();
    }
  });

  test("GET /checkout/current localizes the fallback error message from request context", async () => {
    const { dispose, handler } = await makeHandler(makeCheckoutLayer());

    try {
      const response = await handler(
        requestWithoutAnonymousCart({ "x-context-locale": "de-DE" }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_NOT_FOUND);
      expect(body).toMatchObject({
        _tag: "CheckoutUnavailable",
        code: "checkout.notFound",
        message: "Der Checkout wurde für diese Anfrage nicht gefunden.",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/orders replays one Order with stable Payment operation inputs", async () => {
    const authorizations: AuthorizeCheckoutPaymentInput[] = [];
    const finalizations: FinalizeCheckoutPaymentInput[] = [];
    const payments = makeCheckoutPaymentsLayer({
      onAuthorize: (input) => {
        authorizations.push(input);
      },
      onFinalize: (input) => {
        finalizations.push(input);
      },
    });
    const layer = makeCheckoutLayer({
      currentCart: orderReadyCart(),
      deliveryPlanQuote,
    });
    const { dispose, handler } = await makeHandler(
      layer,
      AddressBook.layerMemory(),
      payments
    );

    try {
      const first = await handler(placeOrderRequest(), emptyContext());
      const replay = await handler(placeOrderRequest(), emptyContext());
      const firstBody = await first.json();
      const replayBody = await replay.json();

      expect(first.status).toBe(HTTP_OK);
      expect(replay.status).toBe(HTTP_OK);
      expect(firstBody).toStrictEqual(replayBody);
      expect(firstBody).toMatchObject({
        _tag: "Placed",
        order: {
          cartId: "cart-1",
          id: "order-cart-1",
          number: "checkout-cart-1",
          totalPrice: money,
        },
        paymentStatus: "confirmed",
      });
      expect(authorizations).toHaveLength(1);
      expect(authorizations[0]).toMatchObject({
        checkout: { amount: money, reference: "cart-1" },
        payment: {
          paymentReference: "payment-from-api-input",
        },
      });
      expect(finalizations).toHaveLength(2);
      expect(finalizations).toMatchObject([
        {
          checkout: { amount: money, reference: "cart-1" },
          orderReference: "order-cart-1",
        },
        {
          checkout: { amount: money, reference: "cart-1" },
          orderReference: "order-cart-1",
        },
      ]);
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/orders returns a browser-safe Card authentication handoff", async () => {
    const payments = makeCheckoutPaymentsLayer({
      authorization: {
        _tag: "ActionRequired",
        clientToken: "pi-client-secret-for-mobile",
        provider: PaymentProvider.make("Stripe"),
        publicConfiguration: "pk_test_for_mobile",
      },
    });
    const layer = makeCheckoutLayer({
      currentCart: orderReadyCart(),
      deliveryPlanQuote,
    });
    const { dispose, handler } = await makeHandler(
      layer,
      AddressBook.layerMemory(),
      payments
    );

    try {
      const response = await handler(placeOrderRequest(), emptyContext());
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body).toStrictEqual({
        _tag: "PaymentActionRequired",
        paymentAction: {
          clientToken: "pi-client-secret-for-mobile",
          method: "card",
          provider: "Stripe",
          publicConfiguration: "pk_test_for_mobile",
        },
      });
      expect(JSON.stringify(body)).not.toContain("paymentReference");
      expect(JSON.stringify(body)).not.toContain("confirmationReference");
      expect(JSON.stringify(body)).not.toContain("preparationReference");
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/orders releases authorization after a definitive Order rejection", async () => {
    const cancellations: CheckoutPaymentOperationInput[] = [];
    const payments = makeCheckoutPaymentsLayer({
      onCancelAuthorization: (input) => {
        cancellations.push(input);
      },
    });
    const rejectedOrders = Layer.succeed(
      Orders,
      Orders.of({
        find: () => Effect.succeed(Option.none()),
        findById: () => Effect.succeed(Option.none()),
        place: () =>
          Effect.fail(
            new OrderPlacementRejected({
              message: "Cart inventory changed",
              reason: "outOfStock",
            })
          ),
      })
    );
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        currentCart: orderReadyCart(),
        deliveryPlanQuote,
      }),
      AddressBook.layerMemory(),
      payments,
      rejectedOrders
    );

    try {
      const response = await handler(placeOrderRequest(), emptyContext());
      const body = await response.json();

      expect(response.status).toBe(HTTP_CONFLICT);
      expect(body).toMatchObject({
        _tag: "OrderPlacementRejected",
        code: "checkout.orderPlacement.rejected",
        reason: "outOfStock",
      });
      expect(cancellations).toMatchObject([
        {
          checkout: { amount: money, reference: "cart-1" },
        },
      ]);
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/orders reports Payment pending after Order creation when capture fails", async () => {
    const payments = makeCheckoutPaymentsLayer({
      finalizeFailure: new PaymentProviderFailure({
        operation: "stripe.paymentIntent.capture",
        reason: "unavailable",
      }),
    });
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        currentCart: orderReadyCart(),
        deliveryPlanQuote,
      }),
      AddressBook.layerMemory(),
      payments
    );

    try {
      const response = await handler(placeOrderRequest(), emptyContext());
      const body = await response.json();

      expect(response.status).toBe(HTTP_OK);
      expect(body).toMatchObject({
        _tag: "Placed",
        order: { id: "order-cart-1" },
        paymentStatus: "pending",
      });
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/orders recovers an uncertain Order before finalizing Payment", async () => {
    let created = false;
    const authorizations: AuthorizeCheckoutPaymentInput[] = [];
    const finalizations: FinalizeCheckoutPaymentInput[] = [];
    const payments = makeCheckoutPaymentsLayer({
      onAuthorize: (input) => {
        authorizations.push(input);
      },
      onFinalize: (input) => {
        finalizations.push(input);
      },
    });
    const recoveringOrders = Layer.succeed(
      Orders,
      Orders.of({
        find: (input) =>
          Effect.succeed(
            created
              ? Option.some({
                  cartId: input.cartId,
                  id: OrderId.make("order-created-without-response"),
                  number: orderNumberForCart(input.cartId),
                  paymentReference: cardPaymentReference,
                  totalPrice: money,
                })
              : Option.none()
          ),
        findById: () => Effect.succeed(Option.none()),
        place: (input) => {
          created = true;
          return Effect.fail(
            new OrderPlacementOutcomeUnknown({
              cartId: input.cartId,
              message: "Order response was lost",
              number: orderNumberForCart(input.cartId),
            })
          );
        },
      })
    );
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        currentCart: orderReadyCart(),
        deliveryPlanQuote,
      }),
      AddressBook.layerMemory(),
      payments,
      recoveringOrders
    );

    try {
      const uncertain = await handler(placeOrderRequest(), emptyContext());
      const recovered = await handler(placeOrderRequest(), emptyContext());

      await expect(uncertain.json()).resolves.toStrictEqual({
        _tag: "PlacementPending",
      });
      await expect(recovered.json()).resolves.toMatchObject({
        _tag: "Placed",
        order: { id: "order-created-without-response" },
        paymentStatus: "confirmed",
      });
      expect(authorizations).toHaveLength(1);
      expect(finalizations).toHaveLength(1);
    } finally {
      await dispose();
    }
  });

  test("POST /checkout/orders rejects an empty Cart reference", async () => {
    const { dispose, handler } = await makeHandler(
      makeCheckoutLayer({
        currentCart: orderReadyCart(),
        deliveryPlanQuote,
      }),
      AddressBook.layerMemory(),
      makeCheckoutPaymentsLayer()
    );

    try {
      const response = await handler(
        placeOrderRequest({
          cart: { id: "" },
        }),
        emptyContext()
      );

      expect(response.status).toBe(HTTP_BAD_REQUEST);
    } finally {
      await dispose();
    }
  });
});
