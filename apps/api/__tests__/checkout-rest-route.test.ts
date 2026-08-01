import {
  AddressBookAccessDenied,
  AddressBookEntry,
  AddressBookEntryNotFound,
  AddressBookProviderFailure,
  AddressBookReference,
  normalizeAddressTypes,
} from "@repo/commerce/domain/address-book";
import {
  CartId,
  LineItemId,
  ProductId,
  Sku,
  StoreKey,
  VariantId,
} from "@repo/commerce/domain/cart";
import { CartProviderFailure } from "@repo/commerce/domain/cart-errors";
import type { CartSnapshot } from "@repo/commerce/domain/cart-snapshot";
import {
  type CartOnlyCheckoutDeliveryDetailsInput,
  type CheckoutContact,
  type CheckoutContactInput,
  type CheckoutDeliveryDetails,
  type CheckoutDeliveryDetailsInput,
  CheckoutMutationProviderFailure,
  CountryCode,
} from "@repo/commerce/domain/checkout";
import {
  CommerceBusinessUnitContext,
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "@repo/commerce/domain/commerce-account";
import {
  AuthUserId,
  type CustomerCommercePrincipal,
} from "@repo/commerce/domain/commerce-request-context";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  encodeAnonymousCartCookie,
  makeAnonymousCartCookie,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { AddressBook } from "@repo/commerce/services/address-book";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { Carts } from "@repo/commerce/services/carts";
import {
  CommerceAccountError,
  CommerceAccounts,
  CommerceBusinessUnitContextNotFound,
  CommerceCustomerIdNotFound,
} from "@repo/commerce/services/commerce-accounts";
import type { CurrencyCode, Locale } from "@repo/i18n/types";
import { Context, Effect, Layer, Option, Redacted } from "effect";
import { expect, test } from "vitest";
import {
  CheckoutCustomerJwtInvalid,
  CheckoutCustomerJwtVerificationFailure,
  CheckoutCustomerJwtVerifier,
} from "../lib/checkout/customer-jwt";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const ADDRESS_BOOK_REFERENCE_PATTERN = /^[A-Za-z0-9_-]+$/;

const money = {
  centAmount: 2500,
  currencyCode: "USD",
} as const;

type TestLineItem = CartSnapshot["lineItems"][number];

const defaultLineItems: TestLineItem[] = [
  {
    id: LineItemId.make("line-1"),
    quantity: 1,
    unitPrice: money,
    totalPrice: money,
    variant: {
      id: VariantId.make("1"),
      productId: ProductId.make("product-1"),
      name: "Hydra Wrench",
      sku: Sku.make("HYDRA-WRENCH"),
      images: [],
      attributes: {},
    },
  },
];

const cart = ({
  lineItems,
  totalLineItemQuantity,
}: {
  readonly lineItems?: TestLineItem[];
  readonly totalLineItemQuantity?: number;
} = {}) => {
  const resolvedLineItems = lineItems ?? defaultLineItems;

  return {
    id: CartId.make("cart-1"),
    status: "active" as const,
    storeKey: StoreKey.make("default-store"),
    lineItems: resolvedLineItems,
    totalLineItemQuantity:
      totalLineItemQuantity ??
      resolvedLineItems.reduce(
        (total, lineItem) => total + lineItem.quantity,
        0
      ),
    totalPrice: money,
    checkoutDetails: {},
  };
};

const request = (headers?: Record<string, string>) =>
  new Request("http://api.test/checkout/current", {
    method: "GET",
    headers: {
      "x-context-locale": "en-US",
      "x-context-anonymous-cart-id": "cart-1",
      ...headers,
    },
  });

const requestWithoutAnonymousCart = (headers?: Record<string, string>) =>
  new Request("http://api.test/checkout/current", {
    method: "GET",
    headers: {
      "x-context-locale": "en-US",
      ...headers,
    },
  });

const addressBookRequest = (headers?: Record<string, string>) =>
  new Request("http://api.test/address-book", {
    method: "GET",
    headers: {
      "x-context-locale": "en-US",
      ...headers,
    },
  });

const manualContact: CheckoutContact = {
  source: "manual",
  buyerContact: {
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    phoneNumber: "+15551234567",
  },
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
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-context-locale": "en-US",
      "x-context-anonymous-cart-id": "cart-1",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

const manualDeliveryDetails: CheckoutDeliveryDetails = {
  source: "manual",
  shippingAddress: {
    addressLine1: "123 Analytical Engine Way",
    addressLine2: "Suite 42",
    postalCode: "SW1A 1AA",
    city: "London",
    country: CountryCode.make("GB"),
    region: "Greater London",
  },
};

const cartOnlyDeliveryDetailsInput: CartOnlyCheckoutDeliveryDetailsInput = {
  type: "manual",
  saveToAddressBook: false,
  shippingAddress: manualDeliveryDetails.shippingAddress,
};

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
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-context-locale": "en-US",
      "x-context-anonymous-cart-id": "cart-1",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

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
    context: {
      currency,
      locale,
      storeKey,
    },
  });

  return `${ANONYMOUS_CART_COOKIE_NAME}=${encodeAnonymousCartCookie(cookie)}`;
};

