import {
  AnonymousId,
  CartId,
  LineItemId,
  ProductId,
  Sku,
  VariantId,
} from "@repo/commerce/domain/cart";
import { CommerceCustomerId } from "@repo/commerce/domain/commerce-account";
import { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  encodeAnonymousCartCookie,
  makeAnonymousCartCookie,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { CheckoutSession } from "@repo/commerce/lib/checkout/checkout-session";
import {
  CommerceAccountError,
  CommerceAccounts,
  CommerceCustomerIdNotFound,
} from "@repo/commerce/services/commerce-accounts";
import type { CurrencyCode, Locale } from "@repo/i18n/types";
import { Context, Effect, Layer } from "effect";
import { expect, test } from "vitest";
import {
  CheckoutCustomerJwtInvalid,
  CheckoutCustomerJwtVerificationFailure,
  CheckoutCustomerJwtVerifier,
} from "../lib/checkout/customer-jwt";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_INTERNAL_SERVER_ERROR = 500;

const money = {
  centAmount: 2500,
  currencyCode: "USD",
} as const;

type TestLineItem = {
  id: LineItemId;
  productId: ProductId;
  name: string;
  quantity: number;
  totalPrice: typeof money;
  variant: {
    id: VariantId;
    sku: Sku;
  };
};

const defaultLineItems: TestLineItem[] = [
  {
    id: LineItemId.make("line-1"),
    productId: ProductId.make("product-1"),
    name: "Hydra Wrench",
    quantity: 1,
    totalPrice: money,
    variant: {
      id: VariantId.make("1"),
      sku: Sku.make("HYDRA-WRENCH"),
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
    version: 7,
    anonymousId: AnonymousId.make("anon-1"),
    lineItems: resolvedLineItems,
    totalLineItemQuantity:
      totalLineItemQuantity ??
      resolvedLineItems.reduce(
        (total, lineItem) => total + lineItem.quantity,
        0
      ),
    totalPrice: money,
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

const makeCheckoutLayer = (currentCart = cart()) =>
  CheckoutSession.layerMemoryFrom({
    currentCart,
  });

const makeCommerceAccountsLayer = (
  customerId = CommerceCustomerId.make("customer-1")
) =>
  Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
      addAssociate: () => Effect.die("not used"),
      createFromRegistration: () => Effect.die("not used"),
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

const makeFailingCommerceAccountsLayer = () =>
  Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
      addAssociate: () => Effect.die("not used"),
      createFromRegistration: () => Effect.die("not used"),
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
  const { dispose, handler } = await makeHandler(makeCheckoutLayer());

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
      message: "Checkout was not found for the current request context",
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
      message: "Checkout was not found for the current request context",
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
      message: "Checkout was not found for the current request context",
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
      message: "Checkout was not found for the current request context",
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
      message: "Failed to resolve checkout request context",
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
      message: "Failed to resolve checkout request context",
    });
  } finally {
    await dispose();
  }
});

test("GET /checkout/current maps an empty Cart to a checkout not-found response", async () => {
  const { dispose, handler } = await makeHandler(
    makeCheckoutLayer(cart({ lineItems: [], totalLineItemQuantity: 0 }))
  );

  try {
    const response = await handler(request(), emptyContext());

    expect(response.status).toBe(HTTP_NOT_FOUND);
    const body = await response.json();

    expect(body).toMatchObject({
      _tag: "CheckoutApiNotFound",
      code: "checkout.notFound",
      message: "Checkout requires an existing non-empty Cart",
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
      message: "Checkout was not found for the current request context",
    });
  } finally {
    await dispose();
  }
});
