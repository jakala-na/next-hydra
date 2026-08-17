import { Context, Effect, Layer } from "effect";

import type {
  CommerceBusinessUnitMembership,
  CommerceCustomerProfile,
} from "../domain/commerce-account";
import {
  AnonymousCommerceContextRequest,
  AnonymousCommercePrincipal,
  type CommerceContextRequest,
  type CommercePrincipal,
  CommerceRequestContextNotFound,
  type CustomerCommerceContextRequest,
  CustomerCommercePrincipal,
} from "../domain/commerce-request-context";
import type { Store } from "../store";
import {
  type CommerceAccountUnavailable,
  CommerceAccounts,
  type CommerceCustomerProfileNotFound,
} from "./commerce-accounts";

export type CommerceContextProfileFailure =
  | CommerceRequestContextNotFound
  | CommerceCustomerProfileNotFound
  | CommerceAccountUnavailable;

const noBuyingContext = () =>
  new CommerceRequestContextNotFound({
    message:
      "A verified Business Unit Buying Context does not exist for this customer and Store",
    reason: "noBuyingContext",
  });

const selectBusinessUnit = (
  memberships: readonly CommerceBusinessUnitMembership[],
  requestedBusinessUnitId:
    | CustomerCommerceContextRequest["businessUnitId"]
    | undefined
) => {
  const selectedMembership =
    requestedBusinessUnitId === undefined
      ? undefined
      : memberships.find(
          ({ businessUnitId }) => businessUnitId === requestedBusinessUnitId
        );

  return selectedMembership ?? memberships[0];
};

export class CommerceContext extends Context.Service<
  CommerceContext,
  {
    readonly store: Store;
    readonly principal: CommercePrincipal;
    readonly customerPrincipal: () => Effect.Effect<
      CustomerCommercePrincipal,
      CommerceRequestContextNotFound
    >;
    readonly customerProfile: () => Effect.Effect<
      CommerceCustomerProfile,
      CommerceContextProfileFailure
    >;
  }
>()("@repo/commerce/CommerceContext") {
  static readonly customerPrincipal = Effect.fn(
    "CommerceContext.customerPrincipal"
  )(() =>
    Effect.flatMap(CommerceContext, (context) => context.customerPrincipal())
  );

  static readonly customerProfile = Effect.fn(
    "CommerceContext.customerProfile"
  )(() =>
    Effect.flatMap(CommerceContext, (context) => context.customerProfile())
  );

  static readonly layer = (request: CommerceContextRequest) =>
    Layer.effect(
      CommerceContext,
      Effect.gen(function* () {
        const accounts = yield* CommerceAccounts;
        const principal: CommercePrincipal =
          request instanceof AnonymousCommerceContextRequest
            ? new AnonymousCommercePrincipal({
                ...(request.anonymousCartId === undefined
                  ? {}
                  : { anonymousCartId: request.anonymousCartId }),
              })
            : yield* Effect.gen(function* () {
                const customerId = yield* accounts
                  .getCustomerIdByAuthUserId(request.authUserId)
                  .pipe(
                    Effect.catchTag(
                      "CommerceCustomerIdNotFound",
                      () =>
                        new CommerceRequestContextNotFound({
                          message:
                            "Commerce customer mapping does not exist for the authenticated user",
                          reason: "noCustomerMapping",
                        })
                    )
                  );
                const memberships =
                  yield* accounts.listBusinessUnitMembershipsForCustomerInStore(
                    customerId,
                    request.store.storeKey
                  );
                const businessUnit = selectBusinessUnit(
                  memberships,
                  request.businessUnitId
                );
                if (businessUnit === undefined) {
                  return yield* noBuyingContext();
                }

                return new CustomerCommercePrincipal({
                  authUserId: request.authUserId,
                  customerId,
                  businessUnitId: businessUnit.businessUnitId,
                  businessUnitKey: businessUnit.businessUnitKey,
                });
              });
        const customerPrincipal: Effect.Effect<
          CustomerCommercePrincipal,
          CommerceRequestContextNotFound
        > =
          principal instanceof CustomerCommercePrincipal
            ? Effect.succeed(principal)
            : Effect.fail(
                new CommerceRequestContextNotFound({
                  message:
                    "The current Commerce Context does not have an authenticated customer",
                  reason: "noPrincipal",
                })
              );

        return CommerceContext.of({
          store: request.store,
          principal,
          customerPrincipal: () => customerPrincipal,
          customerProfile: () =>
            customerPrincipal.pipe(
              Effect.flatMap((resolvedCustomerPrincipal) =>
                accounts.getCustomerProfile(
                  resolvedCustomerPrincipal.customerId
                )
              )
            ),
        });
      })
    );
}
