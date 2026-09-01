import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Logger, Redacted, Ref } from "effect";

import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCompanyMember,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "../domain/commerce-account";
import type { CompanyRoles } from "../domain/commerce-account";
import {
  AuthUserId,
  CustomerCommercePrincipal,
} from "../domain/commerce-request-context";
import { CommerceAccounts } from "../services/commerce-accounts";
import {
  CommerceCompanyMembershipChanged,
  CommerceCompanyMembershipRevision,
  CommerceCompanyMembershipRoster,
  CommerceCompanyMemberships,
  DeletedCommerceCompanyMemberRemoval,
} from "../services/commerce-company-memberships";
import { CommerceContext } from "../services/commerce-context";
import { CompanyMemberRemovalRecords } from "../services/company-member-removal-records";
import {
  CustomerAccountCompanyMemberInvitationId,
  CustomerAccountInvitationListItem,
  CustomerAccountMembers,
  IdentityMembershipProjectionFailure,
  InvitationIssueOutcomeUnknown,
  InvitationProviderFailure,
} from "../services/customer-account-members";
import { CommerceLocale, resolveStore } from "../store";
import {
  cancelCompanyMemberInvitation,
  getCustomerAccountOverview,
  reissueCompanyMemberInvitation,
  removeCompanyMember,
} from "./programs";

const customerId = CommerceCustomerId.make("customer-1");
const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");
const invitationExpiresAt = DateTime.toDateUtc(
  DateTime.makeUnsafe("2026-09-25T12:00:00.000Z")
);

const layer = (
  roles: CompanyRoles,
  membershipsLayer = CommerceCompanyMemberships.layerMemory,
  members = CustomerAccountMembers.of({
    cancelInvitation: () => Effect.die("not used"),
    invite: () => Effect.die("not used"),
    listInvitations: () => Effect.succeed([]),
    projectMemberIdentity: () => Effect.void,
    reissueInvitation: () => Effect.die("not used"),
    removeMemberIdentity: () => Effect.void,
  })
) => {
  const principal = new CustomerCommercePrincipal({
    authUserId: AuthUserId.make("auth-user-1"),
    businessUnitId,
    businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
    customerId,
    roles,
  });
  const context = CommerceContext.of({
    customerPrincipal: () => Effect.succeed(principal),
    customerProfile: () =>
      Effect.succeed(
        new CommerceCustomerProfile({
          customerId,
          email: Redacted.make("administrator@example.com", {
            label: "email",
          }),
        })
      ),
    principal,
    store: resolveStore({ locale: CommerceLocale.make("en-US") }),
  });
  const accounts = CommerceAccounts.of({
    addAssociate: () => Effect.die("not used"),
    createFromRegistration: () => Effect.die("not used"),
    getCustomerIdByAuthUserId: () => Effect.die("not used"),
    getCustomerProfile: () => Effect.die("not used"),
    hasCustomerWithEmail: () => Effect.die("not used"),
    linkRegistrantIdentity: () => Effect.die("not used"),
    listBusinessUnitMembershipsForCustomerInStore: () =>
      Effect.succeed([
        new CommerceBusinessUnitMembership({
          businessUnitId,
          businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
          businessUnitLabel: CommerceBusinessUnitLabel.make("Acme Brewery"),
          roles,
        }),
      ]),
  });
  return Layer.mergeAll(
    Layer.succeed(CommerceContext, context),
    Layer.succeed(CommerceAccounts, accounts),
    CompanyMemberRemovalRecords.layerMemory,
    membershipsLayer,
    Layer.succeed(CustomerAccountMembers, members)
  );
};

