import { describe, expect, it } from "@effect/vitest";
import {
  CommerceBusinessUnitId,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import type { CompanyRoles } from "@repo/commerce/domain/commerce-account";
import { AuthUserId as CommerceAuthUserId } from "@repo/commerce/domain/commerce-request-context";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import {
  CompanyMemberInvitationNotFound,
  CustomerAccountCompanyActor,
  CustomerAccountCompanyMemberInvitationId,
  CustomerAccountIdentityLookupFailure,
  CustomerAccountMemberInvitation,
  CustomerAccountMembers,
  InvitationPolicyError as CustomerAccountInvitationPolicyError,
  InvitationProviderFailure,
} from "@repo/commerce/services/customer-account-members";
import { DateTime, Effect, Layer, Redacted, Ref, Schema } from "effect";
import { TestClock } from "effect/testing";

import {
  AcceptedAuthIdentity,
  AuthUserId,
  Email,
  InvitationId,
  PersonName,
} from "../domain/identity";
import { PendingInvitation } from "../domain/invitations";
import { CompanyInvitationPolicy } from "./company-invitation-policy";
import { CompanyMemberIdentityProjection } from "./company-member-identity-projection";
import { CompanyMemberInvitationRecords } from "./company-member-invitation-records";
import { customerAccountMembersLayer } from "./customer-account-members";
import { IdentityUserLookupFailure, IdentityUsers } from "./identity-users";
import type { CompanyMemberInvitationIssueInput } from "./invitations";
import {
  CompanyMemberInvitations,
  InvitationDeliveries,
  invitationCapabilitiesLayerMemory,
} from "./invitations";

const unusedDeliveriesLayer = Layer.succeed(
  InvitationDeliveries,
  InvitationDeliveries.of({
    get: () => Effect.die("not used in this test"),
  })
);

const identityProjectionLayer = Layer.succeed(
  CompanyMemberIdentityProjection,
  CompanyMemberIdentityProjection.of({
    projectAcceptedInvitation: () => Effect.void,
    projectMembership: () => Effect.void,
    removeMembership: () => Effect.void,
  })
);

const withUnusedDeliveries = (
  providerLayer: Layer.Layer<CompanyMemberInvitations>
) => Layer.merge(providerLayer, unusedDeliveriesLayer);

const actor = (roles: CompanyRoles) => {
  const isAdministrator = roles.some((role) => role === "admin");

  return new CustomerAccountCompanyActor({
    authUserId: CommerceAuthUserId.make(
      isAdministrator ? "auth-admin-1" : "auth-buyer-1"
    ),
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    email: Redacted.make(
      isAdministrator ? "admin@example.com" : "buyer@example.com",
      { label: "email" }
    ),
    roles,
  });
};

const provideAdapter = (
  providerLayer: Layer.Layer<CompanyMemberInvitations | InvitationDeliveries>,
  commerceLayer: Layer.Layer<CommerceAccounts> = CommerceAccounts.layerMemory
) =>
  customerAccountMembersLayer.pipe(
    Layer.provide(
      Layer.mergeAll(
        providerLayer,
        CompanyInvitationPolicy.layer,
        CompanyMemberInvitationRecords.layerMemory,
        commerceLayer,
        identityProjectionLayer,
        IdentityUsers.layerMemory
      )
    )
  );

const inviteeName = {
  firstName: Redacted.make("Invited", { label: "personName" }),
  lastName: Redacted.make("Member", { label: "personName" }),
};

describe("customer account members adapter", () => {
  it.effect("maps a verified administrator invitation into Registration", () =>
    Effect.gen(function* () {
      const captured = yield* Ref.make<
        CompanyMemberInvitationIssueInput | undefined
      >(undefined);
      const providerLayer = Layer.succeed(CompanyMemberInvitations)({
        issue: (input) =>
          Ref.set(captured, input).pipe(
            Effect.as(
              new PendingInvitation({
                _tag: "PendingInvitation",
                createdAt: DateTime.toDateUtc(
                  DateTime.makeUnsafe("2026-08-25T12:00:00.000Z")
                ),
                expiresAt: DateTime.toDateUtc(
                  DateTime.makeUnsafe("2026-09-25T12:00:00.000Z")
                ),
                id: InvitationId.make("invitation-1"),
                intent: input.intent,
                issuedBy: input.issuedBy,
              })
            )
          ),
        revoke: () => Effect.die("not used in this test"),
      });

      const receipt = yield* Effect.gen(function* () {
        const members = yield* CustomerAccountMembers;
        return yield* members.invite({
          actor: actor(["admin", "buyer"]),
          inviteeEmail: Redacted.make("member@example.com", {
            label: "email",
          }),
          inviteeName,
          roles: ["buyer", "approver"],
        });
      }).pipe(
        Effect.provide(provideAdapter(withUnusedDeliveries(providerLayer)))
      );
      const providerInput = yield* Ref.get(captured).pipe(
        Effect.flatMap((input) =>
          input === undefined
            ? Effect.die("Expected the provider to receive an invite")
            : Effect.succeed(input)
        )
      );
      if (!Schema.is(CustomerAccountMemberInvitation)(receipt)) {
        return yield* Effect.die("Expected an invitation receipt");
      }

      expect({
        invitationId: receipt.invitationId,
        inviteeEmail: Redacted.value(receipt.inviteeEmail),
      }).toStrictEqual({
        invitationId: "invitation-1",
        inviteeEmail: "member@example.com",
      });
      expect(providerInput.issuedBy).toMatchObject({
        actorType: "company",
        authUserId: "auth-admin-1",
        businessUnitId: "business-unit-1",
        roles: ["admin", "buyer"],
      });
      expect(providerInput.intent).toMatchObject({
        businessUnitId: "business-unit-1",
        intent: "company_member",
        roles: ["buyer", "approver"],
      });
      expect(Redacted.value(providerInput.intent.inviteeEmail)).toBe(
        "member@example.com"
      );
      expect({
        firstName: Redacted.value(providerInput.intent.inviteeName.firstName),
        lastName: Redacted.value(providerInput.intent.inviteeName.lastName),
      }).toStrictEqual({ firstName: "Invited", lastName: "Member" });
    })
  );

  it.effect("enforces the injected policy before calling the provider", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0);
      const providerLayer = Layer.succeed(CompanyMemberInvitations)({
        issue: () =>
          Ref.update(calls, (count) => count + 1).pipe(
            Effect.andThen(Effect.die("not expected"))
          ),
        revoke: () => Effect.die("not used in this test"),
      });

      const failure = yield* Effect.gen(function* () {
        const members = yield* CustomerAccountMembers;
        return yield* members.invite({
          actor: actor(["buyer"]),
          inviteeEmail: Redacted.make("invitee@example.com", {
            label: "email",
          }),
          inviteeName,
          roles: ["buyer"],
        });
      }).pipe(
        Effect.provide(provideAdapter(withUnusedDeliveries(providerLayer))),
        Effect.flip
      );

      expect(failure).toBeInstanceOf(CustomerAccountInvitationPolicyError);
      expect(failure._tag).toBe("InvitationPolicyError");
      expect(yield* Ref.get(calls)).toBe(0);
    })
  );

  it.effect("passes provider delivery failures through unchanged", () => {
    const providerFailure = new InvitationProviderFailure({
      cause: new Error("provider unavailable"),
      message: "Invitation delivery is unavailable",
      operation: "issue",
    });
    const providerLayer = Layer.succeed(CompanyMemberInvitations)({
      issue: () => Effect.fail(providerFailure),
      revoke: () => Effect.die("not used in this test"),
    });

    return Effect.gen(function* () {
      const members = yield* CustomerAccountMembers;
      const failure = yield* members
        .invite({
          actor: actor(["admin", "buyer"]),
          inviteeEmail: Redacted.make("member@example.com", {
            label: "email",
          }),
          inviteeName,
          roles: ["buyer"],
        })
        .pipe(Effect.flip);

      expect(failure).toBe(providerFailure);
    }).pipe(
      Effect.provide(provideAdapter(withUnusedDeliveries(providerLayer)))
    );
  });

  it.effect(
    "preserves only unavailable identity lookups as expected failures",
    () => {
      const identityFailure = new IdentityUserLookupFailure({
        cause: new Error("directory timed out"),
        message: "Identity directory timed out",
        operation: "findByEmail",
        reason: "unavailable",
      });
      const identityLayer = Layer.succeed(
        IdentityUsers,
        IdentityUsers.of({
          findByEmail: () => Effect.fail(identityFailure),
          getById: () => Effect.die("not used"),
          hasUserWithEmail: () => Effect.die("not used"),
        })
      );
      const adapter = customerAccountMembersLayer.pipe(
        Layer.provide(
          Layer.mergeAll(
            invitationCapabilitiesLayerMemory,
            CompanyInvitationPolicy.layer,
            CompanyMemberInvitationRecords.layerMemory,
            CommerceAccounts.layerMemory,
            identityProjectionLayer,
            identityLayer
          )
        )
      );

      return Effect.gen(function* () {
        const members = yield* CustomerAccountMembers;
        const failure = yield* members
          .invite({
            actor: actor(["admin", "buyer"]),
            inviteeEmail: Redacted.make("member@example.com", {
              label: "email",
            }),
            inviteeName,
            roles: ["buyer"],
          })
          .pipe(Effect.flip);

        expect(failure).toBeInstanceOf(CustomerAccountIdentityLookupFailure);
        if (failure._tag !== "CustomerAccountIdentityLookupFailure") {
          return yield* Effect.die("Expected an identity lookup failure");
        }
        expect(failure.reason).toBe("unavailable");
      }).pipe(Effect.provide(adapter));
    }
  );

  it.effect("treats unexpected identity responses as defects", () => {
    const identityFailure = new IdentityUserLookupFailure({
      cause: new Error("malformed provider response"),
      message: "Identity directory returned malformed data",
      operation: "findByEmail",
      reason: "unexpectedResponse",
    });
    const identityLayer = Layer.succeed(
      IdentityUsers,
      IdentityUsers.of({
        findByEmail: () => Effect.fail(identityFailure),
        getById: () => Effect.die("not used"),
        hasUserWithEmail: () => Effect.die("not used"),
      })
    );
    const adapter = customerAccountMembersLayer.pipe(
      Layer.provide(
        Layer.mergeAll(
          invitationCapabilitiesLayerMemory,
          CompanyInvitationPolicy.layer,
          CompanyMemberInvitationRecords.layerMemory,
          CommerceAccounts.layerMemory,
          identityProjectionLayer,
          identityLayer
        )
      )
    );

    return Effect.gen(function* () {
      const members = yield* CustomerAccountMembers;
      const exit = yield* members
        .invite({
          actor: actor(["admin", "buyer"]),
          inviteeEmail: Redacted.make("member@example.com", {
            label: "email",
          }),
          inviteeName,
          roles: ["buyer"],
        })
        .pipe(Effect.exit);

      expect(exit.toString()).toContain("IdentityUserLookupFailure");
      expect(exit.toString()).toContain("Die");
    }).pipe(Effect.provide(adapter));
  });

  it.effect("preserves durable invitation failure identity", () =>
    Effect.gen(function* () {
      const members = yield* CustomerAccountMembers;
      const failure = yield* members
        .cancelInvitation({
          actor: actor(["admin", "buyer"]),
          companyMemberInvitationId:
            CustomerAccountCompanyMemberInvitationId.make("missing"),
        })
        .pipe(Effect.flip);

      expect(failure).toBeInstanceOf(CompanyMemberInvitationNotFound);
    }).pipe(Effect.provide(provideAdapter(invitationCapabilitiesLayerMemory)))
  );

  it.effect("projects only the fresh pending invitation after reissue", () =>
    Effect.gen(function* () {
      const members = yield* CustomerAccountMembers;
      yield* members.invite({
        actor: actor(["admin", "buyer"]),
        inviteeEmail: Redacted.make("member@example.com", { label: "email" }),
        inviteeName,
        roles: ["buyer"],
      });

      yield* TestClock.adjust("31 days");
      const expired = yield* members.listInvitations(actor(["admin", "buyer"]));
      const [expiredInvitation] = expired;
      if (expiredInvitation === undefined) {
        throw new Error("Expected the expired invitation");
      }
      yield* members.reissueInvitation({
        actor: actor(["admin", "buyer"]),
        companyMemberInvitationId: expiredInvitation.companyMemberInvitationId,
      });
      const current = yield* members.listInvitations(actor(["admin", "buyer"]));

      expect(expiredInvitation.status).toBe("expired");
      expect(current).toHaveLength(1);
      expect(current[0]?.status).toBe("pending");
      expect(current[0]?.companyMemberInvitationId).not.toBe(
        expiredInvitation.companyMemberInvitationId
      );
    }).pipe(Effect.provide(provideAdapter(invitationCapabilitiesLayerMemory)))
  );

  it.effect(
    "shows accepted invitations only until Commerce provisioning completes",
    () => {
      const recordsLayer = CompanyMemberInvitationRecords.layerMemory;
      const adapterLayer = customerAccountMembersLayer.pipe(
        Layer.provide(
          Layer.mergeAll(
            invitationCapabilitiesLayerMemory,
            CompanyInvitationPolicy.layer,
            recordsLayer,
            CommerceAccounts.layerMemory,
            identityProjectionLayer,
            IdentityUsers.layerMemory
          )
        )
      );

      return Effect.gen(function* () {
        const members = yield* CustomerAccountMembers;
        yield* members.invite({
          actor: actor(["admin", "buyer"]),
          inviteeEmail: Redacted.make("member@example.com", { label: "email" }),
          inviteeName,
          roles: ["buyer"],
        });
        const records = yield* CompanyMemberInvitationRecords;
        const [issued] = yield* records.listByBusinessUnit(
          CommerceBusinessUnitId.make("business-unit-1")
        );
        if (issued === undefined) {
          throw new Error("Expected a durable invitation");
        }
        yield* records.markAccepted({
          acceptedAt: issued.createdAt,
          acceptedIdentity: new AcceptedAuthIdentity({
            authUserId: AuthUserId.make("auth-member-1"),
            email: Redacted.make(Email.make("member@example.com"), {
              label: "email",
            }),
            firstName: Redacted.make(PersonName.make("Invited"), {
              label: "personName",
            }),
            lastName: Redacted.make(PersonName.make("Member"), {
              label: "personName",
            }),
          }),
          companyMemberInvitationId: issued.intent.companyMemberInvitationId,
        });

        expect(
          yield* members.listInvitations(actor(["admin", "buyer"]))
        ).toMatchObject([
          {
            acceptedAuthUserId: "auth-member-1",
            status: "accepted",
          },
        ]);

        yield* records.markProvisioned({
          companyMemberInvitationId: issued.intent.companyMemberInvitationId,
          customerId: CommerceCustomerId.make("customer-member-1"),
          provisionedAt: issued.createdAt,
        });

        expect(
          yield* members.listInvitations(actor(["admin", "buyer"]))
        ).toStrictEqual([]);
      }).pipe(Effect.provide(Layer.mergeAll(adapterLayer, recordsLayer)));
    }
  );
});
