import { Email, InvitationId } from "@repo/registration/domain/identity";
import {
  AcceptedInvitation,
  InvitationDelivery,
  PendingInvitation,
  RevokedInvitation,
} from "@repo/registration/domain/invitations";
import {
  CompanyMemberInvitations,
  InvitationConflict,
  InvitationDeliveries,
  InvitationNotFound,
  InvitationProviderFailure,
  RegistrationInvitationRevocationEvents,
  RegistrationInvitations,
} from "@repo/registration/services/invitations";
import type {
  CompanyMemberInvitationIssueInput,
  RegistrationInvitationAcceptanceInput,
  RegistrationInvitationIssueInput,
  RegistrationInvitationRevocationInput,
} from "@repo/registration/services/invitations";
import { NotFoundException, WorkOS } from "@workos-inc/node";
import type {
  Invitation as WorkosInvitation,
  SendInvitationOptions as WorkosSendInvitationOptions,
} from "@workos-inc/node";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

export type {
  Invitation as WorkosInvitation,
  SendInvitationOptions as WorkosSendInvitationOptions,
} from "@workos-inc/node";

type WorkosSdk = Pick<WorkOS, "userManagement">;
type WorkosInvitationIssueInput =
  | RegistrationInvitationIssueInput
  | CompanyMemberInvitationIssueInput;

export type WorkosInvitationUserManagement = Pick<
  WorkosSdk["userManagement"],
  "sendInvitation" | "getInvitation" | "revokeInvitation"
>;

const toDate = (value: string | null | undefined) =>
  value ? new Date(value) : new Date(0);

const invitationIdFromWorkos = (invitation: WorkosInvitation) =>
  InvitationId.make(invitation.id);

const workosIssueInputFromIntent = (
  input: WorkosInvitationIssueInput
): WorkosSendInvitationOptions => {
  const inviterUserId =
    "authUserId" in input.issuedBy ? input.issuedBy.authUserId : undefined;

  return {
    email: Redacted.value(input.intent.inviteeEmail),
    roleSlug: input.intent.role,
    ...(inviterUserId ? { inviterUserId } : {}),
  };
};

const pendingFromWorkos = (
  invitation: WorkosInvitation,
  input: WorkosInvitationIssueInput
) =>
  new PendingInvitation({
    _tag: "PendingInvitation",
    acceptInvitationUrl: invitation.acceptInvitationUrl,
    createdAt: toDate(invitation.createdAt),
    id: invitationIdFromWorkos(invitation),
    intent: input.intent,
    issuedBy: input.issuedBy,
  });

const deliveryFromWorkos = (invitation: WorkosInvitation) =>
  new InvitationDelivery({
    ...(invitation.acceptInvitationUrl
      ? { acceptInvitationUrl: invitation.acceptInvitationUrl }
      : {}),
    createdAt: toDate(invitation.createdAt),
    ...(invitation.expiresAt
      ? { expiresAt: toDate(invitation.expiresAt) }
      : {}),
    id: invitationIdFromWorkos(invitation),
    inviteeEmail: Redacted.make(Email.make(invitation.email), {
      label: "email",
    }),
    status: invitation.state,
    updatedAt: toDate(invitation.updatedAt),
  });

