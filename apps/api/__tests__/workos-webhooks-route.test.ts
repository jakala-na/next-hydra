import { createHmac } from "node:crypto";
import { getRegistrationInvitationHookToken } from "@repo/registration";
import { beforeEach, expect, test, vi } from "vitest";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

const mocks = vi.hoisted(() => ({
  getWorkosUser: vi.fn(),
  resumeHook: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@repo/auth-workos/admin", () => ({
  getWorkosUser: mocks.getWorkosUser,
}));

vi.mock("workflow/api", () => ({
  resumeHook: mocks.resumeHook,
}));

vi.mock("@repo/observability/log", () => ({
  log: {
    warn: mocks.warn,
  },
}));

vi.mock("../env", () => ({
  env: {
    WORKOS_API_KEY: "sk_test_123",
    WORKOS_WEBHOOK_SECRET: "workos-test-secret",
  },
}));

const loadRoute = async () => import("../app/api/webhooks/workos/route");

const signPayload = (payload: string) => {
  const timestamp = `${Date.now()}`;
  const signature = createHmac("sha256", "workos-test-secret")
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");

  return `t=${timestamp}, v1=${signature}`;
};

const createWebhookRequest = (payload: unknown, signature?: string) => {
  const rawBody = JSON.stringify(payload);

  return new Request("http://localhost/api/webhooks/workos", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "workos-signature": signature ?? signPayload(rawBody),
    },
    body: rawBody,
  });
};

beforeEach(() => {
  vi.resetModules();
  mocks.getWorkosUser.mockReset();
  mocks.resumeHook.mockReset();
  mocks.warn.mockReset();
});

test("unsupported webhook events are ignored", async () => {
  const { POST } = await loadRoute();
  const response = await POST(
    createWebhookRequest({
      event: "user.created",
      id: "evt_123",
      data: { id: "ignored" },
    })
  );

  expect(response.status).toBe(HTTP_OK);
  expect(await response.json()).toEqual({ ok: true, ignored: true });
  expect(mocks.getWorkosUser).not.toHaveBeenCalled();
  expect(mocks.resumeHook).not.toHaveBeenCalled();
});

test("invalid webhook signatures are rejected", async () => {
  const { POST } = await loadRoute();
  const response = await POST(
    createWebhookRequest(
      {
        event: "invitation.revoked",
        id: "evt_123",
        data: { id: "inv_123" },
      },
      "t=1, v1=invalid"
    )
  );

  expect(response.status).toBe(HTTP_UNAUTHORIZED);
  expect(await response.json()).toEqual({ error: "Invalid WorkOS signature" });
});

test("revoked invitation events resume the registration invitation hook", async () => {
  const { POST } = await loadRoute();
  mocks.resumeHook.mockResolvedValue(undefined);
  const response = await POST(
    createWebhookRequest({
      event: "invitation.revoked",
      id: "evt_123",
      data: { id: "inv_123" },
    })
  );

  expect(response.status).toBe(HTTP_OK);
  expect(await response.json()).toEqual({ ok: true });
  expect(mocks.resumeHook).toHaveBeenCalledWith(
    getRegistrationInvitationHookToken("inv_123"),
    { event: "revoked" }
  );
});

test("accepted invitation events require an accepted user id", async () => {
  const { POST } = await loadRoute();
  const response = await POST(
    createWebhookRequest({
      event: "invitation.accepted",
      id: "evt_123",
      data: { id: "inv_123", acceptedUserId: null },
    })
  );

  expect(response.status).toBe(HTTP_BAD_REQUEST);
  expect(await response.json()).toEqual({
    error: "Invitation accepted event missing accepted user id",
  });
});

test("accepted invitation events resume the registration invitation hook", async () => {
  mocks.getWorkosUser.mockResolvedValue({
    id: "user_123",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  });
  mocks.resumeHook.mockResolvedValue(undefined);
  const { POST } = await loadRoute();
  const response = await POST(
    createWebhookRequest({
      event: "invitation.accepted",
      id: "evt_123",
      data: { id: "inv_123", accepted_user_id: "user_123" },
    })
  );

  expect(response.status).toBe(HTTP_OK);
  expect(await response.json()).toEqual({ ok: true });
  expect(mocks.getWorkosUser).toHaveBeenCalledWith("user_123");
  expect(mocks.resumeHook).toHaveBeenCalledWith(
    getRegistrationInvitationHookToken("inv_123"),
    {
      event: "accepted",
      acceptedIdentity: {
        authUserId: "user_123",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
      },
    }
  );
});
