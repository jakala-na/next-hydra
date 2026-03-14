import { createHmac } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";

const getWorkosUser = vi.fn();
const markRegistrationInvitationRevoked = vi.fn();
const syncRegistrationIdentityFromInvitation = vi.fn();
const warn = vi.fn();

vi.mock("@repo/auth-workos/admin", () => ({
  getWorkosUser,
}));

vi.mock("@repo/commerce/lib/b2b-registration/service", () => ({
  markRegistrationInvitationRevoked,
  syncRegistrationIdentityFromInvitation,
}));

vi.mock("@repo/observability/log", () => ({
  log: {
    warn,
  },
}));

vi.mock("../env", () => ({
  env: {
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
  getWorkosUser.mockReset();
  markRegistrationInvitationRevoked.mockReset();
  syncRegistrationIdentityFromInvitation.mockReset();
  warn.mockReset();
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

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, ignored: true });
  expect(getWorkosUser).not.toHaveBeenCalled();
  expect(markRegistrationInvitationRevoked).not.toHaveBeenCalled();
  expect(syncRegistrationIdentityFromInvitation).not.toHaveBeenCalled();
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

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Invalid WorkOS signature" });
});

test("revoked invitation events mark the registration and succeed", async () => {
  const { POST } = await loadRoute();
  const response = await POST(
    createWebhookRequest({
      event: "invitation.revoked",
      id: "evt_123",
      data: { id: "inv_123" },
    })
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(markRegistrationInvitationRevoked).toHaveBeenCalledWith("inv_123");
});

test("accepted invitation events require an accepted user id", async () => {
  const { POST } = await loadRoute();
  const response = await POST(
    createWebhookRequest({
      event: "invitation.accepted",
      id: "evt_123",
      data: { id: "inv_123" },
    })
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "Invitation accepted event missing accepted user id",
  });
});
