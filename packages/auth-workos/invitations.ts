import {
  NotFoundException,
  WorkOS,
  type Invitation as WorkosInvitation,
  type SendInvitationOptions as WorkosSendInvitationOptions,
} from "@workos-inc/node";
import { Config, Effect, Layer, Option, Redacted } from "effect";
import { registrationSystemActor } from "../registration-effect/domain/actors";
import {
  AcceptedAuthIdentity,
  AuthUserId,
  Email,
  InvitationId,
  PersonName,
} from "../registration-effect/domain/identity";
import {
  AcceptedInvitation,
  type Invitation,
  PendingInvitation,
  ProviderInvitationIntent,
  RevokedInvitation,
} from "../registration-effect/domain/invitations";
import {
  type AcceptInvitationInput,
  InvitationConflict,
  InvitationNotFound,
  InvitationProviderFailure,
  Invitations,
  type IssueInvitationInput,
  type RevokeInvitationInput,
} from "../registration-effect/services/invitations";

export type {
  Invitation as WorkosInvitation,
  SendInvitationOptions as WorkosSendInvitationOptions,
} from "@workos-inc/node";

type WorkosSdk = Pick<WorkOS, "userManagement">;

export type WorkosInvitationUserManagement = Pick<
  WorkosSdk["userManagement"],
  "sendInvitation" | "getInvitation" | "revokeInvitation"
>;

const toDate = (value: string | null | undefined) =>
  value ? new Date(value) : new Date(0);

const invitationIdFromWorkos = (invitation: WorkosInvitation) =>
  InvitationId.make(invitation.id);

const providerIntentFromWorkos = (invitation: WorkosInvitation) =>
  new ProviderInvitationIntent({
    intent: "provider_managed",
    inviteeEmail: Redacted.make(Email.make(invitation.email), {
      label: "email",
    }),
    role: "provider",
  });

const acceptedIdentityFromWorkos = (
  invitation: WorkosInvitation,
  fallback?: AcceptedAuthIdentity
) =>
  fallback ??
  new AcceptedAuthIdentity({
    authUserId: AuthUserId.make(invitation.acceptedUserId ?? "provider-user"),
    email: Redacted.make(Email.make(invitation.email), { label: "email" }),
    firstName: Redacted.make(PersonName.make("Provider"), {
      label: "personName",
    }),
    lastName: Redacted.make(PersonName.make("Managed"), {
      label: "personName",
    }),
  });

const workosIssueInputFromIntent = (
  input: IssueInvitationInput
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
  input: IssueInvitationInput
) =>
  new PendingInvitation({
    _tag: "PendingInvitation",
    id: invitationIdFromWorkos(invitation),
    intent: input.intent,
    issuedBy: input.issuedBy,
    createdAt: toDate(invitation.createdAt),
    acceptInvitationUrl: invitation.acceptInvitationUrl,
  });

const invitationFromWorkos = (
  invitation: WorkosInvitation,
  acceptedIdentity?: AcceptedAuthIdentity
): Invitation => {
  const base = {
    id: invitationIdFromWorkos(invitation),
    intent: providerIntentFromWorkos(invitation),
    issuedBy: registrationSystemActor,
    createdAt: toDate(invitation.createdAt),
  };

  switch (invitation.state) {
    case "accepted":
      return new AcceptedInvitation({
        _tag: "AcceptedInvitation",
        ...base,
        acceptedBy: acceptedIdentityFromWorkos(invitation, acceptedIdentity),
        acceptedAt: toDate(invitation.acceptedAt),
      });
    case "revoked":
    case "expired":
      return new RevokedInvitation({
        _tag: "RevokedInvitation",
        ...base,
        revokedBy: registrationSystemActor,
        revokedAt: toDate(invitation.revokedAt ?? invitation.expiresAt),
      });
    case "pending":
      return new PendingInvitation({
        _tag: "PendingInvitation",
        ...base,
        acceptInvitationUrl: invitation.acceptInvitationUrl,
      });
    default:
      return new PendingInvitation({
        _tag: "PendingInvitation",
        ...base,
        acceptInvitationUrl: invitation.acceptInvitationUrl,
      });
  }
};