const makeCheckoutLayer = (
  input: {
    readonly currentCart?: ReturnType<typeof cart> | undefined;
    readonly allowedContactSources?: readonly string[];
    readonly cartPolicyViolations?: readonly {
      readonly violationType: string;
      readonly metadata?: Readonly<Record<string, unknown>>;
    }[];
    readonly saveContactFailure?: CheckoutMutationProviderFailure;
    readonly saveDeliveryDetailsFailure?: CheckoutMutationProviderFailure;
    readonly getCurrentFailure?: CheckoutProviderFailure;
    readonly customerProfiles?: readonly CommerceCustomerProfile[];
    readonly addressBookLayer?: Layer.Layer<AddressBook>;
  } = {}
) => {
  const {
    cartPolicyViolations = [],
    saveContactFailure,
    saveDeliveryDetailsFailure,
    getCurrentFailure,
    customerProfiles = [],
    addressBookLayer: suppliedAddressBookLayer,
  } = input;
  const currentCart = "currentCart" in input ? input.currentCart : cart();

  const addressBookLayer =
    suppliedAddressBookLayer ?? AddressBook.layerMemory();
  const providerFailure = (
    operation: "findById" | "saveContact" | "saveDeliveryDetails",
    cause: unknown
  ) => new CartProviderFailure({ operation, reason: "unavailable", cause });
  let activeCart = currentCart;
  const forAnonymous = (value: NonNullable<typeof activeCart>) => {
    const { buyingContext: _buyingContext, ...anonymous } = value;
    return anonymous;
  };
  const forBusinessUnit = (value: NonNullable<typeof activeCart>) => ({
    ...value,
    buyingContext: {
      businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    },
  });
  const cartsLayer = Layer.succeed(
    Carts,
    Carts.of({
      findById: ({ id, store }) => {
        if (getCurrentFailure !== undefined) {
          return Effect.fail(providerFailure("findById", getCurrentFailure));
        }
        return Effect.succeed(
          activeCart?.id === id && activeCart.storeKey === store.storeKey
            ? Option.some(forAnonymous(activeCart))
            : Option.none()
        );
      },
      findActiveForBusinessUnit: ({ store }) => {
        if (getCurrentFailure !== undefined) {
          return Effect.fail(providerFailure("findById", getCurrentFailure));
        }
        return Effect.succeed(
          activeCart?.storeKey === store.storeKey
            ? [forBusinessUnit(activeCart)]
            : []
        );
      },
      createAnonymous: () => Effect.die("not used"),
      createForBusinessUnit: () => Effect.die("not used"),
      addItem: () => Effect.die("not used"),
      setLineItemQuantity: () => Effect.die("not used"),
      removeLineItem: () => Effect.die("not used"),
      saveContact: ({ target, contact }) => {
        if (saveContactFailure !== undefined) {
          return Effect.fail(
            providerFailure("saveContact", saveContactFailure)
          );
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
            providerFailure("saveDeliveryDetails", saveDeliveryDetailsFailure)
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
    })
  );
  const cartPoliciesLayer = Layer.succeed(
    CartPolicies,
    CartPolicies.of({
      evaluate: () =>
        Effect.succeed(
          cartPolicyViolations.map((violation) => ({
            code: violation.violationType,
            parameters: Object.fromEntries(
              Object.entries(violation.metadata ?? {}).filter(
                (entry): entry is [string, string | number] =>
                  typeof entry[1] === "string" || typeof entry[1] === "number"
              )
            ),
            targets: [{ type: "cart" as const }],
          }))
        ),
    })
  );

  return Layer.mergeAll(
    cartsLayer,
    cartPoliciesLayer,
    CheckoutPolicies.layer,
    CommerceAccounts.layerMemoryFrom({ customerProfiles }),
    addressBookLayer
  );
};

const makeAddressBookLayer = (
  initialEntries: readonly AddressBookEntry[] = [],
  onPrincipal?: (principal: CustomerCommercePrincipal) => void
) => {
  let entries = [...initialEntries];

  return Layer.succeed(
    AddressBook,
    AddressBook.of({
      list: (principal) =>
        Effect.sync(() => {
          onPrincipal?.(principal);
          return entries;
        }),
      get: (principal, reference) =>
        Effect.gen(function* () {
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
        }),
      save: (principal, input) =>
        Effect.sync(() => {
          onPrincipal?.(principal);
          const existing = entries.find(
            (candidate) => candidate.reference === input.reference
          );

          if (existing) {
            return existing;
          }

          const entry = new AddressBookEntry({
            ...input,
            types: normalizeAddressTypes(input.types, input),
          });
          entries = [...entries, entry];
          return entry;
        }),
    })
  );
};

const makeFailingAddressBookListLayer = (
  error: AddressBookAccessDenied | AddressBookProviderFailure
) =>
  Layer.succeed(
    AddressBook,
    AddressBook.of({
      list: () => Effect.fail(error),
      get: () => Effect.die("not used"),
      save: () => Effect.die("not used"),
    })
  );

const makeCommerceAccountsLayer = (
  customerId = CommerceCustomerId.make("customer-1")
) =>
  Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
      addAssociate: () => Effect.die("not used"),
      createFromRegistration: () => Effect.die("not used"),
      getBusinessUnitContextForCustomerInStore: () =>
        Effect.succeed(
          new CommerceBusinessUnitContext({
            businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
            businessUnitKey: CommerceBusinessUnitKey.make(
              "business-unit-key-1"
            ),
          })
        ),
      getCustomerProfile: () => Effect.succeed(customerProfile),
      getCustomerIdByAuthUserId: () => Effect.succeed(customerId),
      hasCustomerWithEmail: () => Effect.die("not used"),
      linkRegistrantIdentity: () => Effect.die("not used"),
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
      getBusinessUnitContextForCustomerInStore: () => Effect.die("not used"),
      getCustomerProfile: () => Effect.die("not used"),
      getCustomerIdByAuthUserId: () =>
        Effect.fail(
          new CommerceCustomerIdNotFound({
            message: "Commerce customer id does not exist for auth user",
            authUserId,
          })
        ),
      hasCustomerWithEmail: () => Effect.die("not used"),
      linkRegistrantIdentity: () => Effect.die("not used"),
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
      getBusinessUnitContextForCustomerInStore: (_, storeKey) =>
        Effect.fail(
          new CommerceBusinessUnitContextNotFound({
            message:
              "Commerce Business Unit context does not exist for customer in Store",
            customerId,
            storeKey,
          })
        ),
      getCustomerProfile: () => Effect.die("not used"),
      getCustomerIdByAuthUserId: () => Effect.succeed(customerId),
      hasCustomerWithEmail: () => Effect.die("not used"),
      linkRegistrantIdentity: () => Effect.die("not used"),
    })
  );

