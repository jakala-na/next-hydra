import { RegistrationId } from "@repo/registration";
import { RegistrationDecisionOutcomeUnknown } from "@repo/registration/public-errors";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { decideAdminRegistrationWithClient } from "./admin-registration-decide";
import type { RegistrationHttpApiClient } from "./registration-rest-client";

const input = {
  decision: "approved" as const,
  registrationId: "registration-1",
};

const transportFailure = (code: string) =>
  Effect.fail({
    _tag: "HttpClientError",
    reason: {
      _tag: "TransportError",
      cause: Object.assign(new Error(code), { code }),
    },
  });

const makeClient = (
  approve: RegistrationHttpApiClient["registrations"]["approve"]
): RegistrationHttpApiClient => ({
  registrations: {
    approve,
    create: () => Effect.die("unused"),
    get: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
    reject: () => Effect.die("unused"),
  },
});

describe("decideAdminRegistration", () => {
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
        makeClient(() =>
          Effect.fail({
            _tag: "HttpClientError",
            reason: {
              _tag: "TransportError",
              cause: Object.assign(new Error("host not found"), {
                code: "ENOTFOUND",
              }),
            },
          })
        ),
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
        makeClient(() =>
          Effect.fail({
            _tag: "RegistrationHttpResponseError",
            cause: { _tag: "SchemaError" },
          })
        ),
        input
      ).pipe(Effect.flip)
    );

    expect(Schema.is(RegistrationDecisionOutcomeUnknown)(error)).toBeTruthy();
    expect(error).toMatchObject({
      registrationId: RegistrationId.make("registration-1"),
    });
  });
});
