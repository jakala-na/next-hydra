import { StoreKey } from "@repo/commerce/store";
import { ErrorIssue, makeInputInvalid } from "@repo/errors";
import { DuplicateRegistrationEmail, RegistrationId } from "@repo/registration";
import {
  RegistrationApiErrorFailure,
  RegistrationApiValidationErrorFailure,
} from "@repo/registration/public-errors";
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { submitRegistration } from "./registration-actions";

const registrationRequest = vi.hoisted(() => ({
  create: vi.fn(),
  getLocale: vi.fn(async () => "en-US" as const),
  locale: "en-US" as const,
  redirect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/i18n", () => ({
  getLocale: registrationRequest.getLocale,
  getTranslations: async () => (key: string) =>
    ({
      "errors.invalidSubmission": "Review the highlighted fields.",
      "errors.submissionOutcomeUnknown":
        "Registration receipt could not be confirmed.",
      "errors.submitFailed": "Registration is currently unavailable.",
      "validation.duplicateEmail": "This email is already registered.",
      "validation.email": "Enter a valid email address.",
      "validation.region": "Enter a state, province, or region.",
    })[key] ?? key,
}));
vi.mock("@repo/i18n/navigation", () => ({
  redirect: registrationRequest.redirect,
}));
vi.mock("@repo/observability/effect", async () => {
  const { Layer } = await import("effect");
  return { sentryEffectTelemetryLayer: Layer.empty };
});
vi.mock("./app-runtime", async () => {
  const [{ ManagedRuntime }, { nextRequestApiLayer }] = await Promise.all([
    import("effect"),
    import("./next-request"),
  ]);

  return { AppRuntime: ManagedRuntime.make(nextRequestApiLayer) };
});
vi.mock("./registration-rest-client", async () => {
  const { Effect } = await import("effect");
  return {
    makeRegistrationRestClient: () =>
      Effect.succeed({
        registrations: {
          create: registrationRequest.create,
        },
      }),
  };
});

const validInput = {
  companyName: "Hydra Supply",
  companyPhone: "555-0100",
  vatId: "US123",
  contactFirstName: "Ada",
  contactLastName: "Lovelace",
  email: "ada@example.com",
  address: {
    streetName: "1 Main Street",
    additionalStreetInfo: "Suite 2",
    postalCode: "10001",
    city: "New York",
    region: "NY",
    country: "US",
  },
} as const;

beforeEach(() => {
  registrationRequest.create.mockReset();
  registrationRequest.getLocale.mockClear();
  registrationRequest.getLocale.mockImplementation(
    async () => registrationRequest.locale
  );
  registrationRequest.redirect.mockReset();
});

