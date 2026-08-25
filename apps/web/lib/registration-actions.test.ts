import { ActionClient, ActionMiddleware } from "@repo/actions";
import type { EmptyActionContext } from "@repo/actions";
import { StoreKey } from "@repo/commerce/store";
import { ErrorIssue, makeInputInvalid } from "@repo/errors";
import type { Locale } from "@repo/i18n/types";
import { DuplicateRegistrationEmail, RegistrationId } from "@repo/registration";
import type { RegistrationFormTranslator } from "@repo/registration";
import {
  RegistrationApiErrorFailure,
  RegistrationApiValidationErrorFailure,
} from "@repo/registration/public-errors";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { HttpClientError, HttpClientRequest } from "effect/unstable/http";
import { describe, expect, it } from "vitest";

import { makeRegistrationProcedures } from "./registration-procedures";
import type { RegistrationActionContext } from "./registration-procedures";
import type { RegistrationHttpApiClient } from "./registration-rest-client";
import {
  RegistrationClient,
  RegistrationHttpResponseError,
} from "./registration-rest-client";

const AWAITING_APPROVAL_HREF = "/register/awaiting-approval";
const registrationRequest = HttpClientRequest.get(
  "https://registration.test/registrations"
);

const transportFailure = (cause: unknown) =>
  Effect.fail(
    new HttpClientError.HttpClientError({
      reason: new HttpClientError.TransportError({
        cause,
        request: registrationRequest,
      }),
    })
  );

const schemaFailure = () => Schema.decodeUnknownEffect(Schema.Never)(undefined);

const responseContractFailure = () =>
  schemaFailure().pipe(
    Effect.mapError((cause) => new RegistrationHttpResponseError({ cause }))
  );

const messages = {
  "errors.invalidSubmission": "Review the highlighted fields.",
  "errors.submissionOutcomeUnknown":
    "Registration receipt could not be confirmed.",
  "errors.submitFailed": "Registration is currently unavailable.",
  "validation.duplicateEmail": "This email is already registered.",
  "validation.email": "Enter a valid email address.",
  "validation.region": "Enter a state, province, or region.",
} as const;

const isMessageKey = (key: string): key is keyof typeof messages =>
  key in messages;

const translate: RegistrationFormTranslator = (key) =>
  isMessageKey(key) ? messages[key] : key;

const validInput = {
  address: {
    additionalStreetInfo: "Suite 2",
    city: "New York",
    country: "US",
    postalCode: "10001",
    region: "NY",
    streetName: "1 Main Street",
  },
  companyName: "Hydra Supply",
  companyPhone: "555-0100",
  contactFirstName: "Ada",
  contactLastName: "Lovelace",
  email: "ada@example.com",
  vatId: "US123",
} as const;

const makeHarness = (options: {
  readonly create: RegistrationHttpApiClient["registrations"]["create"];
  readonly onRedirect?: (args: {
    readonly href: string;
    readonly locale: Locale;
  }) => void;
}) => {
  const redirects: { href: string; locale: Locale }[] = [];
  // SAFETY: Test stub supplies only the registrations.create handler exercised by these cases.
  const client: RegistrationHttpApiClient = {
    registrations: {
      approve: () => Effect.die("unused"),
      create: options.create,
      get: () => Effect.die("unused"),
      list: () => Effect.die("unused"),
      reject: () => Effect.die("unused"),
    },
  };

  const TestActions = ActionClient.make(ManagedRuntime.make(Layer.empty))
    .use(
      ActionMiddleware.context<EmptyActionContext, RegistrationActionContext>(
        () =>
          Effect.succeed({
            locale: "en-US",
            t: translate,
          })
      )
    )
    .provide(() => Layer.succeed(RegistrationClient, client));

  const { submitRegistrationProcedure } =
    makeRegistrationProcedures(TestActions);

  return {
    redirects,
    submitRegistration: submitRegistrationProcedure.toAction({
      onSuccess: (_registration, { locale }) => {
        const target = {
          href: AWAITING_APPROVAL_HREF,
          locale,
        };
        redirects.push(target);
        options.onRedirect?.(target);
      },
    }),
  };
};

