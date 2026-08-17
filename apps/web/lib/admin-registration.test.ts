import { RegistrationId } from "@repo/registration";
import { RegistrationDecisionOutcomeUnknown } from "@repo/registration/public-errors";
import { Effect, Schema } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const registrationRequest = vi.hoisted(() => ({
  approve: vi.fn(),
  reject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./admin-auth", () => ({
  ADMIN_REGISTRATION_READ_PERMISSION: "registration.read",
  requireAdminPermission: vi.fn(),
}));
vi.mock("./registration-rest-client", async () => {
  const { Effect: TestEffect } = await import("effect");
  return {
    makeRegistrationRestClient: () =>
      TestEffect.succeed({
        registrations: registrationRequest,
      }),
  };
});

const { decideAdminRegistration } = await import("./admin-registration");

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

describe("decideAdminRegistration", () => {
  beforeEach(() => {
    registrationRequest.approve.mockReset();
    registrationRequest.reject.mockReset();
  });

  it("returns outcome unknown for a refused connection", async () => {
    registrationRequest.approve.mockReturnValue(
      transportFailure("ECONNREFUSED")
    );

    const error = await Effect.runPromise(
      decideAdminRegistration(input, "access-token").pipe(Effect.flip)
    );

    expect(Schema.is(RegistrationDecisionOutcomeUnknown)(error)).toBe(true);
    expect(error).toMatchObject({
      registrationId: RegistrationId.make("registration-1"),
    });
  });

  it("returns outcome unknown when delivery may have completed", async () => {
    registrationRequest.approve.mockReturnValue(transportFailure("ECONNRESET"));

    const error = await Effect.runPromise(
      decideAdminRegistration(input, "access-token").pipe(Effect.flip)
    );

    expect(Schema.is(RegistrationDecisionOutcomeUnknown)(error)).toBe(true);
    expect(error).toMatchObject({
      registrationId: RegistrationId.make("registration-1"),
    });
  });

  it("returns outcome unknown without inspecting the transport cause", async () => {
    registrationRequest.approve.mockReturnValue(
      Effect.fail({
        _tag: "HttpClientError",
        reason: {
          _tag: "TransportError",
          cause: Object.assign(new Error("host not found"), {
            code: "ENOTFOUND",
          }),
        },
      })
    );

    const error = await Effect.runPromise(
      decideAdminRegistration(input, "access-token").pipe(Effect.flip)
    );

    expect(Schema.is(RegistrationDecisionOutcomeUnknown)(error)).toBe(true);
    expect(error).toMatchObject({
      registrationId: RegistrationId.make("registration-1"),
    });
  });

  it("returns outcome unknown for a classified response contract mismatch", async () => {
    registrationRequest.approve.mockReturnValue(
      Effect.fail({
        _tag: "RegistrationHttpResponseError",
        cause: { _tag: "SchemaError" },
      })
    );

    const error = await Effect.runPromise(
      decideAdminRegistration(input, "access-token").pipe(Effect.flip)
    );

    expect(Schema.is(RegistrationDecisionOutcomeUnknown)(error)).toBeTruthy();
    expect(error).toMatchObject({
      registrationId: RegistrationId.make("registration-1"),
    });
  });
});
