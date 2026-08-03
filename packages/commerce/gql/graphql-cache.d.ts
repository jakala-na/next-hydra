/* eslint-disable */
/* prettier-ignore */
import type { TadaDocumentNode, $tada } from 'gql.tada';
import type { Locale } from "@repo/i18n/types";

declare module 'gql.tada' {
 interface setupCache {
    "\n  fragment Channel on Channel {\n    id\n    key\n    version\n    name(locale: $locale)\n  }\n":
      TadaDocumentNode<{ id: string; key: string; version: number; name: string | null; }, {}, { fragment: "Channel"; on: "Channel"; masked: true; }>;
    "\n  fragment Store on Store {\n    id\n    key\n    version\n    name(locale: $locale)\n    languages\n    countries {\n      code\n    }\n    distributionChannels {\n      ...Channel\n    }\n    supplyChannels {\n      ...Channel\n    }\n  }\n":
      TadaDocumentNode<{ id: string; key: string; version: number; name: string | null; languages: ("en-US" | "en-GB" | "es-ES" | "fr-FR" | "de-DE" | "it-IT" | "pt-PT" | "nl-NL")[] | null; countries: { code: string; }[] | null; distributionChannels: { [$tada.fragmentRefs]: { Channel: "Channel"; }; }[]; supplyChannels: { [$tada.fragmentRefs]: { Channel: "Channel"; }; }[]; }, {}, { fragment: "Store"; on: "Store"; masked: true; }>;
    "\n    query getStoreByKey($key: String!, $locale: Locale!) {\n      store(key: $key) {\n        ...Store\n      }\n    }\n  ":
      TadaDocumentNode<{ store: { [$tada.fragmentRefs]: { Store: "Store"; }; } | null; }, { locale: "en-US" | "en-GB" | "es-ES" | "fr-FR" | "de-DE" | "it-IT" | "pt-PT" | "nl-NL"; key: string; }, void>;
  }
}
