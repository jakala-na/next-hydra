import type { IdentityMembershipProjectionFailure } from "@repo/auth-contract/identity-memberships";
import type { InvitationProviderFailure } from "@repo/auth-contract/invitations";
import { Context } from "effect";
import type { Effect } from "effect";

import type {
  AcceptedAuthIdentity,
  CommerceBusinessUnitId,
} from "../domain/identity";
import type { CompanyMemberIntent } from "../domain/invitations";
import type { CompanyRoles } from "../domain/roles";

export interface ProjectAcceptedCompanyMemberIdentityInput {
  readonly acceptedIdentity: AcceptedAuthIdentity;
  readonly intent: CompanyMemberIntent;
}

export interface ProjectCompanyMembershipIdentityInput {
  readonly authUserId: AcceptedAuthIdentity["authUserId"];
  readonly businessUnitId: CommerceBusinessUnitId;
  readonly roles: CompanyRoles;
}

export interface RemoveCompanyMembershipIdentityInput {
  readonly authUserId: AcceptedAuthIdentity["authUserId"];
  readonly businessUnitId: CommerceBusinessUnitId;
}

/** Provider-owned projection of company membership context. Durable
 * Registration and Commerce records remain authoritative. */
export class CompanyMemberIdentityProjection extends Context.Service<
  CompanyMemberIdentityProjection,
  {
    readonly projectAcceptedInvitation: (
      input: ProjectAcceptedCompanyMemberIdentityInput
    ) => Effect.Effect<void, InvitationProviderFailure>;
    readonly projectMembership: (
      input: ProjectCompanyMembershipIdentityInput
    ) => Effect.Effect<void, IdentityMembershipProjectionFailure>;
    readonly removeMembership: (
      input: RemoveCompanyMembershipIdentityInput
    ) => Effect.Effect<void, IdentityMembershipProjectionFailure>;
  }
>()("@repo/registration/CompanyMemberIdentityProjection") {}