describe("submitRegistration", () => {
  it("validates and encodes a successful registration before redirecting", async () => {
    registrationRequest.create.mockReturnValue(
      Effect.succeed({
        registrationId: RegistrationId.make("registration-1"),
        status: "awaiting_approval",
        storeKey: StoreKey.make("default-store"),
      })
    );

    await expect(submitRegistration(validInput)).resolves.toEqual({
      _tag: "Success",
      success: {
        registrationId: "registration-1",
      },
    });
    expect(registrationRequest.redirect).toHaveBeenCalledWith({
      href: "/register/awaiting-approval",
      locale: "en-US",
    });
    expect(registrationRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "x-context-locale": "en-US" },
      })
    );
    expect(registrationRequest.getLocale).toHaveBeenCalledOnce();
  });

  it("propagates Next redirect control flow unchanged", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    registrationRequest.create.mockReturnValue(
      Effect.succeed({
        registrationId: RegistrationId.make("registration-1"),
        status: "awaiting_approval",
        storeKey: StoreKey.make("default-store"),
      })
    );
    registrationRequest.redirect.mockImplementationOnce(() => {
      throw redirectSignal;
    });

    await expect(submitRegistration(validInput)).rejects.toBe(redirectSignal);
    expect(registrationRequest.redirect).toHaveBeenCalledWith({
      href: "/register/awaiting-approval",
      locale: "en-US",
    });
  });

  it("returns schema-invalid input through the Effect failure channel", async () => {
    const result = await submitRegistration({
      ...validInput,
      email: "not-an-email",
    });

    expect(result).toEqual({
      _tag: "Failure",
      failure: {
        _tag: "InputInvalid",
        category: "bad_input",
        code: "input.invalid",
        issues: [
          {
            path: ["email"],
            message: "Enter a valid email address.",
          },
        ],
        message: "Invalid input.",
        recovery: "fix_input",
      },
    });
    expect(registrationRequest.create).not.toHaveBeenCalled();
    expect(registrationRequest.redirect).not.toHaveBeenCalled();
  });

  it("preserves nested Effect Schema paths in translated issues", async () => {
    const result = await submitRegistration({
      ...validInput,
      address: {
        ...validInput.address,
        region: "",
      },
    });

    expect(result).toEqual({
      _tag: "Failure",
      failure: {
        _tag: "InputInvalid",
        category: "bad_input",
        code: "input.invalid",
        issues: [
          {
            path: ["address", "region"],
            message: "Enter a state, province, or region.",
          },
        ],
        message: "Invalid input.",
        recovery: "fix_input",
      },
    });
    expect(registrationRequest.create).not.toHaveBeenCalled();
  });

  it("preserves registration validation failures as typed schema data", async () => {
    registrationRequest.create.mockReturnValue(
      Effect.fail(
        RegistrationApiValidationErrorFailure.make({
          issues: [
            new ErrorIssue({
              message: "This email is already registered.",
              path: ["email"],
            }),
          ],
          message: "Review the highlighted fields.",
          reasons: [
            new DuplicateRegistrationEmail({
              path: "email",
              code: "duplicateEmail",
            }),
          ],
        })
      )
    );

    const result = await submitRegistration(validInput);

    expect(result).toEqual({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationApiValidationError",
        category: "bad_input",
        code: "registration.invalidInput",
        issues: [
          {
            message: "This email is already registered.",
            path: ["email"],
          },
        ],
        message: "Review the highlighted fields.",
        reasons: [
          {
            _tag: "DuplicateRegistrationEmail",
            code: "duplicateEmail",
            path: "email",
          },
        ],
        recovery: "fix_input",
      },
    });
    expect(registrationRequest.redirect).not.toHaveBeenCalled();
  });

  it("preserves typed API availability failures at the action boundary", async () => {
    registrationRequest.create.mockReturnValue(
      Effect.fail(
        RegistrationApiErrorFailure.make({
          message: "The API returned an English availability message.",
          retryAfterSeconds: 17,
        })
      )
    );

    const result = await submitRegistration(validInput);

    expect(result).toEqual({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationApiError",
        category: "unavailable",
        code: "registration.unavailable",
        message: "The API returned an English availability message.",
        recovery: "retry",
        retryAfterSeconds: 17,
      },
    });
  });

  it("maps an ambiguous client transport failure to outcome unknown", async () => {
    registrationRequest.create.mockReturnValue(
      Effect.fail({
        _tag: "HttpClientError",
        reason: {
          _tag: "TransportError",
          cause: Object.assign(new Error("socket reset"), {
            code: "ECONNRESET",
          }),
        },
      })
    );

    await expect(submitRegistration(validInput)).resolves.toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationSubmissionOutcomeUnknown",
        category: "unavailable",
        code: "registration.submissionOutcomeUnknown",
        message:
          "We could not confirm whether your registration was received. Contact support before submitting it again.",
        recovery: "none",
      },
    });
  });

  it("maps a refused connection transport failure to outcome unknown", async () => {
    registrationRequest.create.mockReturnValue(
      Effect.fail({
        _tag: "HttpClientError",
        reason: {
          _tag: "TransportError",
          cause: Object.assign(new Error("connection refused"), {
            code: "ECONNREFUSED",
          }),
        },
      })
    );

    await expect(submitRegistration(validInput)).resolves.toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationSubmissionOutcomeUnknown",
        category: "unavailable",
        code: "registration.submissionOutcomeUnknown",
        message:
          "We could not confirm whether your registration was received. Contact support before submitting it again.",
        recovery: "none",
      },
    });
  });

  it("maps a transport failure with an opaque cause to outcome unknown", async () => {
    registrationRequest.create.mockReturnValue(
      Effect.fail({
        _tag: "HttpClientError",
        reason: {
          _tag: "TransportError",
          cause: new TypeError("fetch failed"),
        },
      })
    );

    await expect(submitRegistration(validInput)).resolves.toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationSubmissionOutcomeUnknown",
        code: "registration.submissionOutcomeUnknown",
        recovery: "none",
      },
    });
  });

  it("maps a classified response contract mismatch to outcome unknown", async () => {
    registrationRequest.create.mockReturnValue(
      Effect.fail({
        _tag: "RegistrationHttpResponseError",
        cause: { _tag: "SchemaError" },
      })
    );

    await expect(submitRegistration(validInput)).resolves.toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationSubmissionOutcomeUnknown",
        code: "registration.submissionOutcomeUnknown",
        recovery: "none",
      },
    });
    expect(registrationRequest.redirect).not.toHaveBeenCalled();
  });

  it("rejects an unclassified schema error as a defect", async () => {
    registrationRequest.create.mockReturnValue(
      Effect.fail({ _tag: "SchemaError" })
    );

    await expect(submitRegistration(validInput)).rejects.toBeDefined();
    expect(registrationRequest.redirect).not.toHaveBeenCalled();
  });

  it("rejects downstream bad requests after the action input was decoded", async () => {
    registrationRequest.create.mockReturnValue(
      Effect.fail(
        makeInputInvalid({
          issues: [
            new ErrorIssue({ message: "HTTP contract drift", path: [] }),
          ],
          message: "HTTP contract drift",
        })
      )
    );

    await expect(submitRegistration(validInput)).rejects.toMatchObject({
      _tag: "InputInvalid",
    });
  });
});
