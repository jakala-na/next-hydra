import {
  AuthUserId as AccessTokenAuthUserId,
  AccessTokenInvalid,
  AccessTokenVerifier,
  VerifiedAccessToken,
} from "@repo/auth/access-token";
import { CountryCode } from "@repo/commerce/domain/address";
import {
  AddressBookAccessDenied,
  AddressBookEntry,
  AddressBookProviderFailure,
  AddressBookReference,
} from "@repo/commerce/domain/address-book";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import {
  AuthUserId,
  CommerceRequestContextNotFound,
} from "@repo/commerce/domain/commerce-request-context";
import type { CustomerCommercePrincipal } from "@repo/commerce/domain/commerce-request-context";
import { CheckoutPolicies } from "@repo/commerce/lib/checkout/checkout-policy";
import { ProductDiscovery } from "@repo/commerce/product";
import { makeCommerceApp } from "@repo/commerce/runtime/make-commerce-app";
import { AddressBook } from "@repo/commerce/services/address-book";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { Carts } from "@repo/commerce/services/carts";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { StoreKey } from "@repo/commerce/store";
import { Context, Effect, Layer } from "effect";
import { expect, test } from "vitest";

import { makeAddressBookHttpHandler } from "../lib/address-book/http";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;

const customerId = CommerceCustomerId.make("customer-1");
const authUserId = AuthUserId.make("auth-user-1");
const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");

const addressBookRequest = (headers?: Record<string, string>) =>
  new Request("http://api.test/address-book", {
    headers: {
      "x-context-locale": "en-US",
      ...headers,
    },
    method: "GET",
  });

const entry = new AddressBookEntry({
  address: {
    addressLine1: "123 Analytical Engine Way",
    city: "London",
    country: CountryCode.make("GB"),
    postalCode: "SW1A 1AA",
  },
  defaultBilling: false,
  defaultShipping: true,
  reference: AddressBookReference.make("london-office"),
  types: ["shipping"],
});

const makeAddressBookLayer = (
  list: (
    principal: CustomerCommercePrincipal
  ) => Effect.Effect<
    readonly AddressBookEntry[],
    | AddressBookAccessDenied
    | AddressBookProviderFailure
    | CommerceRequestContextNotFound
  >
) =>
  Layer.effect(
    AddressBook,
    Effect.gen(function* makeAddressBookLayer() {
      const commerceContext = yield* CommerceContext;

      return AddressBook.of({
        get: () => Effect.die("not used"),
        list: () =>
          commerceContext.customerPrincipal().pipe(Effect.flatMap(list)),
        save: () => Effect.die("not used"),
      });
    })
  );

const commerceAccountsLayer = CommerceAccounts.layerMemoryFrom({
  businessUnitMemberships: [
    {
      customerId,
      membership: new CommerceBusinessUnitMembership({
        businessUnitId,
        businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
        businessUnitLabel: CommerceBusinessUnitLabel.make("Business Unit One"),
        roles: ["admin", "buyer"],
      }),
      storeKey: StoreKey.make("default-store"),
    },
  ],
  customers: [{ authUserId, customerId }],
});

