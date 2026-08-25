import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { analytics as posthogAnalytics } from "@repo/analytics/posthog/server";
import { log } from "@repo/observability/log";
import {
  AuthUserId,
  Email,
  PersonName,
} from "@repo/registration/domain/identity";
import type { RegistrationId } from "@repo/registration/domain/identity";
import type { RegistrationInvitationEvent } from "@repo/registration/services/registration-workflow";
import { Option, Schema } from "effect";
import type { NextRequest } from "next/server";

import { ClerkInvitationMetadata } from "../../../invitation-metadata";
import { webhookKeys } from "../../../keys";

const ClerkWebhookEmailAddress = Schema.Struct({
  email_address: Schema.String,
  id: Schema.String,
});

const ClerkWebhookPhoneNumber = Schema.Struct({
  phone_number: Schema.String,
});

const ClerkWebhookUser = Schema.Struct({
  created_at: Schema.Finite,
  email_addresses: Schema.Array(ClerkWebhookEmailAddress),
  first_name: Schema.NullOr(Schema.String),
  id: Schema.String,
  image_url: Schema.String,
  last_name: Schema.NullOr(Schema.String),
  phone_numbers: Schema.Array(ClerkWebhookPhoneNumber),
  primary_email_address_id: Schema.NullOr(Schema.String),
  public_metadata: Schema.Record(Schema.String, Schema.Unknown),
});

const ClerkWebhookDeletedObject = Schema.Struct({
  id: Schema.optional(Schema.NullOr(Schema.String)),
});

const ClerkWebhookOrganization = Schema.Struct({
  created_by: Schema.optional(Schema.String),
  id: Schema.String,
  image_url: Schema.optional(Schema.String),
  name: Schema.String,
});

const ClerkWebhookOrganizationMembership = Schema.Struct({
  organization: Schema.Struct({ id: Schema.String }),
  public_user_data: Schema.Struct({ user_id: Schema.String }),
});

const ClerkWebhookEvent = Schema.Struct({
  data: Schema.Unknown,
  type: Schema.String,
});
type ClerkWebhookEvent = typeof ClerkWebhookEvent.Type;

type ClerkWebhookUser = typeof ClerkWebhookUser.Type;
type AcceptedRegistrationEvent = Extract<
  RegistrationInvitationEvent,
  { readonly event: "accepted" }
>;

export interface ClerkRegistrationInvitationEventInput {
  readonly event: RegistrationInvitationEvent;
  readonly registrationId: RegistrationId;
}

export interface ClerkWebhookAnalytics {
  readonly capture: typeof posthogAnalytics.capture;
  readonly groupIdentify: typeof posthogAnalytics.groupIdentify;
  readonly identify: typeof posthogAnalytics.identify;
  readonly shutdown: typeof posthogAnalytics.shutdown;
}

export interface ClerkWebhookHandlerOptions {
  readonly analytics?: ClerkWebhookAnalytics;
  readonly onRegistrationInvitationEvent?: (
    input: ClerkRegistrationInvitationEventInput
  ) => Promise<void>;
  readonly webhookSecret?: string;
}

const handleUserCreated = (
  data: ClerkWebhookUser,
  eventAnalytics: ClerkWebhookAnalytics
) => {
  eventAnalytics.identify({
    distinctId: data.id,
    properties: {
      avatar: data.image_url,
      createdAt: new Date(data.created_at),
      email: data.email_addresses.at(0)?.email_address,
      firstName: data.first_name,
      lastName: data.last_name,
      phoneNumber: data.phone_numbers.at(0)?.phone_number,
    },
  });
  eventAnalytics.capture({ distinctId: data.id, event: "User Created" });
};

const handleUserUpdated = (
  data: ClerkWebhookUser,
  eventAnalytics: ClerkWebhookAnalytics
) => {
  eventAnalytics.identify({
    distinctId: data.id,
    properties: {
      avatar: data.image_url,
      createdAt: new Date(data.created_at),
      email: data.email_addresses.at(0)?.email_address,
      firstName: data.first_name,
      lastName: data.last_name,
      phoneNumber: data.phone_numbers.at(0)?.phone_number,
    },
  });
  eventAnalytics.capture({ distinctId: data.id, event: "User Updated" });
};

const primaryEmail = (user: ClerkWebhookUser) =>
  user.email_addresses.find(
    (candidate) => candidate.id === user.primary_email_address_id
  )?.email_address ?? user.email_addresses.at(0)?.email_address;

