import { CartPageError } from "@repo/design-system/components/commerce/blocks/cart-page-error";
import { NextIntlClientProvider } from "@repo/i18n";
import messages from "@repo/i18n/messages/en-US.json";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

function CartPageErrorStory({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <NextIntlClientProvider locale="en-US" messages={messages}>
      <CartPageError onRetry={onRetry} />
    </NextIntlClientProvider>
  );
}

const meta = {
  args: { onRetry: fn((): void => undefined) },
  component: CartPageErrorStory,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "commerce/Cart Page Error",
} satisfies Meta<typeof CartPageErrorStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LoadFailure: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole("alert")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Try Again" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
