/* oxlint-disable anti-slop/no-module-mocking, vitest/prefer-import-in-mock -- The route boundary replaces the large WorkOS SDK class with its exact verifier seam; a string mock is necessary because the intentionally narrow verifier is not structurally equivalent to the full SDK class. */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkosWebhookHandlerOptions } from "./webhook";
import { makeWorkosWebhookHandler } from "./webhook";

type VerifiedInvitationEvent =
  | {
      readonly data: {
        readonly acceptedAt: string;
        readonly acceptedUserId: string;
        readonly id: string;
      };
      readonly event: "invitation.accepted";
    }
  | {
      readonly data: {
        readonly id: string;
        readonly revokedAt: string;
      };
      readonly event: "invitation.revoked";
    };

const workos = vi.hoisted(() => ({
  constructEvent: vi.fn<() => Promise<VerifiedInvitationEvent>>(),
  getUser: vi.fn<
    () => Promise<{
      readonly email: string;
      readonly firstName?: string;
      readonly id: string;
      readonly lastName?: string;
    }>
  >(),
}));

vi.mock("@workos-inc/node", () => ({
  WorkOS: class {
    readonly webhooks = { constructEvent: workos.constructEvent };
  },
}));

vi.mock(import("../admin"), () => ({
  getWorkosUser: workos.getUser,
}));

vi.mock("@repo/observability/log", () => ({
  log: { warn: vi.fn<() => void>() },
}));

const request = () =>
  new Request("https://api.example.test/api/webhooks/workos", {
    body: JSON.stringify({ event: "signed-provider-payload" }),
    headers: {
      "content-type": "application/json",
      "workos-signature": "signed",
    },
    method: "POST",
  });

describe("WorkOS invitation webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
      "https://web.example.test/callback"
    );
    vi.stubEnv("WORKOS_API_KEY", "sk_test_customer");
    vi.stubEnv("WORKOS_CLIENT_ID", "client_test_customer");
    vi.stubEnv(
      "WORKOS_COOKIE_PASSWORD",
      "test-cookie-password-with-at-least-32-characters"
    );
    vi.stubEnv("WORKOS_WEBHOOK_SECRET", "whsec_test_customer");
  });

  it("carries provider acceptance time and identity to the domain dispatcher", async () => {
    workos.constructEvent.mockResolvedValue({
      data: {
        acceptedAt: "2026-08-25T12:30:00.000Z",
        acceptedUserId: "auth-member-1",
        id: "provider-invitation-1",
      },
      event: "invitation.accepted",
    });
    workos.getUser.mockResolvedValue({
      email: "member@example.com",
      firstName: "Invited",
      id: "auth-member-1",
      lastName: "Member",
    });
    const onInvitationEvent = vi.fn<
      WorkosWebhookHandlerOptions["onInvitationEvent"]
    >(async () => {
      await Promise.resolve();
    });

    const response = await makeWorkosWebhookHandler({ onInvitationEvent })(
      request()
    );

    expect(response.status).toBe(200);
    expect(onInvitationEvent).toHaveBeenCalledWith({
      event: {
        acceptedAt: new Date("2026-08-25T12:30:00.000Z"),
        acceptedIdentity: {
          authUserId: "auth-member-1",
          email: "member@example.com",
          firstName: "Invited",
          lastName: "Member",
        },
        event: "accepted",
      },
      invitationId: "provider-invitation-1",
    });
  });

  it("dispatches accepted identity when provider profile names are absent", async () => {
    workos.constructEvent.mockResolvedValue({
      data: {
        acceptedAt: "2026-08-25T12:30:00.000Z",
        acceptedUserId: "auth-member-1",
        id: "provider-invitation-1",
      },
      event: "invitation.accepted",
    });
    workos.getUser.mockResolvedValue({
      email: "member@example.com",
      id: "auth-member-1",
    });
    const onInvitationEvent = vi.fn<
      WorkosWebhookHandlerOptions["onInvitationEvent"]
    >(async () => {
      await Promise.resolve();
    });

    const response = await makeWorkosWebhookHandler({ onInvitationEvent })(
      request()
    );

    expect(response.status).toBe(200);
    expect(onInvitationEvent).toHaveBeenCalledWith({
      event: {
        acceptedAt: new Date("2026-08-25T12:30:00.000Z"),
        acceptedIdentity: {
          authUserId: "auth-member-1",
          email: "member@example.com",
        },
        event: "accepted",
      },
      invitationId: "provider-invitation-1",
    });
  });

  it("carries provider revocation time to the domain dispatcher", async () => {
    workos.constructEvent.mockResolvedValue({
      data: {
        id: "provider-invitation-1",
        revokedAt: "2026-08-25T13:00:00.000Z",
      },
      event: "invitation.revoked",
    });
    const onInvitationEvent = vi.fn<
      WorkosWebhookHandlerOptions["onInvitationEvent"]
    >(async () => {
      await Promise.resolve();
    });

    const response = await makeWorkosWebhookHandler({ onInvitationEvent })(
      request()
    );

    expect(response.status).toBe(200);
    expect(onInvitationEvent).toHaveBeenCalledWith({
      event: {
        event: "revoked",
        revokedAt: new Date("2026-08-25T13:00:00.000Z"),
      },
      invitationId: "provider-invitation-1",
    });
  });
});
