import { RegistrationId } from "@repo/registration";
import { RegistrationDecisionOutcomeUnknown } from "@repo/registration/public-errors";
import { Effect, Schema } from "effect";
import { HttpClientError, HttpClientRequest } from "effect/unstable/http";
import { describe, expect, it } from "vitest";

import { decideAdminRegistrationWithClient } from "./admin-registration-decide";
import type { RegistrationHttpApiClient } from "./registration-rest-client";
import { RegistrationHttpResponseError } from "./registration-rest-client";

const input = {
  decision: "approved" as const,
  registrationId: "registration-1",
};
const registrationRequest = HttpClientRequest.post(
  "https://registration.test/registrations/registration-1/approve"
);

const transportFailure = (code: string) =>
  Effect.fail(
    new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({
        cause: Object.assign(new Error(code), { code }),
        request: registrationRequest,
      }),
    })
  );

const responseContractFailure = () =>
  Schema.decodeUnknownEffect(Schema.Never)(undefined).pipe(
    Effect.mapError((cause) => new RegistrationHttpResponseError({ cause }))
  );

const makeClient = (
  approve: RegistrationHttpApiClient["registrations"]["approve"]
): RegistrationHttpApiClient => ({
  registrations: {
    approve,
    get: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
    reject: () => Effect.die("unused"),
    revokeInvitation: () => Effect.die("unused"),
  },
});

describe("admin registration client", () => {
  it("returns outcome unknown for a refused connection", async () => {
    const error = await Effect.runPromise(
      decideAdminRegistrationWithClient(
        makeClient(() => transportFailure("ECONNREFUSED")),
        input
      ).pipe(Effect.flip)
    );

    expect(Schema.is(RegistrationDecisionOutcomeUnknown)(error)).toBeTruthy();
    expect(error).toMatchObject({
      registrationId: RegistrationId.make("registration-1"),
    });
  });

  it("returns outcome unknown when delivery may have completed", async () => {
    const error = await Effect.runPromise(
      decideAdminRegistrationWithClient(
        makeClient(() => transportFailure("ECONNRESET")),
        input
      ).pipe(Effect.flip)
    );

    expect(Schema.is(RegistrationDecisionOutcomeUnknown)(error)).toBeTruthy();
    expect(error).toMatchObject({
      registrationId: RegistrationId.make("registration-1"),
    });
  });

  it("returns outcome unknown without inspecting the transport cause", async () => {
    const error = await Effect.runPromise(
      decideAdminRegistrationWithClient(
        makeClient(() => transportFailure("ENOTFOUND")),
        input
      ).pipe(Effect.flip)
    );

    expect(Schema.is(RegistrationDecisionOutcomeUnknown)(error)).toBeTruthy();
    expect(error).toMatchObject({
      registrationId: RegistrationId.make("registration-1"),
    });
  });

  it("returns outcome unknown for a classified response contract mismatch", async () => {
    const error = await Effect.runPromise(
      decideAdminRegistrationWithClient(
        makeClient(responseContractFailure),
        input
      ).pipe(Effect.flip)
    );

    expect(Schema.is(RegistrationDecisionOutcomeUnknown)(error)).toBeTruthy();
    expect(error).toMatchObject({
      registrationId: RegistrationId.make("registration-1"),
    });
  });
});