describe("customer account programs", () => {
  it.effect("derives invitation access for an administrator", () =>
    Effect.gen(function* () {
      const overview = yield* getCustomerAccountOverview();

      expect(overview).toMatchObject({
        canInvite: true,
        companyLabel: "Acme Brewery",
      });
    }).pipe(Effect.provide(layer(["admin", "buyer"])))
  );

  it.effect("keeps account members without Admin read-only", () =>
    Effect.gen(function* () {
      const overview = yield* getCustomerAccountOverview();

      expect(overview).toMatchObject({
        canInvite: false,
        companyLabel: "Acme Brewery",
      });
    }).pipe(Effect.provide(layer(["buyer"])))
  );

  it.effect(
    "shows an accepted invitation until its Commerce member is provisioned",
    () => {
      const members = CustomerAccountMembers.of({
        cancelInvitation: () => Effect.die("not used"),
        invite: () => Effect.die("not used"),
        listInvitations: () =>
          Effect.succeed([
            new CustomerAccountInvitationListItem({
              acceptedAuthUserId: AuthUserId.make("auth-invited-1"),
              companyMemberInvitationId:
                CustomerAccountCompanyMemberInvitationId.make(
                  "company-member-invitation-1"
                ),
              expiresAt: invitationExpiresAt,
              firstName: Redacted.make("Invited", { label: "personName" }),
              inviteeEmail: Redacted.make("invited@example.com", {
                label: "email",
              }),
              lastName: Redacted.make("Member", { label: "personName" }),
              roles: ["buyer"],
              status: "accepted",
            }),
          ]),
        projectMemberIdentity: () => Effect.void,
        reissueInvitation: () => Effect.die("not used"),
        removeMemberIdentity: () => Effect.void,
      });

      return Effect.gen(function* () {
        const overview = yield* getCustomerAccountOverview();

        expect(overview?.people.invitations).toMatchObject([
          {
            acceptedAuthUserId: "auth-invited-1",
            status: "accepted",
          },
        ]);
      }).pipe(
        Effect.provide(
          layer(
            ["admin", "buyer"],
            CommerceCompanyMemberships.layerMemory,
            members
          )
        )
      );
    }
  );

  it.effect(
    "blocks removal while accepted invitation provisioning lacks its durable receipt",
    () => {
      const invitedMember = new CommerceCompanyMember({
        authUserId: "auth-invited-1",
        businessUnitId,
        customerId: CommerceCustomerId.make("customer-invited-1"),
        directlyAssociated: true,
        email: Redacted.make("invited@example.com", { label: "email" }),
        inheritedRoles: [],
        roles: ["buyer"],
      });
      const administrator = new CommerceCompanyMember({
        authUserId: "auth-user-1",
        businessUnitId,
        customerId,
        directlyAssociated: true,
        email: Redacted.make("administrator@example.com", { label: "email" }),
        inheritedRoles: [],
        roles: ["admin", "buyer"],
      });
      const membershipsLayer = CommerceCompanyMemberships.layerMemoryFrom({
        rosters: [
          new CommerceCompanyMembershipRoster({
            businessUnitId,
            members: [administrator, invitedMember],
            revision: CommerceCompanyMembershipRevision.make("1"),
          }),
        ],
      });
      const members = CustomerAccountMembers.of({
        cancelInvitation: () => Effect.die("not used"),
        invite: () => Effect.die("not used"),
        listInvitations: () =>
          Effect.succeed([
            new CustomerAccountInvitationListItem({
              acceptedAuthUserId: AuthUserId.make(invitedMember.authUserId),
              companyMemberInvitationId:
                CustomerAccountCompanyMemberInvitationId.make(
                  "company-member-invitation-1"
                ),
              expiresAt: invitationExpiresAt,
              firstName: Redacted.make("Invited", { label: "personName" }),
              inviteeEmail: invitedMember.email,
              lastName: Redacted.make("Member", { label: "personName" }),
              roles: invitedMember.roles,
              status: "accepted",
            }),
          ]),
        projectMemberIdentity: () => Effect.void,
        reissueInvitation: () => Effect.die("not used"),
        removeMemberIdentity: () => Effect.void,
      });

      return Effect.gen(function* () {
        const overview = yield* getCustomerAccountOverview();
        const failure = yield* removeCompanyMember(
          invitedMember.customerId
        ).pipe(Effect.flip);
        const roster = yield* CommerceCompanyMemberships.pipe(
          Effect.flatMap((memberships) => memberships.getRoster(businessUnitId))
        );

        expect(overview?.people.invitations).toMatchObject([
          { acceptedAuthUserId: invitedMember.authUserId, status: "accepted" },
        ]);
        expect(
          overview?.people.members.some(
            ({ customerId: id }) => id === invitedMember.customerId
          )
        ).toBeFalsy();
        expect(failure._tag).toBe("CompanyMemberRemovalConflict");
        expect(failure.message).toContain("still completing");
        expect(roster.members.map(({ customerId: id }) => id)).toContain(
          invitedMember.customerId
        );
      }).pipe(
        Effect.provide(layer(["admin", "buyer"], membershipsLayer, members))
      );
    }
  );

  it.effect("removes only the selected company membership", () => {
    const member = new CommerceCompanyMember({
      authUserId: "auth-member-1",
      businessUnitId,
      customerId: CommerceCustomerId.make("customer-member-1"),
      directlyAssociated: true,
      email: Redacted.make("member@example.com", { label: "email" }),
      inheritedRoles: [],
      roles: ["buyer"],
    });
    const administrator = new CommerceCompanyMember({
      authUserId: "auth-user-1",
      businessUnitId,
      customerId,
      directlyAssociated: true,
      email: Redacted.make("administrator@example.com", { label: "email" }),
      inheritedRoles: [],
      roles: ["admin", "buyer"],
    });
    const membershipsLayer = CommerceCompanyMemberships.layerMemoryFrom({
      rosters: [
        new CommerceCompanyMembershipRoster({
          businessUnitId,
          members: [administrator, member],
          revision: CommerceCompanyMembershipRevision.make("1"),
        }),
      ],
    });

    return Effect.gen(function* () {
      yield* removeCompanyMember(member.customerId);
      const roster = yield* CommerceCompanyMemberships.pipe(
        Effect.flatMap((memberships) => memberships.getRoster(businessUnitId))
      );

      expect(roster.members.map(({ customerId: id }) => id)).toStrictEqual([
        customerId,
      ]);
    }).pipe(Effect.provide(layer(["admin", "buyer"], membershipsLayer)));
  });

  it.effect(
    "retries final customer retirement after the membership is already absent",
    () =>
      Effect.gen(function* () {
        const retiredCustomerId = CommerceCustomerId.make("customer-member-1");
        const reconciliations = yield* Ref.make<CommerceCustomerId[]>([]);
        const memberships = CommerceCompanyMemberships.of({
          getRoster: () =>
            Effect.succeed(
              new CommerceCompanyMembershipRoster({
                businessUnitId,
                members: [],
                revision: CommerceCompanyMembershipRevision.make("2"),
              })
            ),
          reconcileCustomerDisposition: (candidateCustomerId) =>
            Ref.update(reconciliations, (current) => [
              ...current,
              candidateCustomerId,
            ]).pipe(
              Effect.as(
                new DeletedCommerceCompanyMemberRemoval({
                  customerDisposition: "deleted",
                })
              )
            ),
          removeMember: () => Effect.die("membership is already absent"),
        });

        yield* Effect.gen(function* () {
          const removalRecords = yield* CompanyMemberRemovalRecords;
          yield* removalRecords.begin({
            authUserId: AuthUserId.make("auth-member-1"),
            businessUnitId,
            customerId: retiredCustomerId,
          });
          yield* removeCompanyMember(retiredCustomerId);
        }).pipe(
          Effect.provide(
            layer(
              ["admin", "buyer"],
              Layer.succeed(CommerceCompanyMemberships, memberships)
            )
          )
        );

        expect(yield* Ref.get(reconciliations)).toStrictEqual([
          retiredCustomerId,
        ]);
      })
  );

  it.effect(
    "does not reconcile an absent member without a removal receipt",
    () =>
      Effect.gen(function* () {
        const reconciliations = yield* Ref.make(0);
        const memberships = CommerceCompanyMemberships.of({
          getRoster: () =>
            Effect.succeed(
              new CommerceCompanyMembershipRoster({
                businessUnitId,
                members: [],
                revision: CommerceCompanyMembershipRevision.make("2"),
              })
            ),
          reconcileCustomerDisposition: () =>
            Ref.update(reconciliations, (count) => count + 1).pipe(
              Effect.as(
                new DeletedCommerceCompanyMemberRemoval({
                  customerDisposition: "deleted",
                })
              )
            ),
          removeMember: () => Effect.die("member is absent"),
        });

        const failure = yield* removeCompanyMember(
          CommerceCustomerId.make("unrelated-customer")
        ).pipe(
          Effect.flip,
          Effect.provide(
            layer(
              ["admin", "buyer"],
              Layer.succeed(CommerceCompanyMemberships, memberships)
            )
          )
        );

        expect(failure._tag).toBe("CompanyMemberRemovalConflict");
        expect(yield* Ref.get(reconciliations)).toBe(0);
      })
  );

  it.effect(
    "retries final identity cleanup from the durable removal receipt",
    () =>
      Effect.gen(function* () {
        const target = new CommerceCompanyMember({
          authUserId: "auth-member-1",
          businessUnitId,
          customerId: CommerceCustomerId.make("customer-member-1"),
          directlyAssociated: true,
          email: Redacted.make("member@example.com", { label: "email" }),
          inheritedRoles: [],
          roles: ["buyer"],
        });
        const administrator = new CommerceCompanyMember({
          authUserId: "auth-user-1",
          businessUnitId,
          customerId,
          directlyAssociated: true,
          email: Redacted.make("administrator@example.com", { label: "email" }),
          inheritedRoles: [],
          roles: ["admin"],
        });
        const removed = yield* Ref.make(false);
        const projectionAttempts = yield* Ref.make(0);
        const memberships = CommerceCompanyMemberships.of({
          getRoster: () =>
            Ref.get(removed).pipe(
              Effect.map(
                (isRemoved) =>
                  new CommerceCompanyMembershipRoster({
                    businessUnitId,
                    members: isRemoved
                      ? [administrator]
                      : [administrator, target],
                    revision: CommerceCompanyMembershipRevision.make(
                      isRemoved ? "2" : "1"
                    ),
                  })
              )
            ),
          reconcileCustomerDisposition: () =>
            Effect.succeed(
              new DeletedCommerceCompanyMemberRemoval({
                customerDisposition: "deleted",
              })
            ),
          removeMember: () =>
            Ref.set(removed, true).pipe(
              Effect.as(
                new DeletedCommerceCompanyMemberRemoval({
                  customerDisposition: "deleted",
                })
              )
            ),
        });
        const members = CustomerAccountMembers.of({
          cancelInvitation: () => Effect.die("not used"),
          invite: () => Effect.die("not used"),
          listInvitations: () => Effect.succeed([]),
          projectMemberIdentity: () => Effect.void,
          reissueInvitation: () => Effect.die("not used"),
          removeMemberIdentity: () =>
            Ref.getAndUpdate(projectionAttempts, (count) => count + 1).pipe(
              Effect.flatMap((count) =>
                count === 0
                  ? Effect.fail(
                      new IdentityMembershipProjectionFailure({
                        cause: new Error("provider unavailable"),
                        message: "Identity membership projection unavailable",
                        operation: "remove",
                        reason: "unavailable",
                      })
                    )
                  : Effect.void
              )
            ),
        });
        const retryLayer = layer(
          ["admin"],
          Layer.succeed(CommerceCompanyMemberships, memberships),
          members
        );

        const firstFailure = yield* Effect.gen(function* () {
          const failure = yield* removeCompanyMember(target.customerId).pipe(
            Effect.flip
          );
          yield* removeCompanyMember(target.customerId);
          return failure;
        }).pipe(Effect.provide(retryLayer));

        expect(firstFailure._tag).toBe("IdentityMembershipProjectionFailure");
        expect(yield* Ref.get(projectionAttempts)).toBe(2);
      })
  );

  it.effect(
    "retains inherited membership after removing the direct association",
    () => {
      const projectedMemberships: {
        readonly authUserId: AuthUserId;
        readonly businessUnitId: CommerceBusinessUnitId;
        readonly roles: CompanyRoles;
      }[] = [];
      const member = new CommerceCompanyMember({
        authUserId: "auth-member-1",
        businessUnitId,
        customerId: CommerceCustomerId.make("customer-member-1"),
        directlyAssociated: true,
        email: Redacted.make("member@example.com", { label: "email" }),
        inheritedRoles: ["approver"],
        roles: ["buyer", "approver"],
      });
      const administrator = new CommerceCompanyMember({
        authUserId: "auth-user-1",
        businessUnitId,
        customerId,
        directlyAssociated: true,
        email: Redacted.make("administrator@example.com", { label: "email" }),
        inheritedRoles: [],
        roles: ["admin"],
      });
      const membershipsLayer = CommerceCompanyMemberships.layerMemoryFrom({
        rosters: [
          new CommerceCompanyMembershipRoster({
            businessUnitId,
            members: [administrator, member],
            revision: CommerceCompanyMembershipRevision.make("1"),
          }),
        ],
      });
      const members = CustomerAccountMembers.of({
        cancelInvitation: () => Effect.die("not used"),
        invite: () => Effect.die("not used"),
        listInvitations: () => Effect.succeed([]),
        projectMemberIdentity: (input) =>
          Effect.sync(() => {
            projectedMemberships.push(input);
          }),
        reissueInvitation: () => Effect.die("not used"),
        removeMemberIdentity: () => Effect.die("not used"),
      });

      return Effect.gen(function* () {
        yield* removeCompanyMember(member.customerId);
        const roster = yield* CommerceCompanyMemberships.pipe(
          Effect.flatMap((memberships) => memberships.getRoster(businessUnitId))
        );

        expect(roster.members[1]).toMatchObject({
          customerId: member.customerId,
          directlyAssociated: false,
          inheritedRoles: ["approver"],
          roles: ["approver"],
        });
        expect(projectedMemberships).toStrictEqual([
          {
            authUserId: member.authUserId,
            businessUnitId,
            roles: ["approver"],
          },
        ]);
      }).pipe(Effect.provide(layer(["admin"], membershipsLayer, members)));
    }
  );

  it.effect("rejects removal of an inherited-only member", () => {
    const inheritedMember = new CommerceCompanyMember({
      authUserId: "auth-member-1",
      businessUnitId,
      customerId: CommerceCustomerId.make("customer-member-1"),
      directlyAssociated: false,
      email: Redacted.make("member@example.com", { label: "email" }),
      inheritedRoles: ["buyer"],
      roles: ["buyer"],
    });
    const administrator = new CommerceCompanyMember({
      authUserId: "auth-user-1",
      businessUnitId,
      customerId,
      directlyAssociated: true,
      email: Redacted.make("administrator@example.com", { label: "email" }),
      inheritedRoles: [],
      roles: ["admin"],
    });
    const membershipsLayer = CommerceCompanyMemberships.layerMemoryFrom({
      rosters: [
        new CommerceCompanyMembershipRoster({
          businessUnitId,
          members: [administrator, inheritedMember],
          revision: CommerceCompanyMembershipRevision.make("1"),
        }),
      ],
    });

    return Effect.gen(function* () {
      const failure = yield* removeCompanyMember(
        inheritedMember.customerId
      ).pipe(Effect.flip);

      expect(failure._tag).toBe("CompanyMemberRemovalConflict");
      expect(failure.message).toContain("inherited");
    }).pipe(Effect.provide(layer(["admin"], membershipsLayer)));
  });

  it.effect(
    "rechecks final-administrator policy after a concurrent change",
    () =>
      Effect.gen(function* () {
        const target = new CommerceCompanyMember({
          authUserId: "auth-admin-2",
          businessUnitId,
          customerId: CommerceCustomerId.make("customer-admin-2"),
          directlyAssociated: true,
          email: Redacted.make("other.admin@example.com", { label: "email" }),
          inheritedRoles: [],
          roles: ["admin"],
        });
        const actor = new CommerceCompanyMember({
          authUserId: "auth-user-1",
          businessUnitId,
          customerId,
          directlyAssociated: true,
          email: Redacted.make("administrator@example.com", { label: "email" }),
          inheritedRoles: [],
          roles: ["admin"],
        });
        const reads = yield* Ref.make(0);
        const removals = yield* Ref.make(0);
        const memberships = CommerceCompanyMemberships.of({
          getRoster: () =>
            Ref.getAndUpdate(reads, (count) => count + 1).pipe(
              Effect.map(
                (read) =>
                  new CommerceCompanyMembershipRoster({
                    businessUnitId,
                    members: read === 0 ? [actor, target] : [target],
                    revision: CommerceCompanyMembershipRevision.make(
                      String(read + 1)
                    ),
                  })
              )
            ),
          reconcileCustomerDisposition: () => Effect.die("not used"),
          removeMember: () =>
            Ref.update(removals, (count) => count + 1).pipe(
              Effect.andThen(
                Effect.fail(
                  new CommerceCompanyMembershipChanged({
                    businessUnitId,
                    message: "concurrent change",
                  })
                )
              )
            ),
        });
        const failure = yield* removeCompanyMember(target.customerId).pipe(
          Effect.flip,
          Effect.provide(
            layer(
              ["admin", "buyer"],
              Layer.succeed(CommerceCompanyMemberships, memberships)
            )
          )
        );

        expect(failure._tag).toBe("CompanyMemberRemovalConflict");
        expect(failure.message).toContain("final company administrator");
        expect(yield* Ref.get(reads)).toBe(2);
        expect(yield* Ref.get(removals)).toBe(1);
      })
  );

  it.effect(
    "logs private diagnostics for invitation management failures",
    () => {
      const diagnosticMessages: unknown[] = [];
      const logger = Logger.make<unknown, undefined>((options) => {
        diagnosticMessages.push(options.message);
        return undefined;
      });
      const invitationId = CustomerAccountCompanyMemberInvitationId.make(
        "company-member-invitation-1"
      );
      const members = CustomerAccountMembers.of({
        cancelInvitation: () =>
          Effect.fail(
            new InvitationProviderFailure({
              cause: new Error("provider revoke failed"),
              message: "Provider revoke failed",
              operation: "revoke",
            })
          ),
        invite: () => Effect.die("not used"),
        listInvitations: () => Effect.succeed([]),
        projectMemberIdentity: () => Effect.void,
        reissueInvitation: () =>
          Effect.fail(
            new InvitationIssueOutcomeUnknown({
              cause: new Error("provider response was lost"),
              message: "Provider response was lost",
            })
          ),
        removeMemberIdentity: () => Effect.void,
      });

      return Effect.gen(function* () {
        const cancelFailure = yield* cancelCompanyMemberInvitation(
          invitationId
        ).pipe(Effect.flip);
        const reissueFailure = yield* reissueCompanyMemberInvitation(
          invitationId
        ).pipe(Effect.flip);

        expect(cancelFailure._tag).toBe("InvitationProviderFailure");
        expect(reissueFailure._tag).toBe("InvitationIssueOutcomeUnknown");
        expect(diagnosticMessages).toHaveLength(2);
      }).pipe(
        Effect.provide(
          Layer.merge(
            layer(
              ["admin", "buyer"],
              CommerceCompanyMemberships.layerMemory,
              members
            ),
            Logger.layer([logger])
          )
        )
      );
    }
  );
});