const makeFailingCommerceAccountsLayer = () =>
  Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
      addAssociate: () => Effect.die("not used"),
      createFromRegistration: () => Effect.die("not used"),
      getBusinessUnitContextForCustomerInStore: () => Effect.die("not used"),
      getCustomerProfile: () => Effect.die("not used"),
      getCustomerIdByAuthUserId: () =>
        Effect.fail(
          new CommerceAccountError({
            message: "Commerce account lookup failed",
          })
        ),
      hasCustomerWithEmail: () => Effect.die("not used"),
      linkRegistrantIdentity: () => Effect.die("not used"),
    })
  );

const makeJwtVerifierLayer = (authUserId = AuthUserId.make("auth-user-1")) =>
  Layer.succeed(
    CheckoutCustomerJwtVerifier,
    CheckoutCustomerJwtVerifier.of({
      verify: (token) =>
        token === "valid-token"
          ? Effect.succeed(authUserId)
          : Effect.fail(
              new CheckoutCustomerJwtInvalid({
                message: "Invalid checkout customer JWT",
              })
            ),
    })
  );

const makeFailingJwtVerifierLayer = () =>
  Layer.succeed(
    CheckoutCustomerJwtVerifier,
    CheckoutCustomerJwtVerifier.of({
      verify: () =>
        Effect.fail(
          new CheckoutCustomerJwtVerificationFailure({
            message: "JWT verifier unavailable",
          })
        ),
    })
  );