describe("submitRegistration", () => {
  it("validates and encodes a successful registration before redirecting", async () => {
    const creates: Parameters<
      RegistrationHttpApiClient["registrations"]["create"]
    >[0][] = [];
    const { redirects, submitRegistration } = makeHarness({
      create: (request) => {
        creates.push(request);
        return Effect.succeed({
          registrationId: RegistrationId.make("registration-1"),
          status: "awaiting_approval",
          storeKey: StoreKey.make("default-store"),
        });
      },
    });

    await expect(submitRegistration(validInput)).resolves.toStrictEqual({
      _tag: "Success",
      success: {
        registrationId: "registration-1",
      },
    });
    expect(redirects).toStrictEqual([
      { href: "/register/awaiting-approval", locale: "en-US" },
    ]);
    expect(creates).toStrictEqual([
      expect.objectContaining({
        headers: { "x-context-locale": "en-US" },
      }),
    ]);
  });

  it("propagates Next redirect control flow unchanged", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    const { submitRegistration } = makeHarness({
      create: () =>
        Effect.succeed({
          registrationId: RegistrationId.make("registration-1"),
          status: "awaiting_approval",
          storeKey: StoreKey.make("default-store"),
        }),
      onRedirect: () => {
        throw redirectSignal;
      },
    });

    await expect(submitRegistration(validInput)).rejects.toBe(redirectSignal);
  });

  it("returns schema-invalid input through the Effect failure channel", async () => {
    let createCalled = false;
    const { redirects, submitRegistration } = makeHarness({
      create: () => {
        createCalled = true;
        return Effect.die("unused");
      },
    });

    const result = await submitRegistration({
      ...validInput,
      email: "not-an-email",
    });

    expect(result).toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "InputInvalid",
        category: "bad_input",
        code: "input.invalid",
        issues: [
          {
            message: "Enter a valid email address.",
            path: ["email"],
          },
        ],
        message: "Invalid input.",
        recovery: "fix_input",
      },
    });
    expect(createCalled).toBeFalsy();
    expect(redirects).toStrictEqual([]);
  });

  it("preserves nested Effect Schema paths in translated issues", async () => {
    let createCalled = false;
    const { submitRegistration } = makeHarness({
      create: () => {
        createCalled = true;
        return Effect.die("unused");
      },
    });

    const result = await submitRegistration({
      ...validInput,
      address: {
        ...validInput.address,
        region: "",
      },
    });

    expect(result).toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "InputInvalid",
        category: "bad_input",
        code: "input.invalid",
        issues: [
          {
            message: "Enter a state, province, or region.",
            path: ["address", "region"],
          },
        ],
        message: "Invalid input.",
        recovery: "fix_input",
      },
    });
    expect(createCalled).toBeFalsy();
  });

  it("preserves registration validation failures as typed schema data", async () => {
    const { redirects, submitRegistration } = makeHarness({
      create: () =>
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
                code: "duplicateEmail",
                path: "email",
              }),
            ],
          })
        ),
    });

    const result = await submitRegistration(validInput);

    expect(result).toStrictEqual({
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
    expect(redirects).toStrictEqual([]);
  });

  it("preserves typed API availability failures at the action boundary", async () => {
    const { submitRegistration } = makeHarness({
      create: () =>
        Effect.fail(
          RegistrationApiErrorFailure.make({
            message: "The API returned an English availability message.",
            retryAfterSeconds: 17,
          })
        ),
    });

    const result = await submitRegistration(validInput);

    expect(result).toStrictEqual({
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
    const { submitRegistration } = makeHarness({
      create: () =>
        transportFailure(
          Object.assign(new Error("socket reset"), { code: "ECONNRESET" })
        ),
    });

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
    const { submitRegistration } = makeHarness({
      create: () =>
        transportFailure(
          Object.assign(new Error("connection refused"), {
            code: "ECONNREFUSED",
          })
        ),
    });

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
    const { submitRegistration } = makeHarness({
      create: () => transportFailure(new TypeError("fetch failed")),
    });

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
    const { redirects, submitRegistration } = makeHarness({
      create: responseContractFailure,
    });

    await expect(submitRegistration(validInput)).resolves.toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationSubmissionOutcomeUnknown",
        code: "registration.submissionOutcomeUnknown",
        recovery: "none",
      },
    });
    expect(redirects).toStrictEqual([]);
  });

  it("rejects an unclassified schema error as a defect", async () => {
    const { redirects, submitRegistration } = makeHarness({
      create: schemaFailure,
    });

    await expect(submitRegistration(validInput)).rejects.toBeDefined();
    expect(redirects).toStrictEqual([]);
  });

  it("rejects downstream bad requests after the action input was decoded", async () => {
    const { submitRegistration } = makeHarness({
      create: () =>
        Effect.fail(
          makeInputInvalid({
            issues: [
              new ErrorIssue({ message: "HTTP contract drift", path: [] }),
            ],
            message: "HTTP contract drift",
          })
        ),
    });

    await expect(submitRegistration(validInput)).rejects.toMatchObject({
      _tag: "InputInvalid",
    });
  });
});
