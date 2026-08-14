import { registrationSystemActor } from "@repo/registration/domain/actors";
import {
  AcceptedAuthIdentity,
  AuthUserId,
  Email,
  InvitationId,
  PersonName,
} from "@repo/registration/domain/identity";
import {
  AcceptedInvitation,
  type Invitation,
  PendingInvitation,
  ProviderInvitationIntent,
  RevokedInvitation,
} from "@repo/registration/domain/invitations";
import {
  type AcceptInvitationInput,
  InvitationConflict,
  InvitationNotFound,
  InvitationProviderFailure,
  Invitations,
  type IssueInvitationInput,
  type RevokeInvitationInput,
} from "@repo/registration/services/invitations";
import {
  NotFoundException,
  WorkOS,
  type Invitation as WorkosInvitation,
  type SendInvitationOptions as WorkosSendInvitationOptions,
} from "@workos-inc/node";
import { Config, Effect, Layer, Option, Redacted } from "effect";

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
    acceptInvitationUrl: invitation.acceptInvitationUrl,
    createdAt: toDate(invitation.createdAt),
    id: invitationIdFromWorkos(invitation),
    intent: input.intent,
    issuedBy: input.issuedBy,
  });

const invitationFromWorkos = (
  invitation: WorkosInvitation,
  acceptedIdentity?: AcceptedAuthIdentity
): Invitation => {
  const base = {
    createdAt: toDate(invitation.createdAt),
    id: invitationIdFromWorkos(invitation),
    intent: providerIntentFromWorkos(invitation),
    issuedBy: registrationSystemActor,
  };

  switch (invitation.state) {
    case "accepted":
      return new AcceptedInvitation({
        _tag: "AcceptedInvitation",
        ...base,
        acceptedAt: toDate(invitation.acceptedAt),
        acceptedBy: acceptedIdentityFromWorkos(invitation, acceptedIdentity),
      });
    case "revoked":
    case "expired":
      return new RevokedInvitation({
        _tag: "RevokedInvitation",
        ...base,
        revokedAt: toDate(invitation.revokedAt ?? invitation.expiresAt),
        revokedBy: registrationSystemActor,
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

export const makeWorkosInvitations = (
  userManagement: WorkosInvitationUserManagement
) => {
  const issue = Effect.fn("Invitations.Workos.issue")(function* (
    input: IssueInvitationInput
  ) {
    const invitation = yield* Effect.tryPromise({
      catch: (cause) => providerFailure("issue", cause),
      try: () =>
        userManagement.sendInvitation(workosIssueInputFromIntent(input)),
    });

    return pendingFromWorkos(invitation, input);
  });

  const get = Effect.fn("Invitations.Workos.get")(
    (invitationId: InvitationId) =>
      Effect.tryPromise({
        catch: (cause) => readFailure(invitationId, cause),
        try: () => userManagement.getInvitation(invitationId),
      }).pipe(Effect.map(invitationFromWorkos))
  );

  const accept = Effect.fn("Invitations.Workos.accept")(function* (
    input: AcceptInvitationInput
  ) {
    const invitation = yield* Effect.tryPromise({
      catch: (cause) => readFailure(input.invitationId, cause),
      try: () => userManagement.getInvitation(input.invitationId),
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
      acceptedAt,
      acceptedBy: input.acceptedIdentity,
      createdAt: toDate(invitation.createdAt),
      id: invitationIdFromWorkos(invitation),
      intent: providerIntentFromWorkos(invitation),
      issuedBy: registrationSystemActor,
    });
  });

  const revoke = Effect.fn("Invitations.Workos.revoke")(function* (
    input: RevokeInvitationInput
  ) {
    const invitation = yield* Effect.tryPromise({
      catch: (cause) => revokeFailure(input.invitationId, cause),
      try: () => userManagement.revokeInvitation(input.invitationId),
    });
    const revoked = invitationFromWorkos(invitation);

    if (revoked._tag !== "RevokedInvitation") {
      return yield* new InvitationConflict({
        message: "Invitation was not revoked by the provider",
      });
    }

    return new RevokedInvitation({
      _tag: "RevokedInvitation",
      createdAt: revoked.createdAt,
      id: revoked.id,
      intent: revoked.intent,
      issuedBy: revoked.issuedBy,
      revokedAt: revoked.revokedAt,
      revokedBy: input.revokedBy,
    });
  });

  return Invitations.of({
    accept,
    get,
    issue,
    revoke,
  });
};

export const invitationsLayer = Layer.effect(
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
