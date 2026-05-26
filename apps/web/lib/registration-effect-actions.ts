"use server";

import {
  type RegistrationFormInput,
  RegistrationFormInputSchema,
  type RegistrationFormResult,
} from "@repo/registration-effect";
import {
  type CreateRegistrationResponse,
  RegistrationApiValidationError,
} from "@repo/registration-effect/http/registration-api";
import { Effect, Schema } from "effect";
import {
  fetchRegistrationRest,
  RegistrationRestError,
} from "./registration-rest-client";

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
    if (error instanceof RegistrationRestError) {
      const validationError = Schema.decodeUnknownOption(
        RegistrationApiValidationError
      )(error.body);

      if (validationError._tag === "Some") {
        return {
          _tag: "FieldErrors",
          errors: Object.fromEntries(
            validationError.value.reasons.map((reason) => [
              reason.path,
              reason.code,
            ])
          ),
        };
      }
    }

    if (Schema.isSchemaError(error)) {
      return {
        _tag: "FormError",
        code: "invalidSubmission",
      };
    }

    return {
      _tag: "FormError",
      code: "submitFailed",
    };
  }
}
