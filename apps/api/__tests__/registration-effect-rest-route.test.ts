import { CommerceAccount } from "@repo/commerce/domain/commerce-account";
import {
  CommerceAccountError,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import { RegistrationReviewerActor } from "@repo/registration-effect/domain/actors";
import { ApprovedDecision } from "@repo/registration-effect/domain/approval";
import {
  AuthUserId,
  CommerceBusinessUnitId,
  CommerceCustomerId,
  CountryCode,
  Email,
  InvitationId,
  RegistrationId,
} from "@repo/registration-effect/domain/identity";
import {
  ApprovalProcessingRegistration,
  ApprovedRegistration,
  AwaitingApprovalRegistration,
  type Registration,
} from "@repo/registration-effect/domain/registration";
import { getRegistrationApprovalHookToken } from "@repo/registration-effect/domain/workflow";
import {
  CreateRegistrationRequest,
  RegistrationApiError,
  RegistrationReviewerInput,
  toCompanyRegistrationDetails,
} from "@repo/registration-effect/http/registration-api";
import { IdentityUsers } from "@repo/registration-effect/services/identity-users";
import { Invitations } from "@repo/registration-effect/services/invitations";
import { RegistrationMarketPolicy } from "@repo/registration-effect/services/registration-market-policy";
import {
  listRegistrationRecords,
  RegistrationQueries,
} from "@repo/registration-effect/services/registration-queries";
import {
  RegistrationNotFound,
  Registrations,
  RegistrationTransitionConflict,
} from "@repo/registration-effect/services/registrations";
import { VatValidator } from "@repo/registration-effect/services/vat-validator";
import { Context, Effect, Layer, Redacted } from "effect";
import { beforeEach, expect, test, vi } from "vitest";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_UNPROCESSABLE_ENTITY = 422;

const workflowApiMocks = vi.hoisted(() => ({
  resumeHook: vi.fn(),
  start: vi.fn(),
}));

vi.mock("workflow/api", () => ({
  resumeHook: workflowApiMocks.resumeHook,
  start: workflowApiMocks.start,
}));

vi.mock("@/env", () => ({
  env: {
    REGISTRATION_APPROVAL_SECRET: "test-approval-secret",
    WORKOS_WEBHOOK_SECRET: "test-webhook-secret",
  },
}));

const registrationPayload = {
  companyName: "Hydra Supplies",
  companyPhone: "+1 555 0100",
  vatId: "VAT-123",
  contactFirstName: "Ada",
  contactLastName: "Lovelace",
  email: "ada@example.com",
  address: {
    streetName: "1 Computation Way",
    additionalStreetInfo: "Suite 42",
    postalCode: "10001",
    city: "New York",
    region: "NY",
    country: "US",
  },
};

const reviewerPayload = {
  reviewer: {
    authUserId: "auth-reviewer-1",
    email: "reviewer@example.com",
    name: "Registration Reviewer",
  },
  reason: "Looks good",
};

const request = (
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
) =>
  new Request(`http://api.test${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const makeAwaitingRegistration = (
  registrationId: string,
  payload: typeof registrationPayload = registrationPayload
) =>
  new AwaitingApprovalRegistration({
    _tag: "AwaitingApprovalRegistration",
    status: "awaiting_approval",
    id: RegistrationId.make(registrationId),
    details: toCompanyRegistrationDetails(
      new CreateRegistrationRequest(payload)
    ),
    createdAt: new Date("2026-03-22T00:00:00.000Z"),
    updatedAt: new Date("2026-03-22T00:00:00.000Z"),
  });

const makeApprovedRegistration = (
  registrationId: string,
  payload: typeof registrationPayload = registrationPayload
) => {
  const awaiting = makeAwaitingRegistration(registrationId, payload);

  return new ApprovedRegistration({
    _tag: "ApprovedRegistration",
    status: "approved",
    id: awaiting.id,
    details: awaiting.details,
    decision: new ApprovedDecision({
      decision: "approved",
      actor: new RegistrationReviewerActor({
        actorType: "registration_reviewer",
        authUserId: AuthUserId.make("auth-reviewer-1"),
        email: Redacted.make(Email.make("reviewer@example.com"), {
          label: "email",
        }),
        name: "Registration Reviewer",
      }),
      decidedAt: new Date("2026-03-22T00:00:01.000Z"),
    }),
    commerceAccount: new CommerceAccount({
      registrationId: awaiting.id,
      customerId: CommerceCustomerId.make("customer-1"),
      businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    }),
    invitationId: InvitationId.make("invitation-1"),
    createdAt: awaiting.createdAt,
    updatedAt: new Date("2026-03-22T00:00:01.000Z"),
  });
};

const makeApiLayer = (
  seed: readonly Registration[] = [],
  options: {
    readonly hasCustomerWithEmail?: boolean;
    readonly hasCustomerWithEmailFailure?: CommerceAccountError;
    readonly hasIdentityUserWithEmail?: boolean;
    readonly invalidVatIds?: readonly string[];
    readonly supportedRegistrationCountries?: readonly string[];
  } = {}
) => {
  const registrations = new Map<string, Registration>(
    seed.map((registration) => [String(registration.id), registration])
  );
  const list = vi.fn((input) =>
    listRegistrationRecords(
      Array.from(registrations.values()).map((registration) => ({
        id: String(registration.id),
        registration,
        createdAt: registration.createdAt,
        lastModifiedAt: registration.updatedAt,
      })),
      input
    )
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
      createAwaitingApproval: ({ details }) =>
        Effect.sync(() => {
          const registrationId = RegistrationId.make(crypto.randomUUID());
          const createdAt = new Date("2026-03-22T00:00:00.000Z");
          const registration = new AwaitingApprovalRegistration({
            _tag: "AwaitingApprovalRegistration",
            status: "awaiting_approval",
            id: registrationId,
            details,
            createdAt,
            updatedAt: createdAt,
          });

          registrations.set(String(registrationId), registration);
          return registration;
        }),
      findByInvitationId: () => Effect.die("not used"),
      get,
      markApprovalProcessing: ({ registrationId, decision }) =>
        Effect.gen(function* () {
          const current = registrations.get(String(registrationId));

          if (!current) {
            return yield* Effect.fail(
              new RegistrationNotFound({
                message: `Registration ${registrationId} was not found`,
                registrationId,
              })
            );
          }

          if (current._tag !== "AwaitingApprovalRegistration") {
            return yield* Effect.fail(
              new RegistrationTransitionConflict({
                message: `Cannot mark registration ${registrationId} as ${decision} from ${current._tag}`,
                registrationId,
                currentState: current._tag,
                attemptedDecision: decision,
              })
            );
          }

          const processing = new ApprovalProcessingRegistration({
            _tag: "ApprovalProcessingRegistration",
            status: "approval_processing",
            id: current.id,
            details: current.details,
            requestedDecision: decision,
            createdAt: current.createdAt,
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
          Array.from(registrations.values()).map((registration) => ({
            id: String(registration.id),
            registration,
            createdAt: registration.createdAt,
            lastModifiedAt: registration.updatedAt,
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
      createFromRegistration: () => Effect.die("not used"),
      linkRegistrantIdentity: () => Effect.die("not used"),
      addAssociate: () => Effect.die("not used"),
      hasCustomerWithEmail: () =>
        options.hasCustomerWithEmailFailure
          ? Effect.fail(options.hasCustomerWithEmailFailure)
          : Effect.succeed(options.hasCustomerWithEmail ?? false),
    })
  );
  const identityUsersLayer = Layer.succeed(
    IdentityUsers,
    IdentityUsers.of({
      hasUserWithEmail: () =>
        Effect.succeed(options.hasIdentityUserWithEmail ?? false),
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
      Invitations.layerMemory
    ),
    list,
    registrations,
  };
};

const makeHandler = async (layer: ReturnType<typeof makeApiLayer>["layer"]) => {
  const { makeRegistrationEffectHttpHandler } = await import(
    "../lib/registration-effect-http"
  );
  const testWorkflow = () => undefined;

  return makeRegistrationEffectHttpHandler({
    approvalSecret: "test-approval-secret",
    layer,
    resumeRegistrationWorkflow: (registrationId, decision) =>
      Effect.tryPromise({
        try: () =>
          workflowApiMocks.resumeHook(
            getRegistrationApprovalHookToken(registrationId),
            decision
          ),
        catch: (cause) =>
          new RegistrationApiError({
            message: cause instanceof Error ? cause.message : "resume failed",
          }),
      }),
    startRegistrationWorkflow: (registrationId) =>
      Effect.tryPromise({
        try: () => workflowApiMocks.start(testWorkflow, [{ registrationId }]),
        catch: (cause) =>
          new RegistrationApiError({
            message: cause instanceof Error ? cause.message : "start failed",
          }),
      }),
  });
};

const emptyContext = () => Context.empty() as Context.Context<unknown>;

beforeEach(() => {
  vi.resetModules();
  workflowApiMocks.resumeHook.mockReset();
  workflowApiMocks.start.mockReset();
});

test("POST /registrations creates an Effect registration and starts the workflow", async () => {
  workflowApiMocks.start.mockResolvedValue({ id: "run-123" });
  const api = makeApiLayer();
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_CREATED);
    expect(body).toMatchObject({
      registrationId: expect.any(String),
      status: "awaiting_approval",
    });
    expect(api.registrations.has(body.registrationId)).toBe(true);
    expect(workflowApiMocks.start).toHaveBeenCalledWith(expect.any(Function), [
      { registrationId: body.registrationId },
    ]);
  } finally {
    await dispose();
  }
});

test("POST /registrations treats preflight provider failures as internal defects", async () => {
  workflowApiMocks.start.mockResolvedValue({ id: "run-123" });
  const api = makeApiLayer([], {
    hasCustomerWithEmailFailure: new CommerceAccountError({
      message: "Commercetools unavailable",
    }),
  });
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.text();

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    expect(body).not.toContain("RegistrationApiError");
    expect(body).not.toContain("CommerceAccountError");
    expect(workflowApiMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations treats workflow start failures as internal defects", async () => {
  workflowApiMocks.start.mockRejectedValue(new Error("workflow unavailable"));
  const api = makeApiLayer();
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request("POST", "/registrations", registrationPayload),
      emptyContext()
    );
    const body = await response.text();

    expect(response.status).toBe(HTTP_INTERNAL_SERVER_ERROR);
    expect(body).not.toContain("RegistrationApiError");
    expect(body).not.toContain("workflow unavailable");
    expect(api.registrations.size).toBe(1);
  } finally {
    await dispose();
  }
});

test("POST /registrations rejects duplicate pending registration emails as field errors", async () => {
  workflowApiMocks.start.mockResolvedValue({ id: "run-123" });
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
          path: "email",
          code: "duplicateEmail",
        },
      ],
    });
    expect(workflowApiMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations rejects invalid VAT ids as field errors", async () => {
  workflowApiMocks.start.mockResolvedValue({ id: "run-123" });
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
          path: "vatId",
          code: "invalidVatId",
        },
      ],
    });
    expect(workflowApiMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations can return multiple validation reasons", async () => {
  workflowApiMocks.start.mockResolvedValue({ id: "run-123" });
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
          path: "email",
          code: "duplicateEmail",
        },
        {
          _tag: "InvalidRegistrationVatId",
          path: "vatId",
          code: "invalidVatId",
        },
      ],
    });
    expect(workflowApiMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations can return field and unsupported country form validation reasons together", async () => {
  workflowApiMocks.start.mockResolvedValue({ id: "run-123" });
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
          path: "vatId",
          code: "invalidVatId",
        },
        {
          _tag: "UnsupportedRegistrationCountry",
          code: "unsupportedRegistrationCountry",
          country: "US",
        },
      ],
    });
    expect(workflowApiMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations rejects existing customer emails as field errors", async () => {
  workflowApiMocks.start.mockResolvedValue({ id: "run-123" });
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
          path: "email",
          code: "duplicateEmail",
        },
      ],
    });
    expect(workflowApiMocks.start).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations rejects existing WorkOS user emails as field errors", async () => {
  workflowApiMocks.start.mockResolvedValue({ id: "run-123" });
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
          path: "email",
          code: "duplicateEmail",
        },
      ],
    });
    expect(workflowApiMocks.start).not.toHaveBeenCalled();
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
      registrationId: String(registration.id),
      companyName: "Hydra Supplies",
      status: "awaiting_approval",
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
  workflowApiMocks.resumeHook.mockResolvedValue(undefined);
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request(
        "POST",
        `/registrations/${registration.id}/approve`,
        reviewerPayload,
        { "x-registration-approval-secret": "test-approval-secret" }
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(body).toMatchObject({
      registrationId: String(registration.id),
      status: "approval_processing",
    });
    expect(workflowApiMocks.resumeHook).toHaveBeenCalledWith(
      getRegistrationApprovalHookToken(String(registration.id)),
      {
        decision: "approved",
        reviewer: reviewerPayload.reviewer,
        reason: "Looks good",
      }
    );
    expect(
      workflowApiMocks.resumeHook.mock.calls[0]?.[1].reviewer
    ).not.toBeInstanceOf(RegistrationReviewerInput);
    expect(api.registrations.get(String(registration.id))?.status).toBe(
      "approval_processing"
    );
  } finally {
    await dispose();
  }
});

test("POST /registrations/:id/approve moves accepted decisions out of awaiting approval list", async () => {
  workflowApiMocks.resumeHook.mockResolvedValue(undefined);
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    await handler(
      request(
        "POST",
        `/registrations/${registration.id}/approve`,
        reviewerPayload,
        { "x-registration-approval-secret": "test-approval-secret" }
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
  workflowApiMocks.resumeHook.mockResolvedValue(undefined);
  const registration = makeApprovedRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request(
        "POST",
        `/registrations/${registration.id}/reject`,
        reviewerPayload,
        { "x-registration-approval-secret": "test-approval-secret" }
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_CONFLICT);
    expect(body._tag).toBe("RegistrationAlreadyApproved");
    expect(workflowApiMocks.resumeHook).not.toHaveBeenCalled();
  } finally {
    await dispose();
  }
});

test("POST /registrations/:id/reject resumes the deterministic workflow hook", async () => {
  workflowApiMocks.resumeHook.mockResolvedValue(undefined);
  const registration = makeAwaitingRegistration(crypto.randomUUID());
  const api = makeApiLayer([registration]);
  const { dispose, handler } = await makeHandler(api.layer);

  try {
    const response = await handler(
      request(
        "POST",
        `/registrations/${registration.id}/reject`,
        reviewerPayload,
        { "x-registration-approval-secret": "test-approval-secret" }
      ),
      emptyContext()
    );
    const body = await response.json();

    expect(response.status).toBe(HTTP_OK);
    expect(body).toMatchObject({
      registrationId: String(registration.id),
      status: "approval_processing",
    });
    expect(workflowApiMocks.resumeHook).toHaveBeenCalledWith(
      getRegistrationApprovalHookToken(String(registration.id)),
      {
        decision: "rejected",
        reviewer: reviewerPayload.reviewer,
        reason: "Looks good",
      }
    );
  } finally {
    await dispose();
  }
});
