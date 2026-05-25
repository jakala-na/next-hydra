import { RegistrationId } from "@repo/registration-effect/domain/identity";
import {
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
import { CommerceAccounts } from "@repo/registration-effect/services/commerce-account";
import { Invitations } from "@repo/registration-effect/services/invitations";
import {
  listRegistrationRecords,
  RegistrationQueries,
} from "@repo/registration-effect/services/registration-queries";
import {
  RegistrationNotFound,
  Registrations,
} from "@repo/registration-effect/services/registrations";
import { Context, Effect, Layer } from "effect";
import { beforeEach, expect, test, vi } from "vitest";

const HTTP_OK = 200;
const HTTP_CREATED = 201;

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

const makeAwaitingRegistration = (registrationId: string) =>
  new AwaitingApprovalRegistration({
    _tag: "AwaitingApprovalRegistration",
    status: "awaiting_approval",
    id: RegistrationId.make(registrationId),
    details: toCompanyRegistrationDetails(
      new CreateRegistrationRequest(registrationPayload)
    ),
    createdAt: new Date("2026-03-22T00:00:00.000Z"),
    updatedAt: new Date("2026-03-22T00:00:00.000Z"),
  });

const makeApiLayer = (seed: readonly Registration[] = []) => {
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
      : Effect.fail(new RegistrationNotFound({ registrationId }));
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
      markApproved: () => Effect.die("not used"),
      markRejected: () => Effect.die("not used"),
    })
  );
  const queriesLayer = Layer.succeed(
    RegistrationQueries,
    RegistrationQueries.of({ list })
  );

  return {
    get,
    layer: Layer.mergeAll(
      registrationsLayer,
      queriesLayer,
      CommerceAccounts.layerMemory,
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
