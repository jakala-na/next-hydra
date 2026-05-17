import type { MessageKeys, Messages, NestedKeyOf } from "@repo/i18n";
import type { z } from "zod";
import { COUNTRY_CODES, registrationInputSchema } from "../domain/schemas";

type RegistrationFormMessageKey = MessageKeys<
  Messages["web"]["registration"]["form"],
  NestedKeyOf<Messages["web"]["registration"]["form"]>
>;

type RegistrationFormTranslator = (key: RegistrationFormMessageKey) => string;

export const getCountryOptions = (locale: string) => {
  const countryDisplayNames = new Intl.DisplayNames([locale], {
    type: "region",
  });

  return COUNTRY_CODES.map((value) => ({
    value,
    label: countryDisplayNames.of(value) ?? value,
  })).sort((left, right) => left.label.localeCompare(right.label));
};

const validationMessages = {
  companyName: {
    required: "validation.companyName",
    max: "validation.companyNameMax",
  },
  companyPhone: { max: "validation.companyPhone" },
  vatId: { max: "validation.vatId" },
  contactFirstName: {
    required: "validation.firstName",
    max: "validation.firstNameMax",
  },
  contactLastName: {
    required: "validation.lastName",
    max: "validation.lastNameMax",
  },
  email: { invalid: "validation.email" },
  "address.streetName": { required: "validation.streetAddress" },
  "address.postalCode": { required: "validation.postalCode" },
  "address.city": { required: "validation.city" },
  "address.region": { required: "validation.region" },
  "address.country": { invalid: "validation.country" },
} as const;

type ValidationMessageKind = "required" | "max" | "invalid";
type ValidationMessagePath = keyof typeof validationMessages;

const pathKey = (path: (string | number)[]) => path.join(".");

const getValidationMessageKey = (
  key: string,
  kind: ValidationMessageKind
): RegistrationFormMessageKey | undefined => {
  if (!(key in validationMessages)) {
    return;
  }

  const messages = validationMessages[key as ValidationMessagePath];
  return kind in messages
    ? (messages[kind as keyof typeof messages] as RegistrationFormMessageKey)
    : undefined;
};

export const createRegistrationFormErrorMap =
  (t: RegistrationFormTranslator): z.ZodErrorMap =>
  (issue, ctx) => {
    const key = pathKey(issue.path);

    if (issue.code === "too_small") {
      const messageKey = getValidationMessageKey(key, "required");

      if (messageKey) {
        return { message: t(messageKey) };
      }
    }

    if (issue.code === "too_big") {
      const messageKey = getValidationMessageKey(key, "max");

      if (messageKey) {
        return { message: t(messageKey) };
      }
    }

    if (issue.code === "invalid_string" && key === "email") {
      return { message: t(validationMessages.email.invalid) };
    }

    if (issue.code === "custom") {
      const messageKey =
        getValidationMessageKey(key, "invalid") ??
        getValidationMessageKey(key, "required");

      if (messageKey) {
        return { message: t(messageKey) };
      }
    }

    return { message: ctx.defaultError };
  };

export const registrationFormSchema = registrationInputSchema;

export type RegistrationFormValues = z.infer<typeof registrationFormSchema>;
export type RegistrationFormInput = z.infer<typeof registrationFormSchema>;