const providerFailure = (
  operation: "issue" | "read" | "accept" | "revoke",
  cause: unknown
) =>
  new InvitationProviderFailure({
    message: `Failed to ${operation} invitation: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    operation,
    cause,
  });

const readFailure = (invitationId: InvitationId, cause: unknown) =>
  cause instanceof NotFoundException
    ? new InvitationNotFound({
        message: `Invitation ${invitationId} was not found`,
        invitationId,
      })
    : providerFailure("read", cause);

const revokeFailure = (invitationId: InvitationId, cause: unknown) =>
  cause instanceof NotFoundException
    ? new InvitationNotFound({
        message: `Invitation ${invitationId} was not found`,
        invitationId,
      })
    : providerFailure("revoke", cause);

export const makeWorkosInvitations = (
  userManagement: WorkosInvitationUserManagement
) => {
  const issue = Effect.fn("Invitations.Workos.issue")(function* (
    input: IssueInvitationInput
  ) {
    const invitation = yield* Effect.tryPromise({
      try: () =>
        userManagement.sendInvitation(workosIssueInputFromIntent(input)),
      catch: (cause) => providerFailure("issue", cause),
    });

    return pendingFromWorkos(invitation, input);
  });

  const get = Effect.fn("Invitations.Workos.get")(
    (invitationId: InvitationId) =>
      Effect.tryPromise({
        try: () => userManagement.getInvitation(invitationId),
        catch: (cause) => readFailure(invitationId, cause),
      }).pipe(Effect.map(invitationFromWorkos))
  );

  const accept = Effect.fn("Invitations.Workos.accept")(function* (
    input: AcceptInvitationInput
  ) {
    const invitation = yield* Effect.tryPromise({
      try: () => userManagement.getInvitation(input.invitationId),
      catch: (cause) => readFailure(input.invitationId, cause),
    });

    if (invitation.state === "revoked" || invitation.state === "expired") {
      return yield* new InvitationConflict({
        message: "Invitation can no longer be accepted by the provider",
      });
    }

    const acceptedAt =
      invitation.state === "accepted"
        ? toDate(invitation.acceptedAt)
        : new Date();

    return new AcceptedInvitation({
      _tag: "AcceptedInvitation",
      id: invitationIdFromWorkos(invitation),
      intent: providerIntentFromWorkos(invitation),
      issuedBy: registrationSystemActor,
      acceptedBy: input.acceptedIdentity,
      createdAt: toDate(invitation.createdAt),
      acceptedAt,
    });
  });

  const revoke = Effect.fn("Invitations.Workos.revoke")(function* (
    input: RevokeInvitationInput
  ) {
    const invitation = yield* Effect.tryPromise({
      try: () => userManagement.revokeInvitation(input.invitationId),
      catch: (cause) => revokeFailure(input.invitationId, cause),
    });
    const revoked = invitationFromWorkos(invitation);

    if (revoked._tag !== "RevokedInvitation") {
      return yield* new InvitationConflict({
        message: "Invitation was not revoked by the provider",
      });
    }

    return new RevokedInvitation({
      _tag: "RevokedInvitation",
      id: revoked.id,
      intent: revoked.intent,
      issuedBy: revoked.issuedBy,
      revokedBy: input.revokedBy,
      createdAt: revoked.createdAt,
      revokedAt: revoked.revokedAt,
    });
  });

  return Invitations.of({
    issue,
    get,
    accept,
    revoke,
  });
};

export const invitationsLayerWorkos = Layer.effect(
  Invitations,
  Effect.gen(function* () {
    const apiKey = yield* Config.redacted("WORKOS_API_KEY");
    const clientId = yield* Config.option(Config.string("WORKOS_CLIENT_ID"));
    const clientIdValue = Option.getOrUndefined(clientId);
    const workos = new WorkOS({
      apiKey: Redacted.value(apiKey),
      ...(clientIdValue ? { clientId: clientIdValue } : {}),
    });

    return makeWorkosInvitations(workos.userManagement);
  })
);
