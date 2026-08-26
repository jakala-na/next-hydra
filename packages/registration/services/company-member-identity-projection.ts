import type { InvitationProviderFailure } from "@repo/auth-contract/invitations";
import { Context } from "effect";
import type { Effect } from "effect";

import type { AcceptedAuthIdentity } from "../domain/identity";
import type { CompanyMemberIntent } from "../domain/invitations";

export interface ProjectAcceptedCompanyMemberIdentityInput {
  readonly acceptedIdentity: AcceptedAuthIdentity;
  readonly intent: CompanyMemberIntent;
}

/** Provider-owned projection of accepted company invitation context. The
 * durable company-member invitation record remains authoritative. */
export class CompanyMemberIdentityProjection extends Context.Service<
  CompanyMemberIdentityProjection,
  {
    readonly projectAcceptedInvitation: (
      input: ProjectAcceptedCompanyMemberIdentityInput
    ) => Effect.Effect<void, InvitationProviderFailure>;
  }
>()("@repo/registration/CompanyMemberIdentityProjection") {}
