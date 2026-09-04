/* oxlint-disable typescript/promise-function-async -- Story actions return already-settled Promises so browser interactions remain deterministic. */
import type { AddToCartAction } from "@repo/commerce/cart/add-to-cart";
import type { ChangeCartItemsQuantityAction } from "@repo/commerce/cart/change-cart-items-quantity";
import { decodeCartPublicState } from "@repo/commerce/cart/public-state";
import type {
  CartPublicState,
  CartPublicStateEncoded,
} from "@repo/commerce/cart/public-state";
import type { RemoveCartItemAction } from "@repo/commerce/cart/remove-cart-item";
import { CartPageView } from "@repo/design-system/components/commerce/blocks/cart-page";
import { CartProvider } from "@repo/design-system/components/commerce/providers/cart-context";
import { NextIntlClientProvider } from "@repo/i18n";
import messages from "@repo/i18n/messages/en-US.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

const formats = {
  number: {
    wholeMoneyWithCurrency: {
      currencyDisplay: "narrowSymbol" as const,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
      style: "currency" as const,
    },
  },
};

const populatedCartEncoded = {
  cart: {
    id: "cart-1",
    lineItems: [
      {
        id: "line-item-1",
        lineTotal: { centAmount: 250_000, currencyCode: "USD" },
        name: "Hydraulic Torque Wrench",
        quantity: 2,
        summaryAttribute: { label: "Drive", value: "1 inch" },
        unitPrice: { centAmount: 125_000, currencyCode: "USD" },
      },
    ],
    status: "active",
    storeKey: "default-store",
    summary: {
      shipping: { centAmount: 25_000, currencyCode: "USD" },
      subtotal: { centAmount: 250_000, currencyCode: "USD" },
      total: { centAmount: 275_000, currencyCode: "USD" },
    },
    totalLineItemQuantity: 2,
    version: 7,
  },
  violations: [],
} satisfies CartPublicStateEncoded;

const increasedCartEncoded = {
  ...populatedCartEncoded,
  cart: {
    ...populatedCartEncoded.cart,
    lineItems: [
      {
        id: "line-item-1",
        lineTotal: { centAmount: 375_000, currencyCode: "USD" },
        name: "Hydraulic Torque Wrench",
        quantity: 3,
        summaryAttribute: { label: "Drive", value: "1 inch" },
        unitPrice: { centAmount: 125_000, currencyCode: "USD" },
      },
    ],
    summary: {
      shipping: { centAmount: 25_000, currencyCode: "USD" },
      subtotal: { centAmount: 375_000, currencyCode: "USD" },
      total: { centAmount: 400_000, currencyCode: "USD" },
    },
    totalLineItemQuantity: 3,
    version: 8,
  },
} satisfies CartPublicStateEncoded;

const populatedCart = decodeCartPublicState(populatedCartEncoded);
const increasedCart = decodeCartPublicState(increasedCartEncoded);

interface CartPageStoryProps {
  readonly addToCart: AddToCartAction;
  readonly changeCartItemsQuantity: ChangeCartItemsQuantityAction;
  readonly initialCart: CartPublicState | null;
  readonly removeCartItem: RemoveCartItemAction;
}

function CartPageStory({
  addToCart,
  changeCartItemsQuantity,
  initialCart,
  removeCartItem,
}: CartPageStoryProps) {
  return (
    <NextIntlClientProvider
      formats={formats}
      locale="en-US"
      messages={messages}
      timeZone="UTC"
    >
      <CartProvider
        actions={{ addToCart, changeCartItemsQuantity, removeCartItem }}
        cartPromise={Promise.resolve(initialCart)}
      >
        <CartPageView initialCart={initialCart} />
      </CartProvider>
    </NextIntlClientProvider>
  );
}

const unchangedCart = () =>
  Promise.resolve({
    _tag: "Success" as const,
    success: populatedCart,
  });

const meta = {
  args: {
    addToCart: fn(unchangedCart),
    changeCartItemsQuantity: fn(() =>
      Promise.resolve({
        _tag: "Success" as const,
        success: increasedCart,
      })
    ),
    initialCart: populatedCart,
    removeCartItem: fn(unchangedCart),
  },
  component: CartPageStory,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "commerce/Cart Page",
} satisfies Meta<typeof CartPageStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", { name: "Shopping Cart (2)" })
    ).toBeVisible();
    await expect(canvas.getByText("Hydraulic Torque Wrench")).toBeVisible();
    await expect(
      canvasElement.querySelector('[data-commerce-money="cart-page-subtotal"]')
    ).toHaveAttribute("data-minor-amount", "250000");
    await expect(
      canvasElement.querySelector('[data-commerce-money="cart-page-shipping"]')
    ).toHaveAttribute("data-minor-amount", "25000");

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Increase quantity for Hydraulic Torque Wrench",
      })
    );

    await expect(args.changeCartItemsQuantity).toHaveBeenCalledWith({
      lineItemId: "line-item-1",
      quantity: 3,
    });
    await expect(
      canvas.getByLabelText("Quantity for Hydraulic Torque Wrench")
    ).toHaveTextContent("3");
    await expect(
      canvasElement.querySelector('[data-commerce-money="cart-page-total"]')
    ).toHaveAttribute("data-minor-amount", "400000");
  },
};

export const Empty: Story = {
  args: { initialCart: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", { name: "Your cart is empty" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Browse Products" })
    ).toHaveAttribute("href", "/products");
  },
};

export const ShippingCalculatedAtCheckout: Story = {
  args: {
    initialCart: decodeCartPublicState({
      ...populatedCartEncoded,
      cart: {
        ...populatedCartEncoded.cart,
        summary: {
          subtotal: populatedCartEncoded.cart.summary.subtotal,
          total: populatedCartEncoded.cart.summary.subtotal,
        },
      },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText("Calculated at checkout")).toBeVisible();
    await expect(
      canvasElement.querySelector('[data-commerce-money="cart-page-shipping"]')
    ).not.toBeInTheDocument();
  },
};
