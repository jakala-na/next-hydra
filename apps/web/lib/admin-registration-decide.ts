import "server-only";
import { RegistrationId } from "@repo/registration";
import type { ApproveRegistrationInput } from "@repo/registration/components/admin/registration-view-models";
import { RegistrationDecisionRequest } from "@repo/registration/http/registration-api";
import { registrationDecisionOutcomeUnknown } from "@repo/registration/public-errors";
import type { RegistrationDecisionPublicError } from "@repo/registration/public-errors";
import { Effect } from "effect";

import type { RegistrationHttpApiClient } from "./registration-rest-client";
import {
  RegistrationClient,
  registrationClientLayer,
} from "./registration-rest-client";

const logDecisionFailure = (
  input: ApproveRegistrationInput & {
    readonly decision: "approved" | "rejected";
  },
  error: RegistrationDecisionPublicError
) =>
  Effect.logError("Failed to save registration decision", error).pipe(
    Effect.annotateLogs({
      operation: "registration.admin.decision.save",
      "registration.decision": input.decision,
      "registration.id": input.registrationId,
      service: "web-admin",
    }),
    Effect.withLogSpan("registration.admin.decision.save")
  );

export const decideAdminRegistrationWithClient = Effect.fn(
  "AdminRegistration.decideWithClient"
)(function* decideAdminRegistrationWithClientEffect(
  client: RegistrationHttpApiClient,
  input: ApproveRegistrationInput & {
    readonly decision: "approved" | "rejected";
  }
) {
  const decisionPayload =
    input.reason !== undefined && input.reason !== ""
      ? { reason: input.reason }
      : {};

  const request = {
    params: {
      registrationId: RegistrationId.make(input.registrationId),
    },
    payload: new RegistrationDecisionRequest(decisionPayload),
  };
  const result = yield* (
    input.decision === "approved"
      ? client.registrations.approve(request)
      : client.registrations.reject(request)
  ).pipe(
    Effect.catchTags({
      HttpClientError: (error) =>
        error.reason._tag === "TransportError"
          ? Effect.fail(
              registrationDecisionOutcomeUnknown(
                RegistrationId.make(input.registrationId)
              )
            )
          : Effect.die(error),
      InputInvalid: Effect.die,
      RegistrationHttpResponseError: (error) =>
        Effect.logError(
          "Registration decision response violated its HTTP contract",
          error.cause
        ).pipe(
          Effect.andThen(
            Effect.fail(
              registrationDecisionOutcomeUnknown(
                RegistrationId.make(input.registrationId)
              )
            )
          )
        ),
      SchemaError: Effect.die,
      Unexpected: Effect.die,
    }),
    Effect.tapError((error) => logDecisionFailure(input, error)),
    Effect.annotateLogs({
      operation: "registration.admin.decision.submit",
      "registration.decision": input.decision,
      "registration.id": input.registrationId,
      service: "web-admin",
    }),
    Effect.annotateSpans({
      "registration.decision": input.decision,
      "registration.id": input.registrationId,
      "registration.operation": "decision.submit",
    }),
    Effect.withSpan("registration.admin.decision.submit")
  );

  return {
    registrationId: result.registrationId,
    registrationStatus: result.status,
  };
});

export const decideAdminRegistration = Effect.fn("AdminRegistration.decide")(
  function* decideAdminRegistrationEffect(
    input: ApproveRegistrationInput & {
      readonly decision: "approved" | "rejected";
    },
    accessToken: string
  ) {
    return yield* Effect.gen(function* decideWithProvidedClientEffect() {
      const client = yield* RegistrationClient;
      return yield* decideAdminRegistrationWithClient(client, input);
    }).pipe(Effect.provide(registrationClientLayer(accessToken)));
  }
);
