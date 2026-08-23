import type { InvitationId } from "@repo/registration/domain/identity";
import {
  InvitationProviderFailure,
  Invitations,
} from "@repo/registration/services/invitations";
import type {
  AcceptInvitationInput,
  IssueInvitationInput,
  RevokeInvitationInput,
} from "@repo/registration/services/invitations";
import { Effect, Layer } from "effect";

const deferredInvitation = (
  operation: "issue" | "read" | "accept" | "revoke"
) =>
  new InvitationProviderFailure({
    cause: new Error("Clerk onboarding is deferred"),
    message: `Clerk invitation ${operation} is not available in the current auth slice`,
    operation,
  });

export const invitationsLayer = Layer.succeed(
  Invitations,
  Invitations.of({
    accept: Effect.fn("Invitations.Clerk.deferred")(
      (_input: AcceptInvitationInput) =>
        Effect.fail(deferredInvitation("accept"))
    ),
    get: Effect.fn("Invitations.Clerk.deferred")(
      (_invitationId: InvitationId) => Effect.fail(deferredInvitation("read"))
    ),
    issue: Effect.fn("Invitations.Clerk.deferred")(
      (_input: IssueInvitationInput) => Effect.fail(deferredInvitation("issue"))
    ),
    revoke: Effect.fn("Invitations.Clerk.deferred")(
      (_input: RevokeInvitationInput) =>
        Effect.fail(deferredInvitation("revoke"))
    ),
  })
);