const makeHandler = async (layer: Layer.Layer<any, any, never>) => {
  const { makeCheckoutHttpHandler } = await import("../lib/checkout/http");

  return makeCheckoutHttpHandler({ layer });
};

const emptyContext = () => Context.empty() as Context.Context<unknown>;

test("GET /checkout/current reads current checkout state through CheckoutSession", async () => {
  const { dispose, handler } = await makeHandler(makeCheckoutLayer());

  try {
    const response = await handler(request(), emptyContext());
    const body = await response.json();
    expect(response.status).toBe(HTTP_OK);
    expect(body).toMatchObject({
      activeStep: "contact",
      scope: {
        channel: "storefrontAnonymous",
        locale: "en-US",
        anonymousCartId: "cart-1",
      },
      cart: {
        id: "cart-1",
        lineItems: [{ id: "line-1" }],
      },
      details: {},
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

test("GET /checkout/current adds localized fallback messages to public violations", async () => {
  const { dispose, handler } = await makeHandler(
    makeCheckoutLayer({
      currentCart: {
        ...cart(),
        storeKey: StoreKey.make("de-fr-uk"),
      },
      cartPolicyViolations: [
        {
          policyName: "compatible-products",
          violationType: "INCOMPATIBLE_CART_ITEMS",
          message: "Internal diagnostic message that must not be exposed",
        },
      ],
    })
  );

  try {
    const response = await handler(
      request({ "x-context-locale": "de-DE" }),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(body.violations).toEqual([
      expect.objectContaining({
        source: "cartPolicy",
        code: "INCOMPATIBLE_CART_ITEMS",
        message: "Diese Artikel können nicht zusammen gekauft werden.",
      }),
    ]);
    expect(body.violations[0].message).not.toContain("Internal diagnostic");
  } finally {
    await dispose();
  }
});

test.each([
  "en-CA",
  "toString",
])("GET /checkout/current rejects unsupported locale %s with a typed bad request", async (locale) => {
  const { dispose, handler } = await makeHandler(makeCheckoutLayer());

  try {
    const response = await handler(
      request({ "x-context-locale": locale }),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(body).toMatchObject({
      _tag: "CheckoutApiBadRequest",
      code: "checkout.badRequest",
      message: "The checkout request is invalid.",
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
    expect(body.scope).toMatchObject({
      channel: "storefrontCustomer",
      customerId: "customer-1",
    });
    expect(body.details.contact).toEqual({
      source: "customerProfile",
      buyerContact: {
        email: "profile@example.com",
        firstName: "Profile",
        lastName: "Buyer",
      },
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
      _tag: "CheckoutApiBadRequest",
      code: "checkout.badRequest",
      message: "The checkout request is invalid.",
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
      _tag: "CheckoutApiConflict",
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
      _tag: "CheckoutApiBadRequest",
      code: "checkout.badRequest",
      message: "The checkout request is invalid.",
    });
  } finally {
    await dispose();
  }
});

test("POST /checkout/contact maps disallowed Manual Contact source to bad request", async () => {
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

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(body).toMatchObject({
      _tag: "CheckoutApiBadRequest",
      code: "checkout.badRequest",
      message: "The checkout request is invalid.",
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
      }),
    })
  );

  try {
    const response = await handler(saveContactRequest(), emptyContext());
    const body = await response.json();

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    expect(body).toMatchObject({
      _tag: "CheckoutApiError",
      code: "checkout.internal",
      message: "Checkout could not be completed. Try again.",
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
      _tag: "CheckoutApiNotFound",
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
    expect(body.details.deliveryDetails).toEqual(manualDeliveryDetails);
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
    expect(secondBody.details.deliveryDetails).toEqual(manualDeliveryDetails);
  } finally {
    await dispose();
  }
});

test("GET /address-book returns entries for the verified Business Unit principal", async () => {
  const reference = AddressBookReference.make("london-office");
  const entry = new AddressBookEntry({
    reference,
    address: manualDeliveryDetails.shippingAddress,
    types: ["shipping"],
    defaultShipping: true,
    defaultBilling: false,
  });
  let listedCustomerId: CommerceCustomerId | undefined;
  const layer = Layer.mergeAll(
    makeCheckoutLayer({
      addressBookLayer: makeAddressBookLayer([entry], (principal) => {
        listedCustomerId = principal.customerId;
      }),
    }),
    makeCommerceAccountsLayer(),
    makeJwtVerifierLayer()
  );
  const { dispose, handler } = await makeHandler(layer);

  try {
    const response = await handler(
      addressBookRequest({
        authorization: "Bearer valid-token",
        "x-context-customer-id": "customer-spoof",
        "x-context-business-unit-id": "business-unit-spoof",
      }),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(body).toEqual([entry]);
    expect(listedCustomerId).toBe("customer-1");
    expect(JSON.stringify(body)).not.toContain("business-unit-1");
    expect(JSON.stringify(body)).not.toContain("customer-1");
  } finally {
    await dispose();
  }
});

test("GET /address-book requires an authenticated customer context", async () => {
  const { dispose, handler } = await makeHandler(makeCheckoutLayer());

  try {
    const response = await handler(addressBookRequest(), emptyContext());
    const body = await response.json();

    expect(response.status).toBe(HTTP_NOT_FOUND);
    expect(body).toMatchObject({
      _tag: "CheckoutApiNotFound",
      code: "checkout.notFound",
    });
  } finally {
    await dispose();
  }
});

test.each([
  {
    error: new AddressBookAccessDenied({
      message: "Buyer cannot access the Address Book",
      operation: "list",
    }),
    status: HTTP_BAD_REQUEST,
    code: "checkout.addressBook.accessDenied",
    message: "The address book is unavailable for this checkout.",
  },
  {
    error: new AddressBookProviderFailure({
      message: "Commercetools is unavailable",
      operation: "list",
    }),
    status: HTTP_INTERNAL_SERVER_ERROR,
    code: "checkout.addressBook.providerFailure",
    message: "Saved addresses could not be loaded. Try again.",
  },
])("GET /address-book maps $error._tag to a stable localized response", async ({
  error,
  status,
  code,
  message,
}) => {
  const layer = Layer.mergeAll(
    makeCheckoutLayer({
      addressBookLayer: makeFailingAddressBookListLayer(error),
    }),
    makeCommerceAccountsLayer(),
    makeJwtVerifierLayer()
  );
  const { dispose, handler } = await makeHandler(layer);

  try {
    const response = await handler(
      addressBookRequest({ authorization: "Bearer valid-token" }),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body).toMatchObject({ code, message });
  } finally {
    await dispose();
  }
});

test("POST /checkout/delivery-details copies an existing Address Book Entry to the Cart", async () => {
  const reference = AddressBookReference.make("london-office");
  const entry = new AddressBookEntry({
    reference,
    address: {
      ...manualDeliveryDetails.shippingAddress,
      addressLine1: "10 Canonical Way",
    },
    types: ["shipping"],
    defaultShipping: false,
    defaultBilling: false,
  });
  const layer = Layer.mergeAll(
    makeCheckoutLayer({
      addressBookLayer: makeAddressBookLayer([entry]),
    }),
    makeCommerceAccountsLayer(),
    makeJwtVerifierLayer()
  );
  const { dispose, handler } = await makeHandler(layer);

  try {
    const response = await handler(
      saveDeliveryDetailsRequest(
        saveDeliveryDetailsPayload({
          deliveryDetails: {
            type: "addressBook",
            addressBookReference: reference,
          },
        }),
        { authorization: "Bearer valid-token" }
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(body.details.deliveryDetails).toEqual({
      source: "addressBook",
      addressBookReference: reference,
      shippingAddress: entry.address,
    });
  } finally {
    await dispose();
  }
});

test("POST /checkout/delivery-details returns a stable unavailable-entry error", async () => {
  const reference = AddressBookReference.make("missing-office");
  const layer = Layer.mergeAll(
    makeCheckoutLayer({ addressBookLayer: makeAddressBookLayer() }),
    makeCommerceAccountsLayer(),
    makeJwtVerifierLayer()
  );
  const { dispose, handler } = await makeHandler(layer);

  try {
    const response = await handler(
      saveDeliveryDetailsRequest(
        saveDeliveryDetailsPayload({
          deliveryDetails: {
            type: "addressBook",
            addressBookReference: reference,
          },
        }),
        { authorization: "Bearer valid-token" }
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(body).toEqual({
      _tag: "CheckoutApiBadRequest",
      code: "checkout.deliveryDetails.addressBookEntryUnavailable",
      message: "This saved address is no longer available.",
      parameters: { addressBookReference: reference },
    });
  } finally {
    await dispose();
  }
});

test("POST /checkout/delivery-details saves a new address with an internally generated reference", async () => {
  const layer = Layer.mergeAll(
    makeCheckoutLayer({ addressBookLayer: makeAddressBookLayer() }),
    makeCommerceAccountsLayer(),
    makeJwtVerifierLayer()
  );
  const { dispose, handler } = await makeHandler(layer);

  try {
    const response = await handler(
      saveDeliveryDetailsRequest(
        saveDeliveryDetailsPayload({
          deliveryDetails: {
            type: "manual",
            shippingAddress: manualDeliveryDetails.shippingAddress,
            saveToAddressBook: true,
            makeDefaultShipping: true,
          },
        }),
        { authorization: "Bearer valid-token" }
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(body.details.deliveryDetails).toMatchObject({
      source: "addressBook",
      shippingAddress: manualDeliveryDetails.shippingAddress,
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
  const layer = Layer.mergeAll(
    makeCheckoutLayer({
      addressBookLayer: makeAddressBookLayer([], (principal) => {
        savingPrincipal = principal;
      }),
    }),
    makeCommerceAccountsLayer(),
    makeJwtVerifierLayer()
  );
  const { dispose, handler } = await makeHandler(layer);

  try {
    const response = await handler(
      saveDeliveryDetailsRequest(
        saveDeliveryDetailsPayload({
          deliveryDetails: {
            type: "manual",
            shippingAddress: manualDeliveryDetails.shippingAddress,
            saveToAddressBook: true,
            makeDefaultShipping: false,
          },
        }),
        {
          authorization: "Bearer valid-token",
          "x-context-customer-id": "customer-spoof",
          "x-context-business-unit-id": "business-unit-spoof",
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
    makeCheckoutLayer({
      addressBookLayer: makeAddressBookLayer(),
    }),
    makeCommerceAccountsLayer(),
    makeJwtVerifierLayer()
  );
  const { dispose, handler } = await makeHandler(layer);

  try {
    const response = await handler(
      saveDeliveryDetailsRequest(
        saveDeliveryDetailsPayload({
          deliveryDetails: {
            type: "manual",
            shippingAddress: manualDeliveryDetails.shippingAddress,
            saveToAddressBook: true,
            makeDefaultShipping: false,
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
      addressBookLayer: makeAddressBookLayer(),
      saveDeliveryDetailsFailure: new CheckoutMutationProviderFailure({
        message: "Commercetools update failed",
        operation: "checkout.deliveryDetails.save",
      }),
    }),
    makeCommerceAccountsLayer(),
    makeJwtVerifierLayer()
  );
  const { dispose, handler } = await makeHandler(layer);

  try {
    const response = await handler(
      saveDeliveryDetailsRequest(
        saveDeliveryDetailsPayload({
          deliveryDetails: {
            type: "manual",
            shippingAddress: manualDeliveryDetails.shippingAddress,
            saveToAddressBook: true,
            makeDefaultShipping: false,
          },
        }),
        { authorization: "Bearer valid-token" }
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    expect(body).toMatchObject({
      _tag: "CheckoutApiError",
      code: "checkout.deliveryDetails.providerFailure",
      parameters: {
        addressBookReference: expect.stringMatching(
          ADDRESS_BOOK_REFERENCE_PATTERN
        ),
      },
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
      _tag: "CheckoutApiConflict",
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
    expect(body.scope).toMatchObject({
      channel: "storefrontAnonymous",
      locale: "en-US",
      anonymousCartId: "cart-1",
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
      _tag: "CheckoutApiBadRequest",
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
      _tag: "CheckoutApiBadRequest",
      code: "checkout.badRequest",
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
      }),
    })
  );

  try {
    const response = await handler(
      saveDeliveryDetailsRequest(),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    expect(body).toMatchObject({
      _tag: "CheckoutApiError",
      code: "checkout.deliveryDetails.providerFailure",
      message: "Delivery details could not be saved. Try again.",
    });
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
    expect(body).toMatchObject({
      scope: {
        channel: "storefrontAnonymous",
        locale: "en-US",
        anonymousCartId: "cart-1",
      },
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
    expect(body).toMatchObject({
      scope: {
        channel: "storefrontAnonymous",
        locale: "en-US",
        anonymousCartId: "cart-1",
      },
    });
  } finally {
    await dispose();
  }
});

test("GET /checkout/current prefers anonymous cart cookie over anonymous cart header", async () => {
  const { dispose, handler } = await makeHandler(
    makeCheckoutLayer({
      currentCart: { ...cart(), id: CartId.make("cart-from-cookie") },
    })
  );

  try {
    const response = await handler(
      request({
        cookie: anonymousCartCookieHeader({ cartId: "cart-from-cookie" }),
        "x-context-anonymous-cart-id": "cart-from-header",
      }),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(body).toMatchObject({
      scope: {
        channel: "storefrontAnonymous",
        locale: "en-US",
        anonymousCartId: "cart-from-cookie",
      },
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
      _tag: "CheckoutApiNotFound",
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
    expect(body).toMatchObject({
      scope: {
        channel: "storefrontCustomer",
        locale: "en-US",
        customerId: "customer-1",
        businessUnitId: "business-unit-1",
        businessUnitKey: "business-unit-key-1",
      },
    });
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
    expect(body).toMatchObject({
      scope: {
        channel: "storefrontCustomer",
        locale: "en-US",
        customerId: "customer-1",
      },
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

    expect(response.status).toBe(HTTP_NOT_FOUND);
    expect(body).toMatchObject({
      _tag: "CheckoutApiNotFound",
      code: "checkout.notFound",
    });
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

    expect(response.status).toBe(HTTP_NOT_FOUND);
    expect(body).toMatchObject({
      _tag: "CheckoutApiNotFound",
      code: "checkout.notFound",
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
      _tag: "CheckoutApiNotFound",
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
      _tag: "CheckoutApiNotFound",
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

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    expect(body).toMatchObject({
      _tag: "CheckoutApiError",
      code: "checkout.internal",
    });
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

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    expect(body).toMatchObject({
      _tag: "CheckoutApiError",
      code: "checkout.internal",
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
      _tag: "CheckoutApiNotFound",
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
      _tag: "CheckoutApiNotFound",
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
      _tag: "CheckoutApiNotFound",
      code: "checkout.notFound",
      message: "Der Checkout wurde für diese Anfrage nicht gefunden.",
    });
  } finally {
    await dispose();
  }
});
