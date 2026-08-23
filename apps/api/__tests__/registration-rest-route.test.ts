import {
  AccessTokenInvalid,
  AccessTokenVerifier,
  AuthUserId as AccessTokenAuthUserId,
  VerifiedAccessToken,
  authPermissionsFrom,
} from "@repo/auth/access-token";
import { CommerceAccount } from "@repo/commerce/domain/commerce-account";
import {
  CommerceAccountUnavailable,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import { StoreKey } from "@repo/commerce/store";
import { RegistrationReviewerActor } from "@repo/registration/domain/actors";
import { ApprovedDecision } from "@repo/registration/domain/approval";
import {
  AuthUserId,
  CommerceBusinessUnitId,
  CommerceCustomerId,
  CountryCode,
  Email,
  InvitationId,
  RegistrationId,
} from "@repo/registration/domain/identity";
import type { IdentityUserProfile } from "@repo/registration/domain/identity";
import {
  ApprovalProcessingRegistration,
  ApprovedRegistration,
  AwaitingApprovalRegistration,
} from "@repo/registration/domain/registration";
import type { Registration } from "@repo/registration/domain/registration";
import {
  CreateRegistrationRequest,
  toCompanyRegistrationDetails,
} from "@repo/registration/http/registration-api";
import {
  IdentityUserLookupFailure,
  IdentityUserNotFound,
  IdentityUsers,
} from "@repo/registration/services/identity-users";
import { invitationCapabilitiesLayerMemory } from "@repo/registration/services/invitations";
import { RegistrationMarketPolicy } from "@repo/registration/services/registration-market-policy";
import {
  listRegistrationRecords,
  RegistrationQueries,
  RegistrationQueryFailure,
} from "@repo/registration/services/registration-queries";
import {
  RegistrationWorkflow,
  RegistrationWorkflowResumeOutcomeUnknown,
  RegistrationWorkflowStartUnavailable,
} from "@repo/registration/services/registration-workflow";
import {
  RegistrationNotFound,
  Registrations,
  RegistrationTransitionConflict,
} from "@repo/registration/services/registrations";
import { VatValidator } from "@repo/registration/services/vat-validator";
import { Context, Effect, Layer, Redacted } from "effect";
import { beforeEach, expect, test, vi } from "vitest";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_UNAUTHORIZED = 401;
const HTTP_UNPROCESSABLE_ENTITY = 422;

const workflowMocks = vi.hoisted(() => ({
  resumeReview: vi.fn(),
  start: vi.fn(),
}));

const registrationPayload = {
  address: {
    additionalStreetInfo: "Suite 42",
    city: "New York",
    country: "US",
    postalCode: "10001",
    region: "NY",
    streetName: "1 Computation Way",
  },
  companyName: "Hydra Supplies",
  companyPhone: "+1 555 0100",
  contactFirstName: "Ada",
  contactLastName: "Lovelace",
  email: "ada@example.com",
  vatId: "VAT-123",
};

const reviewerPayload = {
  reason: "Looks good",
};

const reviewerWorkflowPayload = {
  authUserId: "auth-reviewer-1",
  email: "reviewer@example.com",
  name: "Registration Reviewer",
};

const request = (
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
) =>
  new Request(`http://api.test${path}`, {
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      authorization: "Bearer admin-token",
      "x-context-locale": "en-US",
      ...headers,
    },
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const makeAwaitingRegistration = (
  registrationId: string,
  payload: typeof registrationPayload = registrationPayload
) =>
  new AwaitingApprovalRegistration({
    _tag: "AwaitingApprovalRegistration",
    createdAt: new Date("2026-03-22T00:00:00.000Z"),
    details: toCompanyRegistrationDetails(
      new CreateRegistrationRequest(payload)
    ),
    id: RegistrationId.make(registrationId),
    status: "awaiting_approval",
    storeKey: StoreKey.make("default-store"),
    updatedAt: new Date("2026-03-22T00:00:00.000Z"),
  });

const makeApprovedRegistration = (
  registrationId: string,
  payload: typeof registrationPayload = registrationPayload
) => {
  const awaiting = makeAwaitingRegistration(registrationId, payload);

  return new ApprovedRegistration({
    _tag: "ApprovedRegistration",
    commerceAccount: new CommerceAccount({
      businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
      customerId: CommerceCustomerId.make("customer-1"),
      registrationId: awaiting.id,
    }),
    createdAt: awaiting.createdAt,
    decision: new ApprovedDecision({
      actor: new RegistrationReviewerActor({
        actorType: "registration_reviewer",
        authUserId: AuthUserId.make("auth-reviewer-1"),
        email: Redacted.make(Email.make("reviewer@example.com"), {
          label: "email",
        }),
        name: "Registration Reviewer",
      }),
      decidedAt: new Date("2026-03-22T00:00:01.000Z"),
      decision: "approved",
    }),
    details: awaiting.details,
    id: awaiting.id,
    invitationId: InvitationId.make("invitation-1"),
    status: "approved",
    storeKey: awaiting.storeKey,
    updatedAt: new Date("2026-03-22T00:00:01.000Z"),
  });
};

const makeApiLayer = (
  seed: readonly Registration[] = [],
  options: {
    readonly hasCustomerWithEmail?: boolean;
    readonly hasCustomerWithEmailFailure?: CommerceAccountUnavailable;
    readonly hasIdentityUserWithEmail?: boolean;
    readonly hasIdentityUserWithEmailFailure?: IdentityUserLookupFailure;
    readonly identityUserGetFailure?:
      | IdentityUserLookupFailure
      | IdentityUserNotFound;
    readonly invalidVatIds?: readonly string[];
    readonly listFailure?: RegistrationQueryFailure;
    readonly supportedRegistrationCountries?: readonly string[];
  } = {}
) => {
  const registrations = new Map<string, Registration>(
    seed.map((registration) => [String(registration.id), registration])
  );
  const list = vi.fn((input) =>
    options.listFailure === undefined
      ? listRegistrationRecords(
          [...registrations.values()].map((registration) => ({
            createdAt: registration.createdAt,
            id: String(registration.id),
            lastModifiedAt: registration.updatedAt,
            registration,
          })),
          input
        )
      : Effect.fail(options.listFailure)
  );
  const get = vi.fn((registrationId: RegistrationId) => {
    const registration = registrations.get(String(registrationId));

    return registration
      ? Effect.succeed(registration)
      : Effect.fail(
          new RegistrationNotFound({
            message: `Registration ${registrationId} was not found`,
            registrationId,
          })
        );
  });

  const registrationsLayer = Layer.succeed(
    Registrations,
    Registrations.of({
      createAwaitingApproval: ({ details, storeKey }) =>
        Effect.sync(() => {
          const registrationId = RegistrationId.make(crypto.randomUUID());
          const createdAt = new Date("2026-03-22T00:00:00.000Z");
          const registration = new AwaitingApprovalRegistration({
            _tag: "AwaitingApprovalRegistration",
            createdAt,
            details,
            id: registrationId,
            status: "awaiting_approval",
            storeKey,
            updatedAt: createdAt,
          });

          registrations.set(String(registrationId), registration);
          return registration;
        }),
      discardAwaitingApproval: (registrationId) =>
        Effect.sync(() => {
          registrations.delete(String(registrationId));
        }),
      findByInvitationId: () => Effect.die("not used"),
      get,
      markApprovalProcessing: ({ registrationId, decision }) =>
        Effect.gen(function* markApprovalProcessing() {
          const current = registrations.get(String(registrationId));

          if (!current) {
            return yield* new RegistrationNotFound({
              message: `Registration ${registrationId} was not found`,
              registrationId,
            });
          }

          if (current._tag !== "AwaitingApprovalRegistration") {
            return yield* new RegistrationTransitionConflict({
              attemptedDecision: decision,
              currentState: current._tag,
              message: `Cannot mark registration ${registrationId} as ${decision} from ${current._tag}`,
              registrationId,
            });
          }

          const processing = new ApprovalProcessingRegistration({
            _tag: "ApprovalProcessingRegistration",
            createdAt: current.createdAt,
            details: current.details,
            id: current.id,
            requestedDecision: decision,
            status: "approval_processing",
            storeKey: current.storeKey,
            updatedAt: new Date("2026-03-22T00:00:01.000Z"),
          });

          registrations.set(String(registrationId), processing);
          return processing;
        }),
      markApproved: () => Effect.die("not used"),
      markRejected: () => Effect.die("not used"),
    })
  );
  const queriesLayer = Layer.succeed(
    RegistrationQueries,
    RegistrationQueries.of({
      hasPendingEmail: (email) =>
        listRegistrationRecords(
          [...registrations.values()].map((registration) => ({
            createdAt: registration.createdAt,
            id: String(registration.id),
            lastModifiedAt: registration.updatedAt,
            registration,
          })),
          {}
        ).pipe(
          Effect.map((result) =>
            result.items.some(
              (item) =>
                (item.registration.status === "awaiting_approval" ||
                  item.registration.status === "approval_processing") &&
                String(Redacted.value(item.registration.details.email))
                  .trim()
                  .toLowerCase() ===
                  String(Redacted.value(email)).trim().toLowerCase()
            )
          )
        ),
      list,
    })
  );
  const commerceAccountsLayer = Layer.succeed(
    CommerceAccounts,
    CommerceAccounts.of({
      addAssociate: () => Effect.die("not used"),
      createFromRegistration: () => Effect.die("not used"),
      getCustomerIdByAuthUserId: () => Effect.die("not used"),
      getCustomerProfile: () => Effect.die("not used"),
      hasCustomerWithEmail: () =>
        options.hasCustomerWithEmailFailure
          ? Effect.fail(options.hasCustomerWithEmailFailure)
          : Effect.succeed(options.hasCustomerWithEmail ?? false),
      linkRegistrantIdentity: () => Effect.die("not used"),
      listBusinessUnitMembershipsForCustomerInStore: () =>
        Effect.die("not used"),
    })
  );
  const identityUsersLayer = Layer.succeed(
    IdentityUsers,
    IdentityUsers.of({
      getById: (authUserId) =>
        options.identityUserGetFailure === undefined
          ? Effect.succeed({
              authUserId,
              email: Redacted.make(Email.make("reviewer@example.com"), {
                label: "email",
              }),
              name: "Registration Reviewer",
            } satisfies IdentityUserProfile)
          : Effect.fail(options.identityUserGetFailure),
      hasUserWithEmail: () =>
        options.hasIdentityUserWithEmailFailure === undefined
          ? Effect.succeed(options.hasIdentityUserWithEmail ?? false)
          : Effect.fail(options.hasIdentityUserWithEmailFailure),
    })
  );
  const vatValidatorLayer = VatValidator.layerMemoryFrom({
    invalidVatIds: options.invalidVatIds ?? [],
  });
  const registrationMarketPolicyLayer =
    RegistrationMarketPolicy.layerMemoryFrom({
      supportedCountries: (
        options.supportedRegistrationCountries ?? [
          registrationPayload.address.country,
        ]
      ).map((country) => CountryCode.make(country)),
    });
  return {
    get,
    layer: Layer.mergeAll(
      registrationsLayer,
      queriesLayer,
      commerceAccountsLayer,
      identityUsersLayer,
      registrationMarketPolicyLayer,
      vatValidatorLayer,
      invitationCapabilitiesLayerMemory
    ),
    list,
    registrations,
  };
};

const makeHandler = async (layer: ReturnType<typeof makeApiLayer>["layer"]) => {
  const { makeRegistrationHttpHandler } =
    await import("../lib/registration/http");
  const authenticationLayer = Layer.succeed(
    AccessTokenVerifier,
    AccessTokenVerifier.of({
      verify: (token) => {
        if (token === "invalid-token") {
          return Effect.fail(
            new AccessTokenInvalid({
              message: "Invalid token",
              reason: "invalidToken",
            })
          );
        }

        const permissions =
          token === "read-token"
            ? ["registration.read"]
            : (token === "decide-token"
              ? ["registration.decide"]
              : ["registration.read", "registration.decide"]);

        return Effect.succeed(
          new VerifiedAccessToken({
            authUserId: AccessTokenAuthUserId.make("auth-reviewer-1"),
            permissions: authPermissionsFrom(permissions),
          })
        );
      },
    })
  );

  const workflowLayer = Layer.succeed(
    RegistrationWorkflow,
    RegistrationWorkflow.of({
      resumeInvitation: () => Effect.die("not used"),
      resumeReview: (registrationId, decision) =>
        Effect.tryPromise({
          catch: (cause) =>
            new RegistrationWorkflowResumeOutcomeUnknown({
              cause,
              message: "Workflow resume outcome is unknown",
              registrationId,
            }),
          try: () => workflowMocks.resumeReview(registrationId, decision),
        }),
      start: (registrationId) =>
        Effect.tryPromise({
          catch: (cause) =>
            new RegistrationWorkflowStartUnavailable({
              cause,
              message: "Workflow could not be started",
              registrationId,
            }),
          try: () => workflowMocks.start(registrationId),
        }).pipe(Effect.asVoid),
    })
  );

  return makeRegistrationHttpHandler({
    authenticationLayer,
    layer: layer.pipe(Layer.provideMerge(workflowLayer)),
  });
};

const emptyContext = () => Context.empty() as Context.Context<unknown>;

beforeEach(() => {
  vi.resetModules();
  workflowMocks.resumeReview.mockReset();
  workflowMocks.start.mockReset();
});

test("POST /registrations creates an Effect registration and starts the workflow", async () => {
  workflowMocks.start.mockResolvedValue({ id: "run-123" });
  const api = makeApiLayer();
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload, {
        "x-context-locale": "en-GB",
      }),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_CREATED);
    expect(body).toMatchObject({
      registrationId: expect.any(String),
      status: "awaiting_approval",
      storeKey: "de-fr-uk",
    });
    expect(api.registrations.get(body.registrationId)?.storeKey).toBe(
      "de-fr-uk"
    );
    expect(workflowMocks.start).toHaveBeenCalledWith(body.registrationId);
  } finally {
    await dispose();
  }
});

