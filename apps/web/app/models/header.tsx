import "server-only";

import type { Region } from "@repo/design-system/components/layout/region-selector";
import type { CartSummaryProps } from "@repo/design-system/components/layout/site-header";
import { regions } from "@repo/i18n/config";
import { cache } from "react";

export const loadCart = cache(
  async (): Promise<CartSummaryProps> => ({
    count: 0,
    href: "/cart",
    subtotal: { value: 0, currency: "USD" },
  })
);

export const loadRegions = (): readonly Region[] => regions;
