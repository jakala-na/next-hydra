import type { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { Effect, Option } from "effect";

import type { InvitationId } from "../domain/identity";
import type { InvitationLifecycleEvent } from "../domain/invitations";
import type { CompanyMemberIdentityProjection } from "../services/company-member-identity-projection";
import { CompanyMemberInvitationRecords } from "../services/company-member-invitation-records";
import type { RegistrationQueries } from "../services/registration-queries";
import type { RegistrationWorkflow } from "../services/registration-workflow";
import type { Registrations } from "../services/registrations";
import { acceptCompanyMemberInvitation } from "./company-member-onboarding";
import { resumeRegistrationInvitationForInvitation } from "./registration-invitation-events";

export interface DispatchInvitationLifecycleEventInput {
  readonly event: InvitationLifecycleEvent;
  readonly invitationId: InvitationId;
}

type AcceptedIdentityEvidence = Extract<
  InvitationLifecycleEvent,
  { readonly event: "accepted" }
>["acceptedIdentity"];

const compactAcceptedIdentity = (identity: AcceptedIdentityEvidence) => {
  const required = {
    authUserId: identity.authUserId,
    email: identity.email,
  };

  if (identity.firstName !== undefined && identity.lastName !== undefined) {
    return {
      ...required,
      firstName: identity.firstName,
      lastName: identity.lastName,
    };
  }
  if (identity.firstName !== undefined) {
    return { ...required, firstName: identity.firstName };
  }
  if (identity.lastName !== undefined) {
    return { ...required, lastName: identity.lastName };
  }
  return required;
};

export const dispatchInvitationLifecycleEvent = Effect.fn(
  "dispatchInvitationLifecycleEvent"
)(function* (input: DispatchInvitationLifecycleEventInput) {
  const records = yield* CompanyMemberInvitationRecords;
  const companyMemberInvitation = yield* records
    .getByProviderInvitationId(input.invitationId)
    .pipe(
      Effect.map(Option.some),
      Effect.catchTag("CompanyMemberInvitationNotFound", () =>
        Effect.succeed(Option.none())
      )
    );

  if (Option.isNone(companyMemberInvitation)) {
    return yield* resumeRegistrationInvitationForInvitation({
      event:
        input.event.event === "revoked"
          ? { event: "revoked" }
          : {
              acceptedIdentity: input.event.acceptedIdentity,
              event: "accepted",
            },
      invitationId: input.invitationId,
    });
  }

  const invitation = companyMemberInvitation.value;
  if (input.event.event === "revoked") {
    return yield* records.markRevoked({
      companyMemberInvitationId: invitation.intent.companyMemberInvitationId,
      revokedAt: input.event.revokedAt,
    });
  }

  return yield* acceptCompanyMemberInvitation({
    acceptedAt: input.event.acceptedAt,
    acceptedIdentity: compactAcceptedIdentity(input.event.acceptedIdentity),
    reference: {
      companyMemberInvitationId: invitation.intent.companyMemberInvitationId,
      referenceType: "company_member_invitation",
    },
  });
});

export type InvitationLifecycleEventRequirements =
  | CommerceAccounts
  | CompanyMemberIdentityProjection
  | CompanyMemberInvitationRecords
  | RegistrationQueries
  | RegistrationWorkflow
  | Registrations;
