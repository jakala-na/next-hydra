import { createTranslator } from "next-intl";

import deDE from "./messages/de-DE.json" with { type: "json" };
import enGB from "./messages/en-GB.json" with { type: "json" };
import enUS from "./messages/en-US.json" with { type: "json" };
import esES from "./messages/es-ES.json" with { type: "json" };
import frFR from "./messages/fr-FR.json" with { type: "json" };
import itIT from "./messages/it-IT.json" with { type: "json" };
import nlNL from "./messages/nl-NL.json" with { type: "json" };
import ptPT from "./messages/pt-PT.json" with { type: "json" };
import type { Locale } from "./types";

type MessageShape<Value> = Value extends string
  ? string
  : {
      readonly [Key in keyof Value]: MessageShape<Value[Key]>;
    };

type CheckoutMessages = MessageShape<(typeof enUS)["web"]["checkout"]>;

export const checkoutMessageCatalogs = {
  "de-DE": deDE.web.checkout,
  "en-GB": enGB.web.checkout,
  "en-US": enUS.web.checkout,
  "es-ES": esES.web.checkout,
  "fr-FR": frFR.web.checkout,
  "it-IT": itIT.web.checkout,
  "nl-NL": nlNL.web.checkout,
  "pt-PT": ptPT.web.checkout,
} as const satisfies Record<Locale, CheckoutMessages>;

export const createCheckoutTranslator = (locale: Locale) =>
  createTranslator({
    locale,
    messages: checkoutMessageCatalogs[locale],
  });
