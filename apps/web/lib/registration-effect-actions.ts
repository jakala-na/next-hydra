"use server";

import {
  type RegistrationFormInput,
  RegistrationFormInputSchema,
  type RegistrationFormResult,
} from "@repo/registration-effect";
import type { CreateRegistrationResponse } from "@repo/registration-effect/http/registration-api";
import { Effect, Schema } from "effect";
import { fetchRegistrationRest } from "./registration-rest-client";

const toRegistrationInput = (
  input: RegistrationFormInput
): Record<string, unknown> => ({
  companyName: input.companyName,
  companyPhone: input.companyPhone,
  vatId: input.vatId,
  contactFirstName: input.contactFirstName,
  contactLastName: input.contactLastName,
  email: input.email,
  address: {
    streetName: input.address.streetName,
    additionalStreetInfo: input.address.additionalStreetInfo,
    postalCode: input.address.postalCode,
    city: input.address.city,
    region: input.address.region,
    country: input.address.country,
  },
});

export async function submitRegistrationEffect(
  input: RegistrationFormInput
): Promise<RegistrationFormResult> {
  try {
    const decoded = await Effect.runPromise(
      Schema.decodeUnknownEffect(RegistrationFormInputSchema)(input)
    );
    const registration =
      await fetchRegistrationRest<CreateRegistrationResponse>(
        "/registrations",
        {
          method: "POST",
          body: JSON.stringify(toRegistrationInput(decoded)),
        }
      );

    return {
      _tag: "Success",
      registrationId: registration.registrationId,
    };
  } catch (error) {
    return {
      _tag: "FormError",
      message:
        typeof error === "object" && error && "_tag" in error
          ? "The registration details are invalid."
          : "The registration could not be submitted. Please try again.",
    };
  }
}
