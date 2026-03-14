import { beforeEach, expect, test, vi } from "vitest";

const getRegistrationRecord = vi.fn();
const resumeHook = vi.fn();

vi.mock("@repo/commerce/lib/b2b-registration/service", () => ({
  getRegistrationRecord,
}));

vi.mock("workflow/api", () => ({
  resumeHook,
}));

vi.mock("../env", () => ({
  env: {
    REGISTRATION_APPROVAL_SECRET: "test-approval-secret",
  },
}));

const loadRoute = async () => import("../app/api/registration-approvals/route");

beforeEach(() => {
  vi.resetModules();
  getRegistrationRecord.mockReset();
  resumeHook.mockReset();
});

test("approved registration with invitation id is idempotent", async () => {
  getRegistrationRecord.mockResolvedValue({
    registrationId: crypto.randomUUID(),
    status: "approved",
    invitationId: "inv_123",
  });

  const { POST } = await loadRoute();
  const response = await POST(
    new Request("http://localhost/api/registration-approvals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-registration-approval-secret": "test-approval-secret",
      },
      body: JSON.stringify({
        registrationId: crypto.randomUUID(),
        decision: "approved",
      }),
    })
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "approved",
    idempotent: true,
  });
  expect(resumeHook).not.toHaveBeenCalled();
});

test("approved registration without invitation id returns a conflict", async () => {
  const registrationId = crypto.randomUUID();
  getRegistrationRecord.mockResolvedValue({
    registrationId,
    status: "approved",
  });

  const { POST } = await loadRoute();
  const response = await POST(
    new Request("http://localhost/api/registration-approvals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-registration-approval-secret": "test-approval-secret",
      },
      body: JSON.stringify({
        registrationId,
        decision: "approved",
      }),
    })
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: `Approved registration ${registrationId} is missing invitationId`,
  });
  expect(resumeHook).not.toHaveBeenCalled();
});

test("rejected registration remains idempotent", async () => {
  getRegistrationRecord.mockResolvedValue({
    registrationId: crypto.randomUUID(),
    status: "rejected",
  });

  const { POST } = await loadRoute();
  const response = await POST(
    new Request("http://localhost/api/registration-approvals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-registration-approval-secret": "test-approval-secret",
      },
      body: JSON.stringify({
        registrationId: crypto.randomUUID(),
        decision: "approved",
      }),
    })
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "rejected",
    idempotent: true,
  });
  expect(resumeHook).not.toHaveBeenCalled();
});
