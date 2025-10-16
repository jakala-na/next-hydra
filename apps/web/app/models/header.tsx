import "server-only";

import type {
  CartSummaryProps,
  Region,
} from "@repo/design-system/components/layout/site-header";
import { cache } from "react";

export const loadCart = cache(
  async (): Promise<CartSummaryProps> => ({
    count: 0,
    href: "/cart",
    subtotal: { value: 0, currency: "USD" },
  })
);

export const loadRegions = (): Region[] => [
  { code: "US", name: "United States", currency: "USD", locale: "en-US" },
  { code: "CA", name: "Canada", currency: "CAD", locale: "en-CA" },
  { code: "FR", name: "France", currency: "EUR", locale: "fr-CA" },
];
