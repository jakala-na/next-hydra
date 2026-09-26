import type { Locale } from "@repo/i18n";
import { getPathname } from "@repo/i18n/navigation";

export const commerceSearchRoutes = (locale: Locale) => ({
  productListingPath: getPathname({ href: "/products", locale }),
  productPathPrefix: getPathname({ href: "/product", locale }),
});