const acceptedIdentityFromUser = (
  user: ClerkWebhookUser,
  email: string
): AcceptedRegistrationEvent["acceptedIdentity"] => {
  const authUserId = AuthUserId.make(user.id);
  const domainEmail = Email.make(email);

  if (user.first_name !== null && user.last_name !== null) {
    return {
      authUserId,
      email: domainEmail,
      firstName: PersonName.make(user.first_name),
      lastName: PersonName.make(user.last_name),
    };
  }
  if (user.first_name !== null) {
    return {
      authUserId,
      email: domainEmail,
      firstName: PersonName.make(user.first_name),
    };
  }
  if (user.last_name !== null) {
    return {
      authUserId,
      email: domainEmail,
      lastName: PersonName.make(user.last_name),
    };
  }

  return { authUserId, email: domainEmail };
};

export const registrationInvitationEventFromUser = (
  user: ClerkWebhookUser
): ClerkRegistrationInvitationEventInput | undefined => {
  const metadata = Option.getOrUndefined(
    Schema.decodeUnknownOption(ClerkInvitationMetadata)(user.public_metadata)
  );
  const invitation = metadata?.invitation;

  if (invitation?.intent !== "registration_approval") {
    return undefined;
  }

  const email = primaryEmail(user);
  if (email === undefined) {
    throw new Error(
      `Clerk user ${user.id} accepted a registration invitation without an email address`
    );
  }

  return {
    event: {
      acceptedIdentity: acceptedIdentityFromUser(user, email),
      event: "accepted",
    },
    registrationId: invitation.registrationId,
  };
};

const handleEvent = async (
  event: ClerkWebhookEvent,
  options: ClerkWebhookHandlerOptions,
  eventAnalytics: ClerkWebhookAnalytics
) => {
  switch (event.type) {
    case "user.created": {
      const user = Schema.decodeUnknownSync(ClerkWebhookUser)(event.data);
      handleUserCreated(user, eventAnalytics);
      const registrationInvitation = registrationInvitationEventFromUser(user);
      if (registrationInvitation && options.onRegistrationInvitationEvent) {
        await options.onRegistrationInvitationEvent(registrationInvitation);
      }
      break;
    }
    case "user.updated": {
      handleUserUpdated(
        Schema.decodeUnknownSync(ClerkWebhookUser)(event.data),
        eventAnalytics
      );
      break;
    }
    case "user.deleted": {
      const data = Schema.decodeUnknownSync(ClerkWebhookDeletedObject)(
        event.data
      );
      if (data.id) {
        eventAnalytics.identify({
          distinctId: data.id,
          properties: { deleted: new Date() },
        });
        eventAnalytics.capture({
          distinctId: data.id,
          event: "User Deleted",
        });
      }
      break;
    }
    case "organization.created":
    case "organization.updated": {
      const data = Schema.decodeUnknownSync(ClerkWebhookOrganization)(
        event.data
      );
      if (data.created_by !== undefined) {
        eventAnalytics.groupIdentify({
          distinctId: data.created_by,
          groupKey: data.id,
          groupType: "company",
          properties: { avatar: data.image_url, name: data.name },
        });
        eventAnalytics.capture({
          distinctId: data.created_by,
          event:
            event.type === "organization.created"
              ? "Organization Created"
              : "Organization Updated",
        });
      }
      break;
    }
    case "organizationMembership.created":
    case "organizationMembership.deleted": {
      const data = Schema.decodeUnknownSync(ClerkWebhookOrganizationMembership)(
        event.data
      );
      if (event.type === "organizationMembership.created") {
        eventAnalytics.groupIdentify({
          distinctId: data.public_user_data.user_id,
          groupKey: data.organization.id,
          groupType: "company",
        });
      }
      eventAnalytics.capture({
        distinctId: data.public_user_data.user_id,
        event:
          event.type === "organizationMembership.created"
            ? "Organization Member Created"
            : "Organization Member Deleted",
      });
      break;
    }
    default: {
      break;
    }
  }
};

const resolveAnalytics = async (
  configuredAnalytics: ClerkWebhookAnalytics | undefined
) => {
  if (configuredAnalytics) {
    return configuredAnalytics;
  }

  const analyticsModule = await import("@repo/analytics/posthog/server");
  return analyticsModule.analytics;
};

export const makeClerkWebhookHandler =
  (options: ClerkWebhookHandlerOptions = {}) =>
  async (request: NextRequest): Promise<Response> => {
    const webhookSecret =
      options.webhookSecret ?? webhookKeys().CLERK_WEBHOOK_SECRET;

    let event: ClerkWebhookEvent;

    try {
      const verified = await verifyWebhook(request, {
        signingSecret: webhookSecret,
      });
      event = Schema.decodeSync(ClerkWebhookEvent)(verified);
    } catch (error) {
      log.error("Error verifying Clerk webhook", { error });
      return new Response("Invalid Clerk webhook", { status: 400 });
    }

    log.info("Clerk webhook", { eventType: event.type });

    const eventAnalytics = await resolveAnalytics(options.analytics);
    await handleEvent(event, options, eventAnalytics);
    await eventAnalytics.shutdown();

    return new Response("", { status: 201 });
  };

export const POST = makeClerkWebhookHandler();
