/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- This focused capability keeps the provider-neutral membership snapshot and optimistic-concurrency vocabulary together. */
import { Context, Effect, Layer, Schema, SynchronizedRef } from "effect";

import type { CommerceCustomerId } from "../domain/commerce-account";
import {
  CommerceBusinessUnitId,
  CommerceCompanyMember,
  CompanyRoles,
} from "../domain/commerce-account";
import type { CommerceAccountUnavailable } from "./commerce-accounts";

/** Opaque provider-issued concurrency token. Callers may compare and return it,
 * but only the selected Commerce adapter interprets its contents. */
export const CommerceCompanyMembershipRevision = Schema.NonEmptyString.pipe(
  Schema.brand("CommerceCompanyMembershipRevision")
);
export type CommerceCompanyMembershipRevision =
  typeof CommerceCompanyMembershipRevision.Type;

export class CommerceCompanyMembershipRoster extends Schema.Class<CommerceCompanyMembershipRoster>(
  "CommerceCompanyMembershipRoster"
)({
  businessUnitId: CommerceBusinessUnitId,
  members: Schema.Array(CommerceCompanyMember),
  revision: CommerceCompanyMembershipRevision,
}) {}

export class CommerceCompanyMembershipChanged extends Schema.TaggedError<CommerceCompanyMembershipChanged>()(
  "CommerceCompanyMembershipChanged",
  {
    businessUnitId: CommerceBusinessUnitId,
    message: Schema.String,
  }
) {}

export interface RemoveCommerceCompanyMemberInput {
  readonly businessUnitId: CommerceBusinessUnitId;
  readonly customerId: CommerceCustomerId;
  readonly expectedRevision: CommerceCompanyMembershipRevision;
}

export interface CommerceCompanyMembershipsMemoryInput {
  readonly rosters?: readonly CommerceCompanyMembershipRoster[];
}

export class CommerceCompanyMemberships extends Context.Service<
  CommerceCompanyMemberships,
  {
    readonly getRoster: (
      businessUnitId: CommerceBusinessUnitId
    ) => Effect.Effect<
      CommerceCompanyMembershipRoster,
      CommerceAccountUnavailable
    >;
    readonly removeMember: (
      input: RemoveCommerceCompanyMemberInput
    ) => Effect.Effect<
      void,
      CommerceAccountUnavailable | CommerceCompanyMembershipChanged
    >;
  }
>()("@repo/commerce/CommerceCompanyMemberships") {
  static readonly layerMemoryFrom = ({
    rosters = [],
  }: CommerceCompanyMembershipsMemoryInput = {}) =>
    Layer.effect(
      CommerceCompanyMemberships,
      Effect.gen(function* () {
        const state = yield* SynchronizedRef.make(
          new Map(rosters.map((roster) => [roster.businessUnitId, roster]))
        );

        return CommerceCompanyMemberships.of({
          getRoster: (businessUnitId) =>
            SynchronizedRef.get(state).pipe(
              Effect.map(
                (current) =>
                  current.get(businessUnitId) ??
                  new CommerceCompanyMembershipRoster({
                    businessUnitId,
                    members: [],
                    revision: CommerceCompanyMembershipRevision.make("0"),
                  })
              )
            ),
          removeMember: (input) =>
            SynchronizedRef.updateEffect(state, (current) => {
              const roster =
                current.get(input.businessUnitId) ??
                new CommerceCompanyMembershipRoster({
                  businessUnitId: input.businessUnitId,
                  members: [],
                  revision: CommerceCompanyMembershipRevision.make("0"),
                });
              if (roster.revision !== input.expectedRevision) {
                return Effect.fail(
                  new CommerceCompanyMembershipChanged({
                    businessUnitId: input.businessUnitId,
                    message: "Company membership changed during removal",
                  })
                );
              }

              const member = roster.members.find(
                ({ customerId }) => customerId === input.customerId
              );
              const members =
                member?.directlyAssociated === true &&
                Schema.is(CompanyRoles)(member.inheritedRoles)
                  ? roster.members.map((currentMember) =>
                      currentMember.customerId === input.customerId
                        ? Schema.decodeUnknownSync(CommerceCompanyMember)({
                            ...Schema.encodeSync(CommerceCompanyMember)(
                              currentMember
                            ),
                            directlyAssociated: false,
                            roles: currentMember.inheritedRoles,
                          })
                        : currentMember
                    )
                  : roster.members.filter(
                      ({ customerId }) => customerId !== input.customerId
                    );
              const next = new CommerceCompanyMembershipRoster({
                businessUnitId: roster.businessUnitId,
                members,
                revision: CommerceCompanyMembershipRevision.make(
                  `${roster.revision}:next`
                ),
              });
              return Effect.succeed(
                new Map(current).set(input.businessUnitId, next)
              );
            }),
        });
      })
    );

  static readonly layerMemory = CommerceCompanyMemberships.layerMemoryFrom();
}