const authenticationLayer = Layer.succeed(
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

const makeHandler = (
  addressBookLayer: Layer.Layer<AddressBook, never, CommerceContext>
) => {
  const commerceApp = makeCommerceApp({
    addressBookLayer,
    cartPoliciesLayer: CartPolicies.layer,
    cartsLayer: Carts.layerMemory(),
    checkoutPoliciesLayer: CheckoutPolicies.layer,
    commerceAccountsLayer,
    productDiscoveryLayer: ProductDiscovery.testLayer(),
  });

  return makeAddressBookHttpHandler({
    authenticationLayer,
    commerceApp,
  });
};

const emptyContext = () => Context.empty() as Context.Context<unknown>;

test("GET /address-book returns entries for the verified Business Unit principal", async () => {
  let listedPrincipal: CustomerCommercePrincipal | undefined;
  const { dispose, handler } = makeHandler(
    makeAddressBookLayer((principal) => {
      listedPrincipal = principal;
      return Effect.succeed([entry]);
    })
  );

  try {
    const response = await handler(
      addressBookRequest({
        authorization: "Bearer valid-token",
        "x-context-business-unit-id": businessUnitId,
        "x-context-customer-id": "customer-spoof",
      }),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(body).toEqual([entry]);
    expect(listedPrincipal?.customerId).toBe(customerId);
    expect(listedPrincipal?.businessUnitId).toBe(businessUnitId);
    expect(JSON.stringify(body)).not.toContain(businessUnitId);
    expect(JSON.stringify(body)).not.toContain(customerId);
  } finally {
    await dispose();
  }
});

test("GET /address-book sanitizes response schema defects at the shared HTTP boundary", async () => {
  const { dispose, handler } = makeHandler(
    makeAddressBookLayer(() => Effect.succeed([undefined as never]))
  );

  try {
    const response = await handler(
      addressBookRequest({ authorization: "Bearer valid-token" }),
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
    expect(JSON.stringify(body)).not.toContain("AddressBookEntry");
  } finally {
    await dispose();
  }
});

test.each([
  {
    headers: undefined,
    label: "missing",
  },
  {
    headers: { authorization: "Bearer invalid-token" },
    label: "invalid",
  },
  {
    headers: { authorization: "1234567valid-token" },
    label: "malformed",
  },
])("GET /address-book rejects $label authentication", async ({ headers }) => {
  const { dispose, handler } = makeHandler(
    makeAddressBookLayer(() => Effect.succeed([]))
  );

  try {
    const response = await handler(addressBookRequest(headers), emptyContext());
    const body = await response.json();

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
    expect(body).toMatchObject({
      _tag: "AddressBookApiUnauthorized",
      code: "auth.unauthorized",
    });
  } finally {
    await dispose();
  }
});

test.each([
  {
    code: "addressBook.accessDenied",
    error: new AddressBookAccessDenied({
      message: "Buyer cannot access the Address Book",
      operation: "list",
    }),
    message: "Address Book access is denied.",
    status: HTTP_FORBIDDEN,
  },
  {
    code: "addressBook.contextUnavailable",
    error: new CommerceRequestContextNotFound({
      message: "Buying Context no longer exists",
      reason: "noBuyingContext",
    }),
    message: "The Address Book is unavailable for the current account.",
    status: HTTP_NOT_FOUND,
  },
  {
    code: "addressBook.unavailable",
    error: new AddressBookProviderFailure({
      message: "Commercetools is unavailable",
      operation: "list",
      reason: "unavailable",
    }),
    message: "The Address Book is temporarily unavailable.",
    status: HTTP_SERVICE_UNAVAILABLE,
  },
])(
  "GET /address-book maps '$error._tag' to its own HTTP error",
  async ({ error, status, code, message }) => {
    const { dispose, handler } = makeHandler(
      makeAddressBookLayer(() => Effect.fail(error))
    );

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
  }
);

test.each(["invalidData", "unexpectedResponse"] as const)(
  "GET /address-book sanitizes %s provider failures as unexpected defects",
  async (reason) => {
    const { dispose, handler } = makeHandler(
      makeAddressBookLayer(() =>
        Effect.fail(
          new AddressBookProviderFailure({
            message: "Private provider diagnostic",
            operation: "list",
            reason,
          })
        )
      )
    );

    try {
      const response = await handler(
        addressBookRequest({ authorization: "Bearer valid-token" }),
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
      expect(JSON.stringify(body)).not.toContain("Private provider diagnostic");
    } finally {
      await dispose();
    }
  }
);

test.each(["en-CA", "toString"])(
  "GET /address-book rejects unsupported locale %s with its own bad request",
  async (locale) => {
    const { dispose, handler } = makeHandler(
      makeAddressBookLayer(() => Effect.succeed([]))
    );

    try {
      const response = await handler(
        addressBookRequest({
          authorization: "Bearer valid-token",
          "x-context-locale": locale,
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(body).toMatchObject({
        _tag: "InputInvalid",
        code: "input.invalid",
        issues: [{ path: ["x-context-locale"] }],
      });
    } finally {
      await dispose();
    }
  }
);