test("POST /registrations rejects unsupported storefront locales", async () => {
  const api = makeApiLayer();
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload, {
        "x-context-locale": "xx-XX",
      }),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(body).toMatchObject({
      _tag: "InputInvalid",
      issues: [{ path: ["x-context-locale"] }],
    });
    expect(api.registrations.size).toBe(0);
    expect(workflowMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations maps preflight provider failures to the typed internal error", async () => {
  workflowMocks.start.mockResolvedValue({ id: "run-123" });
  const api = makeApiLayer([], {
    hasCustomerWithEmailFailure: new CommerceAccountUnavailable({
      message: "Commercetools unavailable",
    }),
  });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(body).toStrictEqual({
      _tag: "RegistrationApiError",
      category: "unavailable",
      code: "registration.unavailable",
      message: "The registration service is temporarily unavailable.",
      recovery: "retry",
    });
    expect(JSON.stringify(body)).not.toContain("Commercetools unavailable");
    expect(workflowMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations keeps recoverable identity provider outages typed", async () => {
  workflowMocks.start.mockResolvedValue({ id: "run-123" });
  const api = makeApiLayer([], {
    hasIdentityUserWithEmailFailure: new IdentityUserLookupFailure({
      cause: new TypeError("fetch failed"),
      message: "Private WorkOS transport diagnostic",
      operation: "hasUserWithEmail",
      reason: "unavailable",
    }),
  });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(body).toStrictEqual({
      _tag: "RegistrationApiError",
      category: "unavailable",
      code: "registration.unavailable",
      message: "The registration service is temporarily unavailable.",
      recovery: "retry",
    });
    expect(JSON.stringify(body)).not.toContain("WorkOS");
    expect(workflowMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations treats identity provider client failures as defects", async () => {
  workflowMocks.start.mockResolvedValue({ id: "run-123" });
  const api = makeApiLayer([], {
    hasIdentityUserWithEmailFailure: new IdentityUserLookupFailure({
      cause: new Error("invalid WorkOS credentials"),
      message: "Private WorkOS authentication diagnostic",
      operation: "hasUserWithEmail",
      reason: "unexpectedResponse",
    }),
  });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    expect(body).toStrictEqual({
      _tag: "Unexpected",
      category: "unexpected",
      code: "unexpected",
      message: "Something went wrong.",
      recovery: "none",
    });
    expect(JSON.stringify(body)).not.toContain("WorkOS");
    expect(workflowMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations compensates a failed workflow start and recommends retry", async () => {
  workflowMocks.start.mockRejectedValue(new Error("workflow unavailable"));
  const api = makeApiLayer();
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(body).toStrictEqual({
      _tag: "RegistrationApiError",
      category: "unavailable",
      code: "registration.unavailable",
      message:
        "We could not submit your registration right now. Please try again.",
      recovery: "retry",
    });
    expect(JSON.stringify(body)).not.toContain("workflow unavailable");
    expect(workflowMocks.start).toHaveBeenCalledOnce();
    expect(api.registrations.size).toBe(0);
  } finally {
    await dispose();
  }
});

test("POST /registrations rejects duplicate pending registration emails as field errors", async () => {
  workflowMocks.start.mockResolvedValue({ id: "run-123" });
  const existing = makeAwaitingRegistration(crypto.randomUUID(), {
    ...registrationPayload,
    vatId: "VAT-OTHER",
  });
  const api = makeApiLayer([existing]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", {
        ...registrationPayload,
        email: " ADA@example.com ",
      }),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    expect(body).toMatchObject({
      _tag: "RegistrationApiValidationError",
      reasons: [
        {
          _tag: "DuplicateRegistrationEmail",
          code: "duplicateEmail",
          path: "email",
        },
      ],
    });
    expect(workflowMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations rejects invalid VAT ids as field errors", async () => {
  workflowMocks.start.mockResolvedValue({ id: "run-123" });
  const api = makeApiLayer([], { invalidVatIds: ["VAT-123"] });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    expect(body).toMatchObject({
      _tag: "RegistrationApiValidationError",
      reasons: [
        {
          _tag: "InvalidRegistrationVatId",
          code: "invalidVatId",
          path: "vatId",
        },
      ],
    });
    expect(workflowMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations can return multiple validation reasons", async () => {
  workflowMocks.start.mockResolvedValue({ id: "run-123" });
  const existing = makeAwaitingRegistration(crypto.randomUUID(), {
    ...registrationPayload,
    vatId: "VAT-OTHER",
  });
  const api = makeApiLayer([existing], { invalidVatIds: ["VAT-123"] });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    expect(body).toMatchObject({
      _tag: "RegistrationApiValidationError",
      reasons: [
        {
          _tag: "DuplicateRegistrationEmail",
          code: "duplicateEmail",
          path: "email",
        },
        {
          _tag: "InvalidRegistrationVatId",
          code: "invalidVatId",
          path: "vatId",
        },
      ],
    });
    expect(workflowMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations can return field and unsupported country form validation reasons together", async () => {
  workflowMocks.start.mockResolvedValue({ id: "run-123" });
  const api = makeApiLayer([], {
    invalidVatIds: ["VAT-123"],
    supportedRegistrationCountries: ["CA"],
  });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    expect(body).toMatchObject({
      _tag: "RegistrationApiValidationError",
      reasons: [
        {
          _tag: "InvalidRegistrationVatId",
          code: "invalidVatId",
          path: "vatId",
        },
        {
          _tag: "UnsupportedRegistrationCountry",
          code: "unsupportedRegistrationCountry",
          country: "US",
        },
      ],
    });
    expect(workflowMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations rejects existing customer emails as field errors", async () => {
  workflowMocks.start.mockResolvedValue({ id: "run-123" });
  const api = makeApiLayer([], { hasCustomerWithEmail: true });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    expect(body).toMatchObject({
      _tag: "RegistrationApiValidationError",
      reasons: [
        {
          _tag: "DuplicateRegistrationEmail",
          code: "duplicateEmail",
          path: "email",
        },
      ],
    });
    expect(workflowMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations rejects existing WorkOS user emails as field errors", async () => {
  workflowMocks.start.mockResolvedValue({ id: "run-123" });
  const api = makeApiLayer([], { hasIdentityUserWithEmail: true });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_UNPROCESSABLE_ENTITY);
    expect(body).toMatchObject({
      _tag: "RegistrationApiValidationError",
      reasons: [
        {
          _tag: "DuplicateRegistrationEmail",
          code: "duplicateEmail",
          path: "email",
        },
      ],
    });
    expect(workflowMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("GET /registrations lists registrations through RegistrationQueries", async () => {
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("GET", "/registrations?status=awaiting_approval&search=Hydra"),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(api.list).toHaveBeenCalledWith({
      search: "Hydra",
      status: "awaiting_approval",
    });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      companyName: "Hydra Supplies",
      registrationId: String(registration.id),
      status: "awaiting_approval",
    });
  } finally {
    await dispose();
  }
});

test.each([
  { expectedStatus: HTTP_SERVICE_UNAVAILABLE, reason: "unavailable" },
  { expectedStatus: HTTP_INTERNAL_SERVER_ERROR, reason: "invalidData" },
] as const)(
  "GET /registrations classifies $reason query failures",
  async ({ expectedStatus, reason }) => {
    const api = makeApiLayer([], {
      listFailure: new RegistrationQueryFailure({
        cause: new Error("private registration query diagnostic"),
        message: "Private registration query diagnostic",
        operation: "list",
        reason,
      }),
    });
    const { dispose, handler } = await makeHandler(api.layer);

    try {
      const response = await handler(
        request("GET", "/registrations", undefined, {
          authorization: "Bearer read-token",
        }),
        emptyContext()
      );
      const body = await response.json();

      expect(response.status).toBe(expectedStatus);
      expect(JSON.stringify(body)).not.toContain(
        "private registration query diagnostic"
      );
      expect(body).toMatchObject(
        reason === "unavailable"
          ? { _tag: "RegistrationApiError", category: "unavailable" }
          : { _tag: "Unexpected", category: "unexpected" }
      );
    } finally {
      await dispose();
    }
  }
);

test.each(["", "1234567admin-token"])(
  "GET /registrations rejects missing or malformed access token %j",
  async (authorization) => {
    const api = makeApiLayer();
    const { dispose, handler } = await makeHandler(api.layer);

    try {
      const response = await handler(
        request("GET", "/registrations", undefined, { authorization }),
        emptyContext()
      );

      expect(response.status).toBe(HTTP_UNAUTHORIZED);
    } finally {
      await dispose();
    }
  }
);

test("GET /registrations requires registration.read permission", async () => {
  const api = makeApiLayer();
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("GET", "/registrations", undefined, {
        authorization: "Bearer decide-token",
      }),
      emptyContext()
    );

    expect(response.status).toBe(HTTP_FORBIDDEN);
  } finally {
    await dispose();
  }
});

test("GET /registrations maps invalid cursors to bad requests", async () => {
  const api = makeApiLayer();
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("GET", "/registrations?cursor=not-a-cursor"),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(body).toMatchObject({
      _tag: "RegistrationQueryInvalidCursor",
      message: "The registration cursor is invalid.",
    });
  } finally {
    await dispose();
  }
});

test("GET /registrations/:id loads a registration through Registrations", async () => {
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("GET", `/registrations/${registration.id}`),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(api.get).toHaveBeenCalledWith(registration.id);
    expect(body.registrationId).toBe(String(registration.id));
  } finally {
    await dispose();
  }
});

test("POST /registrations/:id/approve resumes the deterministic workflow hook", async () => {
  workflowMocks.resumeReview.mockResolvedValue(undefined);
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request(
        "POST",
        `/registrations/${registration.id}/approve`,
        reviewerPayload
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(body).toMatchObject({
      registrationId: String(registration.id),
      status: "approval_processing",
    });
    expect(workflowMocks.resumeReview).toHaveBeenCalledWith(registration.id, {
      decision: "approved",
      reason: "Looks good",
      reviewer: reviewerWorkflowPayload,
    });
    expect(api.registrations.get(String(registration.id))?.status).toBe(
      "approval_processing"
    );
  } finally {
    await dispose();
  }
});

test("POST /registrations/:id/approve requires registration.decide permission", async () => {
  workflowMocks.resumeReview.mockResolvedValue(undefined);
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request(
        "POST",
        `/registrations/${registration.id}/approve`,
        reviewerPayload,
        { authorization: "Bearer read-token" }
      ),
      emptyContext()
    );

    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(workflowMocks.resumeReview).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations/:id/approve rejects a token whose identity no longer exists", async () => {
  workflowMocks.resumeReview.mockResolvedValue(undefined);
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration], {
    identityUserGetFailure: new IdentityUserNotFound({
      authUserId: AuthUserId.make("auth-reviewer-1"),
      message: "Identity user auth-reviewer-1 was not found",
    }),
  });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request(
        "POST",
        `/registrations/${registration.id}/approve`,
        reviewerPayload
      ),
      emptyContext()
    );

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
    expect(workflowMocks.resumeReview).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations/:id/approve reports identity provider failures as unavailable", async () => {
  workflowMocks.resumeReview.mockResolvedValue(undefined);
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration], {
    identityUserGetFailure: new IdentityUserLookupFailure({
      cause: new Error("WorkOS unavailable"),
      message: "WorkOS identity user getById failed",
      operation: "getById",
      reason: "unavailable",
    }),
  });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request(
        "POST",
        `/registrations/${registration.id}/approve`,
        reviewerPayload
      ),
      emptyContext()
    );

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(workflowMocks.resumeReview).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations/:id/approve treats identity provider client failures as defects", async () => {
  workflowMocks.resumeReview.mockResolvedValue(undefined);
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration], {
    identityUserGetFailure: new IdentityUserLookupFailure({
      cause: new Error("invalid WorkOS credentials"),
      message: "Private WorkOS authentication diagnostic",
      operation: "getById",
      reason: "unexpectedResponse",
    }),
  });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request(
        "POST",
        `/registrations/${registration.id}/approve`,
        reviewerPayload
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    expect(body).toStrictEqual({
      _tag: "Unexpected",
      category: "unexpected",
      code: "unexpected",
      message: "Something went wrong.",
      recovery: "none",
    });
    expect(JSON.stringify(body)).not.toContain("WorkOS");
    expect(workflowMocks.resumeReview).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations/:id/approve moves accepted decisions out of awaiting approval list", async () => {
  workflowMocks.resumeReview.mockResolvedValue(undefined);
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    await handler(
      request(
        "POST",
        `/registrations/${registration.id}/approve`,
        reviewerPayload
      ),
      emptyContext()
    );

    const response = await handler(
      request("GET", "/registrations?status=awaiting_approval"),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(body.items).toHaveLength(0);
  } finally {
    await dispose();
  }
});

