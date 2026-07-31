import { isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";

const { closeCart } = vi.hoisted(() => ({
  closeCart: vi.fn(),
}));

vi.mock("../providers/cart-context", () => ({
  useCart: () => ({
    items: [
      {
        id: "line-item-1",
        image: "",
        name: "Coffee",
        price: 10,
        quantity: 1,
        variant: "",
      },
    ],
    totalItems: 1,
    totalPrice: 10,
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    isOpen: true,
    closeCart,
    currencyCode: "USD",
  }),
}));

vi.mock("@repo/i18n", () => ({
  useFormatter: () => ({
    number: (value: number) => String(value),
  }),
  useTranslations: () => (key: string) => key,
}));

import { CartFlyout } from "./cart-flyout";

type LinkProps = {
  readonly children?: ReactNode;
  readonly href?: string;
  readonly onClick?: () => void;
};

const findCheckoutLink = (
  node: ReactNode
): ReactElement<LinkProps> | undefined => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findCheckoutLink(child);
      if (match) {
        return match;
      }
    }
    return undefined;
  }

  if (!isValidElement<LinkProps>(node)) {
    return undefined;
  }

  if (node.props.href === "/checkout") {
    return node;
  }

  return findCheckoutLink(node.props.children);
};

it("closes the cart when checkout is selected", () => {
  const checkoutLink = findCheckoutLink(CartFlyout());

  expect(checkoutLink).toBeDefined();

  checkoutLink?.props.onClick?.();

  expect(closeCart).toHaveBeenCalledOnce();
});
