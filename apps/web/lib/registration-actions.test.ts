import { StoreKey } from "@repo/commerce/store";
import { DuplicateRegistrationEmail, RegistrationId } from "@repo/registration";
import {
  RegistrationApiError,
  RegistrationApiValidationError,
} from "@repo/registration/http/registration-api";
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
        _tag: "ActionInputInvalid",
        issues: [
          {
            path: ["email"],
            message: "Enter a valid email address.",
          },
        ],
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
        _tag: "ActionInputInvalid",
        issues: [
          {
            path: ["address", "region"],
            message: "Enter a state, province, or region.",
          },
        ],
      },
    });
    expect(registrationRequest.create).not.toHaveBeenCalled();
  });

  it("preserves registration validation failures as typed schema data", async () => {
    registrationRequest.create.mockReturnValue(
      Effect.fail(
        new RegistrationApiValidationError({
          message: "Registration has field validation errors",
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
        error: {
          _tag: "RegistrationIntakeValidationError",
          message: "Registration has field validation errors",
          reasons: [
            {
              _tag: "DuplicateRegistrationEmail",
              code: "duplicateEmail",
              path: "email",
            },
          ],
        },
        issues: [
          {
            path: "email",
            message: "This email is already registered.",
          },
        ],
      },
    });
    expect(registrationRequest.redirect).not.toHaveBeenCalled();
  });

  it("redacts transport failures behind a typed unavailable failure", async () => {
    registrationRequest.create.mockReturnValue(
      Effect.fail(
        new RegistrationApiError({
          message: "private upstream diagnostic",
        })
      )
    );

    const result = await submitRegistration(validInput);

    expect(result).toEqual({
      _tag: "Failure",
      failure: {
        error: { _tag: "RegistrationSubmissionUnavailable" },
        issues: [
          {
            path: "root",
            message: "Registration is currently unavailable.",
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("private upstream diagnostic");
  });
});