test("POST /registrations/:id/reject does not resume workflow when transition conflicts", async () => {
  workflowMocks.resumeReview.mockResolvedValue(undefined);
  const registration = makeApprovedRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request(
        "POST",
        `/registrations/${registration.id}/reject`,
        reviewerPayload
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_CONFLICT);
    expect(body._tag).toBe("RegistrationAlreadyApproved");
    expect(workflowMocks.resumeReview).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations/:id/approve reports an ambiguous decision outcome as refreshable", async () => {
  workflowMocks.resumeReview.mockRejectedValue(new TypeError("fetch failed"));
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request(
        "POST",
        `/registrations/${registration.id}/approve`,
        reviewerPayload
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(body).toStrictEqual({
      _tag: "RegistrationDecisionOutcomeUnknown",
      category: "unavailable",
      code: "registration.decisionOutcomeUnknown",
      message:
        "The decision was received, but processing could not be confirmed. Refresh before taking further action.",
      recovery: "refresh",
      registrationId: String(registration.id),
    });
    expect(api.registrations.get(registration.id)?._tag).toBe(
      "ApprovalProcessingRegistration"
    );
  } finally {
    await dispose();
  }
});

test("POST /registrations/:id/reject resumes the deterministic workflow hook", async () => {
  workflowMocks.resumeReview.mockResolvedValue(undefined);
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request(
        "POST",
        `/registrations/${registration.id}/reject`,
        reviewerPayload
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(body).toMatchObject({
      registrationId: String(registration.id),
      status: "approval_processing",
    });
    expect(workflowMocks.resumeReview).toHaveBeenCalledWith(registration.id, {
      decision: "rejected",
      reason: "Looks good",
      reviewer: reviewerWorkflowPayload,
    });
  } finally {
    await dispose();
  }
});
