import {
  CommerceBusinessUnitId,
  CompanyMemberInvitationId,
  RegistrationId,
} from "@repo/registration/domain/identity";
import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ClerkInvitationMetadata } from "../../../invitation-metadata";
import type {
  ClerkCompanyMemberInvitationAcceptedInput,
  ClerkRegistrationInvitationEventInput,
  ClerkWebhookAnalytics,
} from "./route";
import { makeClerkWebhookHandler } from "./route";

const eventAnalytics: ClerkWebhookAnalytics = {
  capture: vi.fn<ClerkWebhookAnalytics["capture"]>(),
  groupIdentify: vi.fn<ClerkWebhookAnalytics["groupIdentify"]>(),
  identify: vi.fn<ClerkWebhookAnalytics["identify"]>(),
  shutdown: vi.fn<ClerkWebhookAnalytics["shutdown"]>(async () => {
    await Promise.resolve();
  }),
};

const webhookSecret = "whsec_dGVzdC1zZWNyZXQ=";

type TestPublicMetadata = ClerkInvitationMetadata | Record<string, never>;

const userCreatedEvent = (
  publicMetadata: TestPublicMetadata,
  profile: {
    readonly firstName?: string | null;
    readonly lastName?: string | null;
  } = {}
) => ({
  data: {
    created_at: Date.parse("2026-01-01T00:00:00.000Z"),
    email_addresses: [
      {
        email_address: "invitee@example.com",
        id: "email-primary",
      },
    ],
    first_name: profile.firstName === undefined ? "Invited" : profile.firstName,
    id: "user-1",
    image_url: "https://img.example.com/user-1",
    last_name: profile.lastName === undefined ? "Owner" : profile.lastName,
    phone_numbers: [],
    primary_email_address_id: "email-primary",
    public_metadata: publicMetadata,
  },
  object: "event",
  type: "user.created",
});

type UserCreatedTestEvent = ReturnType<typeof userCreatedEvent>;

const signedRequest = (event: UserCreatedTestEvent) => {
  const body = JSON.stringify(event);
  const messageId = "msg_test";
  const timestamp = new Date();
  const signature = new Webhook(webhookSecret).sign(messageId, timestamp, body);

  return new NextRequest("https://api.example.com/api/webhooks/clerk", {
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": messageId,
      "svix-signature": signature,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    },
    method: "POST",
  });
};

describe(makeClerkWebhookHandler, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("translates signed invited-user creation into registration acceptance", async () => {
    const onRegistrationInvitationEvent = vi.fn<
      (input: ClerkRegistrationInvitationEventInput) => Promise<void>
    >(async () => {
      await Promise.resolve();
    });
    const handler = makeClerkWebhookHandler({
      analytics: eventAnalytics,
      onRegistrationInvitationEvent,
      webhookSecret,
    });
    const request = signedRequest(
      userCreatedEvent({
        invitation: {
          intent: "registration_approval",
          registrationId: RegistrationId.make("registration-1"),
          roles: ["admin", "buyer"],
        },
      })
    );

    const response = await handler(request);

    expect(response.status).toBe(201);
    expect(onRegistrationInvitationEvent).toHaveBeenCalledWith({
      event: {
        acceptedIdentity: {
          authUserId: "user-1",
          email: "invitee@example.com",
          firstName: "Invited",
          lastName: "Owner",
        },
        event: "accepted",
      },
      registrationId: "registration-1",
    });
  });

  it("does not treat ordinary Clerk user creation as invitation acceptance", async () => {
    const onRegistrationInvitationEvent = vi.fn<
      (input: ClerkRegistrationInvitationEventInput) => Promise<void>
    >(async () => {
      await Promise.resolve();
    });
    const handler = makeClerkWebhookHandler({
      analytics: eventAnalytics,
      onRegistrationInvitationEvent,
      webhookSecret,
    });

    const response = await handler(signedRequest(userCreatedEvent({})));

    expect(response.status).toBe(201);
    expect(onRegistrationInvitationEvent).not.toHaveBeenCalled();
  });

  it("translates company-member metadata into acceptance without resuming registration", async () => {
    const onCompanyMemberInvitationAccepted = vi.fn<
      (input: ClerkCompanyMemberInvitationAcceptedInput) => Promise<void>
    >(async () => {
      await Promise.resolve();
    });
    const onRegistrationInvitationEvent = vi.fn<
      (input: ClerkRegistrationInvitationEventInput) => Promise<void>
    >(async () => {
      await Promise.resolve();
    });
    const handler = makeClerkWebhookHandler({
      analytics: eventAnalytics,
      onCompanyMemberInvitationAccepted,
      onRegistrationInvitationEvent,
      webhookSecret,
    });
    const request = signedRequest(
      userCreatedEvent({
        invitation: {
          businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
          companyMemberInvitationId: CompanyMemberInvitationId.make(
            "company-invitation-1"
          ),
          intent: "company_member",
          roles: ["buyer", "approver"],
        },
      })
    );

    const response = await handler(request);

    expect(response.status).toBe(201);
    expect(onRegistrationInvitationEvent).not.toHaveBeenCalled();
    expect(onCompanyMemberInvitationAccepted).toHaveBeenCalledWith({
      acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
      acceptedIdentity: {
        authUserId: "user-1",
        email: "invitee@example.com",
        firstName: "Invited",
        lastName: "Owner",
      },
      companyMemberInvitationId: "company-invitation-1",
    });
  });

  it("accepts a company-member event without provider profile names", async () => {
    const onCompanyMemberInvitationAccepted = vi.fn<
      (input: ClerkCompanyMemberInvitationAcceptedInput) => Promise<void>
    >(async () => {
      await Promise.resolve();
    });
    const handler = makeClerkWebhookHandler({
      analytics: eventAnalytics,
      onCompanyMemberInvitationAccepted,
      webhookSecret,
    });
    const request = signedRequest(
      userCreatedEvent(
        {
          invitation: {
            businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
            companyMemberInvitationId: CompanyMemberInvitationId.make(
              "company-invitation-1"
            ),
            intent: "company_member",
            roles: ["buyer"],
          },
        },
        { firstName: null, lastName: null }
      )
    );

    const response = await handler(request);

    expect(response.status).toBe(201);
    expect(onCompanyMemberInvitationAccepted).toHaveBeenCalledWith({
      acceptedAt: new Date("2026-01-01T00:00:00.000Z"),
      acceptedIdentity: {
        authUserId: "user-1",
        email: "invitee@example.com",
      },
      companyMemberInvitationId: "company-invitation-1",
    });
  });

  it("rejects an invalid signature before invoking the workflow", async () => {
    const onRegistrationInvitationEvent = vi.fn<
      (input: ClerkRegistrationInvitationEventInput) => Promise<void>
    >(async () => {
      await Promise.resolve();
    });
    const handler = makeClerkWebhookHandler({
      analytics: eventAnalytics,
      onRegistrationInvitationEvent,
      webhookSecret,
    });
    const request = signedRequest(userCreatedEvent({}));
    request.headers.set("svix-signature", "v1,invalid");

    const response = await handler(request);

    expect(response.status).toBe(400);
    expect(onRegistrationInvitationEvent).not.toHaveBeenCalled();
  });
});
