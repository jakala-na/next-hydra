/* oxlint-disable typescript/no-unsafe-assignment -- Effect Schema branded invitation fields are checked by tsc but appear opaque to the lint analyzer across the bounded-context adapter. */
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import {
  CustomerAccountCompanyMemberInvitationId,
  CustomerAccountInvitationId,
  CustomerAccountInvitationListItem,
  CustomerAccountMemberInvitation,
  CustomerAccountMembers,
  InvitationPolicyError as CustomerAccountInvitationPolicyError,
} from "@repo/commerce/services/customer-account-members";
import type { CustomerAccountCompanyActor } from "@repo/commerce/services/customer-account-members";
import { Effect, Layer, Redacted, Schema } from "effect";

import { CompanyActor } from "../domain/actors";
import {
  AuthUserId,
  CompanyMemberInvitationId,
  Email,
  PersonName,
} from "../domain/identity";
import type { CompanyMemberInvitation } from "../domain/invitations";
import { CompanyRoles } from "../domain/roles";
import {
  issueCompanyMemberInvite,
  listCurrentCompanyMemberInvitations,
  reissueCompanyMemberInvite,
  revokeCompanyMemberInvite,
} from "../programs/company-member-invitations";
import { CompanyInvitationPolicy } from "./company-invitation-policy";
import { CompanyMemberInvitationRecords } from "./company-member-invitation-records";
import { CompanyMemberInvitations, InvitationDeliveries } from "./invitations";

const toRegistrationCompanyRoles = Schema.decodeUnknownSync(CompanyRoles);

const toCompanyActor = (actor: CustomerAccountCompanyActor) =>
  new CompanyActor({
    actorType: "company",
    authUserId: AuthUserId.make(String(actor.authUserId)),
    businessUnitId: actor.businessUnitId,
    email: Redacted.make(Email.make(Redacted.value(actor.email)), {
      label: "email",
    }),
    roles: toRegistrationCompanyRoles(actor.roles),
  });

const policyFailure = (error: { readonly message: string }) =>
  new CustomerAccountInvitationPolicyError({ message: error.message });

const invitationReceipt = (
  invitation: {
    readonly expiresAt: Date;
    readonly id: string;
  },
  inviteeEmail: Redacted.Redacted
) =>
  new CustomerAccountMemberInvitation({
    expiresAt: invitation.expiresAt,
    invitationId: CustomerAccountInvitationId.make(invitation.id),
    inviteeEmail,
  });

const invitationStatus = (invitation: CompanyMemberInvitation) => {
  switch (invitation._tag) {
    case "PendingInvitation": {
      return "pending" as const;
    }
    case "AcceptedInvitation": {
      return "accepted" as const;
    }
    case "ExpiredInvitation": {
      return "expired" as const;
    }
    case "RevokedInvitation": {
      return "revoked" as const;
    }
    default: {
      return invitation satisfies never;
    }
  }
};
const invitationListItem = (invitation: CompanyMemberInvitation) => {
  const item = {
    companyMemberInvitationId: CustomerAccountCompanyMemberInvitationId.make(
      invitation.intent.companyMemberInvitationId
    ),
    expiresAt: invitation.expiresAt,
    firstName: invitation.intent.inviteeName.firstName,
    inviteeEmail: invitation.intent.inviteeEmail,
    lastName: invitation.intent.inviteeName.lastName,
    roles: invitation.intent.roles,
    status: invitationStatus(invitation),
  };

  return new CustomerAccountInvitationListItem(
    invitation._tag === "AcceptedInvitation"
      ? {
          ...item,
          acceptedAuthUserId: AuthUserId.make(invitation.acceptedBy.authUserId),
        }
      : item
  );
};

export const customerAccountMembersLayer = Layer.effect(
  CustomerAccountMembers,
  Effect.gen(function* () {
    const commerceAccounts = yield* CommerceAccounts;
    const deliveries = yield* InvitationDeliveries;
    const invitations = yield* CompanyMemberInvitations;
    const policy = yield* CompanyInvitationPolicy;
    const records = yield* CompanyMemberInvitationRecords;

    const provideInvitationServices = <A, E, R>(
      effect: Effect.Effect<A, E, R>
    ) =>
      effect.pipe(
        Effect.provideService(CompanyMemberInvitations, invitations),
        Effect.provideService(InvitationDeliveries, deliveries),
        Effect.provideService(CompanyMemberInvitationRecords, records),
        Effect.provideService(CompanyInvitationPolicy, policy),
        Effect.provideService(CommerceAccounts, commerceAccounts)
      );

    return CustomerAccountMembers.of({
      cancelInvitation: Effect.fn("CustomerAccountMembers.cancelInvitation")(
        function* (input) {
          yield* provideInvitationServices(
            revokeCompanyMemberInvite({
              actor: toCompanyActor(input.actor),
              companyMemberInvitationId: CompanyMemberInvitationId.make(
                String(input.companyMemberInvitationId)
              ),
            })
          ).pipe(
            Effect.catchTag("InvitationPolicyError", (error) =>
              Effect.fail(policyFailure(error))
            )
          );
        }
      ),
      invite: Effect.fn("CustomerAccountMembers.invite")(function* (input) {
        const invitation = yield* provideInvitationServices(
          issueCompanyMemberInvite({
            actor: toCompanyActor(input.actor),
            inviteeEmail: Redacted.make(
              Email.make(Redacted.value(input.inviteeEmail)),
              { label: "email" }
            ),
            inviteeName: {
              firstName: Redacted.make(
                PersonName.make(Redacted.value(input.inviteeName.firstName)),
                { label: "personName" }
              ),
              lastName: Redacted.make(
                PersonName.make(Redacted.value(input.inviteeName.lastName)),
                { label: "personName" }
              ),
            },
            roles: toRegistrationCompanyRoles(input.roles),
          })
        ).pipe(
          Effect.catchTag("InvitationPolicyError", (error) =>
            Effect.fail(policyFailure(error))
          )
        );

        return invitationReceipt(invitation, input.inviteeEmail);
      }),
      listInvitations: Effect.fn("CustomerAccountMembers.listInvitations")(
        function* (actor) {
          const companyActor = toCompanyActor(actor);
          const storedInvitations = yield* provideInvitationServices(
            listCurrentCompanyMemberInvitations({ actor: companyActor })
          ).pipe(
            Effect.catchTag("InvitationPolicyError", (error) =>
              Effect.fail(policyFailure(error))
            )
          );

          return storedInvitations.map(invitationListItem);
        }
      ),
      reissueInvitation: Effect.fn("CustomerAccountMembers.reissueInvitation")(
        function* (input) {
          const invitation = yield* provideInvitationServices(
            reissueCompanyMemberInvite({
              actor: toCompanyActor(input.actor),
              companyMemberInvitationId: CompanyMemberInvitationId.make(
                input.companyMemberInvitationId
              ),
            })
          ).pipe(
            Effect.catchTag("InvitationPolicyError", (error) =>
              Effect.fail(policyFailure(error))
            )
          );

          return invitationReceipt(invitation, invitation.intent.inviteeEmail);
        }
      ),
    });
  })
);
