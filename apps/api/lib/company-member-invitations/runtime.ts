import { companyMemberIdentityProjectionLayer } from "@repo/auth/invitations";
import { commerceAccountsLayer } from "@repo/commerce-provider/commerce-accounts";
import { versionedKeyValueStoreLayer } from "@repo/commerce-provider/versioned-store";
import {
  acceptCompanyMemberInvitation,
  dispatchInvitationLifecycleEvent,
  CompanyMemberInvitationRecords,
} from "@repo/registration";
import type {
  AuthUserId,
  CompanyMemberInvitationId,
  Email,
  InvitationId,
  InvitationLifecycleEventType,
  PersonName,
} from "@repo/registration";
import { Config, Effect, Layer, ManagedRuntime } from "effect";

import { registrationInvitationLayer } from "@/lib/registration/workflow-runtime";

export interface AcceptedCompanyMemberIdentityInput {
  readonly authUserId: AuthUserId;
  readonly email: Email;
  readonly firstName?: PersonName;
  readonly lastName?: PersonName;
}

const recordsLayer = Layer.unwrap(
  Config.string("COMPANY_MEMBER_INVITATION_CONTAINER").pipe(
    Config.orElse(() => Config.succeed("customer-company-member-invitations")),
    Effect.map((container) =>
      CompanyMemberInvitationRecords.layerStorage.pipe(
        Layer.provide(versionedKeyValueStoreLayer({ container }))
      )
    )
  )
);

const companyMemberInvitationRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    recordsLayer,
    commerceAccountsLayer,
    companyMemberIdentityProjectionLayer,
    registrationInvitationLayer
  )
);

export const acceptCompanyMemberInvitationForClerk = async (input: {
  readonly acceptedAt: Date;
  readonly acceptedIdentity: AcceptedCompanyMemberIdentityInput;
  readonly companyMemberInvitationId: CompanyMemberInvitationId;
}): Promise<void> => {
  await companyMemberInvitationRuntime.runPromise(
    acceptCompanyMemberInvitation({
      acceptedAt: input.acceptedAt,
      acceptedIdentity: input.acceptedIdentity,
      reference: {
        companyMemberInvitationId: input.companyMemberInvitationId,
        referenceType: "company_member_invitation",
      },
    })
  );
};

export const dispatchWorkosInvitationEvent = async (input: {
  readonly event: InvitationLifecycleEventType;
  readonly invitationId: InvitationId;
}): Promise<void> => {
  await companyMemberInvitationRuntime.runPromise(
    dispatchInvitationLifecycleEvent(input)
  );
};
