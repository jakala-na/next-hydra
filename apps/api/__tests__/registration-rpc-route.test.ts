import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { RegistrationNotFoundError } from "@repo/registration/application";
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
    registrationId: crypto.randomUUID(),
    runId: "run_123",
    status: "pending",
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
    data: { code: "unauthorized" },
    status: 401,
  });
});

test("not found errors map through the rpc transport", async () => {
  getRegistration.mockRejectedValue(
    new RegistrationNotFoundError("Registration not found")
  );

  const client = await createClient({
    "x-registration-approval-secret": "test-approval-secret",
  });

  await expect(
    client.get({ registrationId: crypto.randomUUID() })
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    data: { code: "not_found" },
    status: 404,
  });
});

test("unexpected submit errors map to submit_failed", async () => {
  submitRegistration.mockRejectedValue(new Error("boom"));

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
    code: "INTERNAL_SERVER_ERROR",
    data: { code: "submit_failed" },
    status: 500,
  });
});
