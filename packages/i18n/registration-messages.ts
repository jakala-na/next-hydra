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

type RegistrationFormMessages = MessageShape<
  (typeof enUS)["web"]["registration"]["form"]
>;

export const registrationFormMessageCatalogs = {
  "de-DE": deDE.web.registration.form,
  "en-GB": enGB.web.registration.form,
  "en-US": enUS.web.registration.form,
  "es-ES": esES.web.registration.form,
  "fr-FR": frFR.web.registration.form,
  "it-IT": itIT.web.registration.form,
  "nl-NL": nlNL.web.registration.form,
  "pt-PT": ptPT.web.registration.form,
} as const satisfies Record<Locale, RegistrationFormMessages>;
