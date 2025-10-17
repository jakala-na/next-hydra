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
  {
    displayCode: "US",
    displayName: "United States (English)",
    currency: "USD",
    localeCode: "en-US",
  },
  {
    displayCode: "CA (EN)",
    displayName: "Canada (English)",
    currency: "CAD",
    localeCode: "en-CA",
  },
  {
    displayCode: "CA (FR)",
    displayName: "Canada (French)",
    currency: "EUR",
    localeCode: "fr-CA",
  },
];
