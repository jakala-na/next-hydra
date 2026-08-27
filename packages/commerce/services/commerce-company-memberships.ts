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

export class CommerceCompanyMemberRemainingMembership extends Schema.Class<CommerceCompanyMemberRemainingMembership>(
  "CommerceCompanyMemberRemainingMembership"
)({
  businessUnitId: CommerceBusinessUnitId,
  roles: CompanyRoles,
}) {}

export class DeletedCommerceCompanyMemberRemoval extends Schema.Class<DeletedCommerceCompanyMemberRemoval>(
  "DeletedCommerceCompanyMemberRemoval"
)({
  customerDisposition: Schema.Literal("deleted"),
}) {}

export class RetainedCommerceCompanyMemberRemoval extends Schema.Class<RetainedCommerceCompanyMemberRemoval>(
  "RetainedCommerceCompanyMemberRemoval"
)({
  customerDisposition: Schema.Literal("retained"),
  remainingMembership: CommerceCompanyMemberRemainingMembership,
}) {}

export const CommerceCompanyMemberRemoval = Schema.Union([
  DeletedCommerceCompanyMemberRemoval,
  RetainedCommerceCompanyMemberRemoval,
]);
export type CommerceCompanyMemberRemoval =
  typeof CommerceCompanyMemberRemoval.Type;

const removalForRemainingMember = (
  member: CommerceCompanyMember | undefined
) => {
  if (member === undefined) {
    return new DeletedCommerceCompanyMemberRemoval({
      customerDisposition: "deleted",
    });
  }

  return new RetainedCommerceCompanyMemberRemoval({
    customerDisposition: "retained",
    remainingMembership: new CommerceCompanyMemberRemainingMembership({
      businessUnitId: member.businessUnitId,
      roles: member.roles,
    }),
  });
};

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
      CommerceCompanyMemberRemoval,
      CommerceAccountUnavailable | CommerceCompanyMembershipChanged
    >;
    readonly reconcileCustomerDisposition: (
      customerId: CommerceCustomerId
    ) => Effect.Effect<
      CommerceCompanyMemberRemoval,
      CommerceAccountUnavailable
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
          reconcileCustomerDisposition: (customerId) =>
            SynchronizedRef.get(state).pipe(
              Effect.map((current) => {
                const remainingMember = [...current.values()]
                  .flatMap((candidate) => candidate.members)
                  .find((member) => member.customerId === customerId);

                return removalForRemainingMember(remainingMember);
              })
            ),
          removeMember: (input) =>
            SynchronizedRef.modifyEffect(state, (current) => {
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
              const updated = new Map(current).set(input.businessUnitId, next);
              const remainingMember = [...updated.values()]
                .flatMap((candidate) => candidate.members)
                .find(({ customerId }) => customerId === input.customerId);

              return Effect.succeed([
                removalForRemainingMember(remainingMember),
                updated,
              ] as const);
            }),
        });
      })
    );

  static readonly layerMemory = CommerceCompanyMemberships.layerMemoryFrom();
}
