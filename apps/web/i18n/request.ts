import sharedRequestConfig from "@repo/i18n/request";
import { locale } from "next/root-params";

import { withRootLocale } from "./request-locale";

export default withRootLocale(sharedRequestConfig, locale);