const providerFailure = (
  operation: "issue" | "read" | "accept" | "revoke",
  cause: unknown
) =>
  new InvitationProviderFailure({
    cause,
    message: `Failed to ${operation} invitation: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    operation,
  });

const readFailure = (invitationId: InvitationId, cause: unknown) =>
  cause instanceof NotFoundException
    ? new InvitationNotFound({
        invitationId,
        message: `Invitation ${invitationId} was not found`,
      })
    : providerFailure("read", cause);

const revokeFailure = (invitationId: InvitationId, cause: unknown) =>
  cause instanceof NotFoundException
    ? new InvitationNotFound({
        invitationId,
        message: `Invitation ${invitationId} was not found`,
      })
    : providerFailure("revoke", cause);

const normalizedEmail = (email: string) => email.trim().toLowerCase();

export const makeWorkosInvitationCapabilities = (
  userManagement: WorkosInvitationUserManagement
) => {
  const issue = Effect.fn("InvitationCapabilities.Workos.issue")(function* (
    input: WorkosInvitationIssueInput
  ) {
    const invitation = yield* Effect.tryPromise({
      catch: (cause) => providerFailure("issue", cause),
      try: async () =>
        await userManagement.sendInvitation(workosIssueInputFromIntent(input)),
    });

    return pendingFromWorkos(invitation, input);
  });

  const get = Effect.fn("InvitationDeliveries.Workos.get")(
    (invitationId: InvitationId) =>
      Effect.tryPromise({
        catch: (cause) => readFailure(invitationId, cause),
        try: async () => await userManagement.getInvitation(invitationId),
      }).pipe(Effect.map(deliveryFromWorkos))
  );

  const accept = Effect.fn("RegistrationInvitations.Workos.accept")(function* (
    input: RegistrationInvitationAcceptanceInput
  ) {
    const invitation = yield* Effect.tryPromise({
      catch: (cause) => readFailure(input.invitationId, cause),
      try: async () => await userManagement.getInvitation(input.invitationId),
    });

    if (invitation.state === "revoked" || invitation.state === "expired") {
      return yield* new InvitationConflict({
        message: "Invitation can no longer be accepted by the provider",
      });
    }

    const inviteeEmail = Redacted.value(input.intent.inviteeEmail);
    const acceptedEmail = Redacted.value(input.acceptedIdentity.email);
    if (
      normalizedEmail(invitation.email) !== normalizedEmail(inviteeEmail) ||
      normalizedEmail(acceptedEmail) !== normalizedEmail(inviteeEmail) ||
      (invitation.acceptedUserId !== null &&
        invitation.acceptedUserId !== input.acceptedIdentity.authUserId)
    ) {
      return yield* new InvitationConflict({
        message: "Invitation was accepted by a different identity",
      });
    }

    const acceptedAt =
      invitation.state === "accepted"
        ? toDate(invitation.acceptedAt)
        : new Date();

    return new AcceptedInvitation({
      _tag: "AcceptedInvitation",
      acceptedAt,
      acceptedBy: input.acceptedIdentity,
      createdAt: toDate(invitation.createdAt),
      id: invitationIdFromWorkos(invitation),
      intent: input.intent,
      issuedBy: input.issuedBy,
    });
  });

  const revoke = Effect.fn("RegistrationInvitations.Workos.revoke")(function* (
    input: RegistrationInvitationRevocationInput
  ) {
    const invitation = yield* Effect.tryPromise({
      catch: (cause) => revokeFailure(input.invitationId, cause),
      try: async () =>
        await userManagement.revokeInvitation(input.invitationId),
    });
    if (invitation.state !== "revoked") {
      return yield* new InvitationConflict({
        message: "Invitation was not revoked by the provider",
      });
    }

    return new RevokedInvitation({
      _tag: "RevokedInvitation",
      createdAt: toDate(invitation.createdAt),
      id: invitationIdFromWorkos(invitation),
      intent: input.intent,
      issuedBy: input.issuedBy,
      revokedAt: toDate(invitation.revokedAt),
      revokedBy: input.revokedBy,
    });
  });

  return {
    companyMemberInvitations: CompanyMemberInvitations.of({ issue }),
    invitationDeliveries: InvitationDeliveries.of({ get }),
    registrationInvitationRevocationEvents:
      RegistrationInvitationRevocationEvents.of({
        source: "provider_webhook",
      }),
    registrationInvitations: RegistrationInvitations.of({
      accept,
      issue,
      revoke,
    }),
  };
};

export const invitationsLayer = Layer.effectContext(
  Effect.gen(function* () {
    const apiKey = yield* Config.redacted("WORKOS_API_KEY");
    const clientId = yield* Config.option(Config.string("WORKOS_CLIENT_ID"));
    const clientIdValue = Option.getOrUndefined(clientId);
    const workos = new WorkOS({
      apiKey: Redacted.value(apiKey),
      ...(clientIdValue ? { clientId: clientIdValue } : {}),
    });

    const capabilities = makeWorkosInvitationCapabilities(
      workos.userManagement
    );

    return Context.make(
      RegistrationInvitations,
      capabilities.registrationInvitations
    ).pipe(
      Context.add(
        CompanyMemberInvitations,
        capabilities.companyMemberInvitations
      ),
      Context.add(InvitationDeliveries, capabilities.invitationDeliveries),
      Context.add(
        RegistrationInvitationRevocationEvents,
        capabilities.registrationInvitationRevocationEvents
      )
    );
  })
);
