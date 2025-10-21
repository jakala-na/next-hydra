// biome-ignore lint/performance/noBarrelFile: this is our public API
export {
  hasLocale,
  type Locale,
  NextIntlClientProvider,
  useFormatter,
  useTranslations,
} from "next-intl";
export { getLocale, getTranslations } from "next-intl/server";

import "./global";
