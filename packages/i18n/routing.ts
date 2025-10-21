import { defineRouting } from "next-intl/routing";
import { regions } from "./config";

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: regions.map((region) => region.localeCode),
  localePrefix: "as-needed",
  // Used when no locale matches
  defaultLocale: "en-US",
});
