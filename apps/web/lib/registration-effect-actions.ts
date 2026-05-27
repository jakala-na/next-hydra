"use server";

import { sentryEffectTelemetryLayer } from "@repo/observability/effect";
import {
  type RegistrationFormError,
  type RegistrationFormFieldError,
  type RegistrationFormInput,
  RegistrationFormInputSchema,
  type RegistrationFormResult,
  type RegistrationFormValues,
} from "@repo/registration-effect";
import {
  CreateRegistrationRequest,
  type RegistrationApiValidationError,
} from "@repo/registration-effect/http/registration-api";
import { Effect, Schema } from "effect";
import { makeRegistrationRestClient } from "./registration-rest-client";

const toRegistrationInput = (
  input: RegistrationFormInput
): CreateRegistrationRequest =>
  new CreateRegistrationRequest({
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

const toValidationErrors = (
  error: RegistrationApiValidationError
): RegistrationFormResult => {
  const fieldErrors: RegistrationFormFieldError[] = [];
  const formErrors: RegistrationFormError[] = [];

  for (const reason of error.reasons) {
    switch (reason._tag) {
      case "DuplicateRegistrationEmail":
        fieldErrors.push({
          path: reason.path,
          code: reason.code,
        });
        break;
      case "InvalidRegistrationVatId":
        fieldErrors.push({
          path: reason.path,
          code: reason.code,
        });
        break;
      case "UnsupportedRegistrationCountry":
        formErrors.push({
          code: reason.code,
        });
        break;
      default:
        reason satisfies never;
    }
  }

  return {
    status: "invalid",
    fieldErrors,
    formErrors,
  };
};

const submitRegistrationProgram = (input: RegistrationFormValues) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(
      RegistrationFormInputSchema
    )(input);

    const client = yield* makeRegistrationRestClient();
    const registration = yield* client.registrations.create({
      payload: toRegistrationInput(decoded),
    });

    return {
      status: "submitted",
      registrationId: registration.registrationId,
    } satisfies RegistrationFormResult;
  }).pipe(
    Effect.catchTags({
      RegistrationApiValidationError: (error) =>
        Effect.succeed(toValidationErrors(error)),
      SchemaError: () =>
        Effect.succeed({
          status: "invalid",
          fieldErrors: [],
          formErrors: [{ code: "invalidSubmission" }],
        } satisfies RegistrationFormResult),
    }),
    Effect.tapCause((cause) =>
      Effect.logError("Failed to submit registration form", cause).pipe(
        Effect.withLogSpan("registration.form.submit.failure")
      )
    ),
    Effect.withSpan("registration.form.submit"),
    Effect.annotateSpans({
      "registration.operation": "form.submit",
    }),
    Effect.annotateLogs({
      operation: "registration.form.submit",
      service: "web",
    }),
    Effect.provide(sentryEffectTelemetryLayer)
  );

export async function submitRegistrationEffect(
  input: RegistrationFormValues
): Promise<RegistrationFormResult> {
  return await Effect.runPromise(submitRegistrationProgram(input));
}
