import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { domainError, Err } from "@repo/registration/domain/result";
import type { RegistrationRemoteClient } from "@repo/registration/orpc/types";
import { beforeEach, expect, test, vi } from "vitest";

const submitRegistration = vi.fn();
const getRegistration = vi.fn();
const listRegistrations = vi.fn();
const decideRegistration = vi.fn();

vi.mock("../lib/registration-application", () => ({
  registrationApplication: {
    submitRegistration,
    getRegistration,
    listRegistrations,
    decideRegistration,
  },
}));

vi.mock("../env", () => ({
  env: {
    REGISTRATION_APPROVAL_SECRET: "test-approval-secret",
    WORKOS_WEBHOOK_SECRET: "test-webhook-secret",
  },
}));

const loadRoute = async () => import("../app/rpc/[[...rest]]/route");

const createClient = async (headers?: Record<string, string>) => {
  const { GET, POST } = await loadRoute();

  return createORPCClient<RegistrationRemoteClient>(
    new RPCLink({
      url: "http://localhost/rpc",
      headers: () => headers ?? {},
      fetch: (request) => {
        if (request.method === "GET") {
          return GET(request);
        }

        return POST(request);
      },
    }),
    {
      path: ["registration"],
    }
  );
};

beforeEach(() => {
  vi.resetModules();
  submitRegistration.mockReset();
  getRegistration.mockReset();
  listRegistrations.mockReset();
  decideRegistration.mockReset();
});

test("submit procedure returns the pending workflow result", async () => {
  submitRegistration.mockResolvedValue({
    ok: true,
    data: {
      registrationId: crypto.randomUUID(),
      runId: "run_123",
      status: "pending",
    },
  });

  const client = await createClient();
  const result = await client.submit({
    companyName: "Hydra Industrial",
    contactFirstName: "Ava",
    contactLastName: "Stone",
    email: "ava@example.com",
    address: {
      streetName: "Canal Street",
      postalCode: "10013",
      city: "New York",
      region: "NY",
      country: "US",
    },
  });

  expect(result).toMatchObject({
    runId: "run_123",
    status: "pending",
  });
  expect(submitRegistration).toHaveBeenCalledOnce();
});

test("protected procedures reject unauthenticated callers", async () => {
  const client = await createClient();

  await expect(
    client.decide({
      registrationId: crypto.randomUUID(),
      decision: "approved",
    })
  ).rejects.toMatchObject({
    code: "UNAUTHORIZED",
    data: { reason: "invalid_approval_secret" },
    status: 401,
  });
});

test("not found errors map through the rpc transport", async () => {
  getRegistration.mockResolvedValue(
    Err(
      domainError("REGISTRATION_NOT_FOUND", "Registration not found", {
        registrationId: crypto.randomUUID(),
      })
    )
  );

  const client = await createClient({
    "x-registration-approval-secret": "test-approval-secret",
  });

  await expect(
    client.get({ registrationId: crypto.randomUUID() })
  ).rejects.toMatchObject({
    code: "REGISTRATION_NOT_FOUND",
    data: {
      registrationId: expect.any(String),
    },
    status: 404,
  });
});

test("decide conflicts map through the rpc transport", async () => {
  decideRegistration.mockResolvedValue(
    Err(
      domainError(
        "REGISTRATION_CONFLICT",
        "Registration cannot be processed in its current state",
        {
          registrationId: crypto.randomUUID(),
          reason: "already_approved",
        }
      )
    )
  );

  const client = await createClient({
    "x-registration-approval-secret": "test-approval-secret",
  });

  await expect(
    client.decide({
      registrationId: crypto.randomUUID(),
      decision: "approved",
    })
  ).rejects.toMatchObject({
    code: "REGISTRATION_CONFLICT",
    data: {
      registrationId: expect.any(String),
      reason: "already_approved",
    },
    status: 409,
  });
});

test("submit failures map to SUBMIT_FAILED", async () => {
  submitRegistration.mockResolvedValue(
    Err(
      domainError("SUBMIT_FAILED", "Registration workflow failed to start", {
        reason: "workflow_start_failed",
      })
    )
  );

  const client = await createClient();

  await expect(
    client.submit({
      companyName: "Hydra Industrial",
      contactFirstName: "Ava",
      contactLastName: "Stone",
      email: "ava@example.com",
      address: {
        streetName: "Canal Street",
        postalCode: "10013",
        city: "New York",
        region: "NY",
        country: "US",
      },
    })
  ).rejects.toMatchObject({
    code: "SUBMIT_FAILED",
    data: { reason: "workflow_start_failed" },
    status: 500,
  });
});

test("unexpected list errors map to UNKNOWN", async () => {
  listRegistrations.mockResolvedValue(
    Err(
      domainError("UNKNOWN", "Registration list failed", { operation: "list" })
    )
  );

  const client = await createClient({
    "x-registration-approval-secret": "test-approval-secret",
  });

  await expect(client.list({})).rejects.toMatchObject({
    code: "UNKNOWN",
    data: { operation: "list" },
    status: 500,
  });
});
