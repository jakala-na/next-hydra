import {
  AnonymousId,
  CartId,
  LineItemId,
  ProductId,
  Sku,
  VariantId,
} from "@repo/commerce/domain/cart";
import { CheckoutSession } from "@repo/commerce/lib/checkout/checkout-session";
import { Context } from "effect";
import { expect, test } from "vitest";

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

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

const makeCheckoutLayer = (currentCart = cart()) =>
  CheckoutSession.layerMemoryFrom({
    currentCart,
  });

const makeHandler = async (layer: ReturnType<typeof makeCheckoutLayer>) => {
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

test("GET /checkout/current maps an empty Cart to a checkout not-found response", async () => {
  const { dispose, handler } = await makeHandler(
    makeCheckoutLayer(cart({ lineItems: [], totalLineItemQuantity: 0 }))
  );

  try {
    const response = await handler(request(), emptyContext());
    const body = await response.json();

    expect(response.status).toBe(HTTP_NOT_FOUND);
    expect(body).toMatchObject({
      _tag: "CheckoutApiNotFound",
      message: "Checkout requires an existing non-empty Cart",
    });
  } finally {
    await dispose();
  }
});
