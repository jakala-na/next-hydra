/* oxlint-disable typescript/promise-function-async -- Story actions return already-settled Promises so browser interactions remain deterministic. */
import { CART_UNAVAILABLE } from "@repo/commerce/cart/public-state";
import { CartProvider } from "@repo/design-system/components/commerce/providers/cart-context";
import { CartButtonClient } from "@repo/design-system/components/layout/cart-button";
import { NextIntlClientProvider } from "@repo/i18n";
import messages from "@repo/i18n/messages/en-US.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Suspense } from "react";
import { expect, within } from "storybook/test";

const unusedAction = () => Promise.reject(new Error("Action is not available"));
const unavailableCartPromise = Promise.resolve(CART_UNAVAILABLE);

function UnavailableCartButtonStory() {
  return (
    <NextIntlClientProvider locale="en-US" messages={messages}>
      <CartProvider
        actions={{
          addToCart: unusedAction,
          changeCartItemsQuantity: unusedAction,
          removeCartItem: unusedAction,
        }}
        cartPromise={unavailableCartPromise}
      >
        <Suspense fallback={null}>
          <CartButtonClient />
        </Suspense>
      </CartProvider>
    </NextIntlClientProvider>
  );
}

const meta = {
  component: UnavailableCartButtonStory,
  title: "commerce/Cart Button",
} satisfies Meta<typeof UnavailableCartButtonStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Unavailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const unavailableCart = await canvas.findByRole("link", {
      name: "Cart unavailable",
    });

    await expect(unavailableCart).toHaveAttribute("href", "/cart");
  },
};
