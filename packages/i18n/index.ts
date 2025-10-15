// biome-ignore lint/performance/noBarrelFile: this is our public API
export {
  hasLocale,
  type Locale,
  NextIntlClientProvider,
  useTranslations,
} from "next-intl";
export { getTranslations } from "next-intl/server";

import "./global";
