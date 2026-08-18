import { createHmac } from "node:crypto";

import { beforeEach, expect, test, vi } from "vitest";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

const mocks = vi.hoisted(() => ({
  getWorkosUser: vi.fn(),
  resumeRegistrationInvitation: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@repo/auth/admin", () => ({
  getWorkosUser: mocks.getWorkosUser,
}));

vi.mock("@repo/auth/keys", () => ({
  keys: () => ({
    WORKOS_API_KEY: "sk_test_123",
  }),
  webhookKeys: () => ({ WORKOS_WEBHOOK_SECRET: "workos-test-secret" }),
}));

vi.mock("@/lib/registration/workflow-runtime", () => ({
  resumeRegistrationInvitation: mocks.resumeRegistrationInvitation,
}));

vi.mock("@repo/observability/log", () => ({
  log: {
    warn: mocks.warn,
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
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "workos-signature": signature ?? signPayload(rawBody),
    },
    method: "POST",
  });
};

beforeEach(() => {
  vi.resetModules();
  mocks.getWorkosUser.mockReset();
  mocks.resumeRegistrationInvitation.mockReset();
  mocks.warn.mockReset();
});

test("unsupported webhook events are ignored", async () => {
  const { POST } = await loadRoute();
  const response = await POST(
    createWebhookRequest({
      data: { id: "ignored" },
      event: "user.created",
      id: "evt_123",
    })
  );

  expect(response.status).toBe(HTTP_OK);
  expect(await response.json()).toEqual({ ignored: true, ok: true });
  expect(mocks.getWorkosUser).not.toHaveBeenCalled();
  expect(mocks.resumeRegistrationInvitation).not.toHaveBeenCalled();
});

test("invalid webhook signatures are rejected", async () => {
  const { POST } = await loadRoute();
  const response = await POST(
    createWebhookRequest(
      {
        data: { id: "inv_123" },
        event: "invitation.revoked",
        id: "evt_123",
      },
      "t=1, v1=invalid"
    )
  );

  expect(response.status).toBe(HTTP_UNAUTHORIZED);
  expect(await response.json()).toEqual({ error: "Invalid WorkOS signature" });
});

test("invalid webhook JSON is rejected before event processing", async () => {
  const rawBody = "{";
  const { POST } = await loadRoute();
  const response = await POST(
    new Request("http://localhost/api/webhooks/workos", {
      body: rawBody,
      headers: {
        "content-type": "application/json",
        "workos-signature": signPayload(rawBody),
      },
      method: "POST",
    })
  );

  expect(response.status).toBe(HTTP_BAD_REQUEST);
  expect(await response.json()).toEqual({
    error: "Invalid WorkOS webhook payload",
  });
  expect(mocks.resumeRegistrationInvitation).not.toHaveBeenCalled();
});

test("revoked invitation events resume the registration workflow", async () => {
  const { POST } = await loadRoute();
  mocks.resumeRegistrationInvitation.mockResolvedValue(undefined);
  const response = await POST(
    createWebhookRequest({
      data: { id: "inv_123" },
      event: "invitation.revoked",
      id: "evt_123",
    })
  );

  expect(response.status).toBe(HTTP_OK);
  expect(await response.json()).toEqual({ ok: true });
  expect(mocks.resumeRegistrationInvitation).toHaveBeenCalledWith({
    event: { event: "revoked" },
    invitationId: "inv_123",
  });
});

test("workflow payload validation defects escape so WorkOS can retry", async () => {
  const failure = new Error("Registration invitation hook payload is invalid");
  mocks.resumeRegistrationInvitation.mockRejectedValue(failure);
  const { POST } = await loadRoute();

  await expect(
    POST(
      createWebhookRequest({
        data: { id: "inv_123" },
        event: "invitation.revoked",
        id: "evt_123",
      })
    )
  ).rejects.toBe(failure);
  expect(mocks.warn).toHaveBeenCalledWith("WorkOS webhook processing failed", {
    error: failure,
  });
});

test("downstream syntax defects are not mistaken for invalid webhook JSON", async () => {
  const failure = new SyntaxError("Workflow callback failed to parse state");
  mocks.resumeRegistrationInvitation.mockRejectedValue(failure);
  const { POST } = await loadRoute();

  await expect(
    POST(
      createWebhookRequest({
        data: { id: "inv_123" },
        event: "invitation.revoked",
        id: "evt_123",
      })
    )
  ).rejects.toBe(failure);
  expect(mocks.warn).toHaveBeenCalledWith("WorkOS webhook processing failed", {
    error: failure,
  });
});

test("accepted invitation events require an accepted user id", async () => {
  const { POST } = await loadRoute();
  const response = await POST(
    createWebhookRequest({
      data: { acceptedUserId: null, id: "inv_123" },
      event: "invitation.accepted",
      id: "evt_123",
    })
  );

  expect(response.status).toBe(HTTP_BAD_REQUEST);
  expect(await response.json()).toEqual({
    error: "Invitation accepted event missing accepted user id",
  });
});

test("accepted invitation events resume the registration workflow", async () => {
  mocks.getWorkosUser.mockResolvedValue({
    email: "ada@example.com",
    firstName: "Ada",
    id: "user_123",
    lastName: "Lovelace",
  });
  mocks.resumeRegistrationInvitation.mockResolvedValue(undefined);
  const { POST } = await loadRoute();
  const response = await POST(
    createWebhookRequest({
      data: { accepted_user_id: "user_123", id: "inv_123" },
      event: "invitation.accepted",
      id: "evt_123",
    })
  );

  expect(response.status).toBe(HTTP_OK);
  expect(await response.json()).toEqual({ ok: true });
  expect(mocks.getWorkosUser).toHaveBeenCalledWith("user_123");
  expect(mocks.resumeRegistrationInvitation).toHaveBeenCalledWith({
    event: {
      acceptedIdentity: {
        authUserId: "user_123",
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
      },
      event: "accepted",
    },
    invitationId: "inv_123",
  });
});
