/* oxlint-disable typescript/no-unsafe-assignment -- Effect Schema branded invitation fields are checked by tsc but appear opaque to the lint analyzer across the bounded-context adapter. */
import {
  CustomerAccountMemberInvitation,
  CustomerAccountMembers,
  InvitationPolicyError as CustomerAccountInvitationPolicyError,
} from "@repo/commerce/services/customer-account-members";
import { Effect, Layer, Redacted, Schema } from "effect";

import { CompanyActor } from "../domain/actors";
import { AuthUserId, Email } from "../domain/identity";
import { CompanyRoles } from "../domain/roles";
import { issueCompanyMemberInvite } from "../programs/company-member-invitations";
import { CompanyInvitationPolicy } from "./company-invitation-policy";
import { CompanyMemberInvitations } from "./invitations";

const toRegistrationCompanyRoles = Schema.decodeUnknownSync(CompanyRoles);

export const customerAccountMembersLayer = Layer.effect(
  CustomerAccountMembers,
  Effect.gen(function* () {
    const invitations = yield* CompanyMemberInvitations;
    const policy = yield* CompanyInvitationPolicy;

    return CustomerAccountMembers.of({
      invite: Effect.fn("CustomerAccountMembers.invite")(function* (input) {
        const invitation = yield* issueCompanyMemberInvite({
          actor: new CompanyActor({
            actorType: "company",
            authUserId: AuthUserId.make(String(input.actor.authUserId)),
            businessUnitId: input.actor.businessUnitId,
            email: Redacted.make(
              Email.make(Redacted.value(input.actor.email)),
              { label: "email" }
            ),
            roles: toRegistrationCompanyRoles(input.actor.roles),
          }),
          inviteeEmail: Redacted.make(
            Email.make(Redacted.value(input.inviteeEmail)),
            { label: "email" }
          ),
          roles: toRegistrationCompanyRoles(input.roles),
        }).pipe(
          Effect.provideService(CompanyMemberInvitations, invitations),
          Effect.provideService(CompanyInvitationPolicy, policy),
          Effect.catchTag("InvitationPolicyError", (error) =>
            Effect.fail(
              new CustomerAccountInvitationPolicyError({
                message: error.message,
              })
            )
          )
        );

        return new CustomerAccountMemberInvitation({
          expiresAt: invitation.expiresAt,
          invitationId: invitation.id,
          inviteeEmail: input.inviteeEmail,
        });
      }),
    });
  })
);
