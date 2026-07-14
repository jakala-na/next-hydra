import { defineRouting } from "next-intl/routing";
import { locales } from "./config";

export const routing = defineRouting({
  // A list of all locales that are supported
  locales,
  localePrefix: "as-needed",
  // Used when no locale matches
  defaultLocale: "en-US",
});
