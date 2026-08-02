import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Redacted } from "effect";
import { StoreKey } from "../domain/cart";
import { CartStore } from "../domain/cart-snapshot";
import { CheckoutLocale } from "../domain/checkout";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "../domain/commerce-account";
import {
  AnonymousCommerceContextRequest,
  AuthUserId,
  CustomerCommerceContextRequest,
  CustomerCommercePrincipal,
} from "../domain/commerce-request-context";
import { CommerceAccounts } from "./commerce-accounts";
import { CommerceContext } from "./commerce-context";

const customerId = CommerceCustomerId.make("customer-1");
const store = new CartStore({
  locale: CheckoutLocale.make("en-US"),
  storeKey: StoreKey.make("default-store"),
  currency: "USD",
});
const authUserId = AuthUserId.make("user-1");
const businessUnit = new CommerceBusinessUnitMembership({
  businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
  businessUnitLabel: CommerceBusinessUnitLabel.make("Business Unit One"),
});
const customerRequest = new CustomerCommerceContextRequest({
  store,
  authUserId,
});
const customerProfile = new CommerceCustomerProfile({
  customerId,
  email: Redacted.make("buyer@example.com", { label: "email" }),
  firstName: Redacted.make("Hydra", { label: "personName" }),
  lastName: Redacted.make("Buyer", { label: "personName" }),
});

const provideCommerceContext = <A, E>(
  program: Effect.Effect<A, E, CommerceContext>,
  request:
    | AnonymousCommerceContextRequest
    | CustomerCommerceContextRequest = customerRequest,
  memberships: readonly CommerceBusinessUnitMembership[] = [businessUnit]
) =>
  program.pipe(
    Effect.provide(
      CommerceContext.layer(request).pipe(
        Layer.provide(
          CommerceAccounts.layerMemoryFrom({
            customerProfiles: [customerProfile],
            customers: [{ authUserId, customerId }],
            businessUnitMemberships: memberships.map((membership) => ({
              customerId,
              storeKey: store.storeKey,
              membership,
            })),
          })
        )
      )
    )
  );

describe("CommerceContext", () => {
  it.effect("owns the current customer and profile", () =>
    provideCommerceContext(
      Effect.gen(function* () {
        expect(yield* CommerceContext.customerPrincipal()).toEqual(
          new CustomerCommercePrincipal({
            authUserId,
            customerId,
            businessUnitId: businessUnit.businessUnitId,
            businessUnitKey: businessUnit.businessUnitKey,
          })
        );
        expect(yield* CommerceContext.customerProfile()).toEqual(
          customerProfile
        );
        const context = yield* CommerceContext;
        expect(context.store).toEqual(store);
      })
    )
  );

  it.effect("reports that an anonymous request has no current customer", () =>
    provideCommerceContext(
      Effect.gen(function* () {
        const customerError = yield* Effect.flip(
          CommerceContext.customerPrincipal()
        );
        expect(customerError).toMatchObject({
          _tag: "CommerceRequestContextNotFound",
          reason: "noPrincipal",
        });

        const profileError = yield* Effect.flip(
          CommerceContext.customerProfile()
        );
        expect(profileError).toMatchObject({
          _tag: "CommerceRequestContextNotFound",
          reason: "noPrincipal",
        });
      }),
      new AnonymousCommerceContextRequest({ store })
    )
  );

  it.effect("uses an explicitly selected Business Unit", () => {
    const selected = new CommerceBusinessUnitMembership({
      businessUnitId: CommerceBusinessUnitId.make("business-unit-2"),
      businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-2"),
      businessUnitLabel: CommerceBusinessUnitLabel.make("Business Unit Two"),
    });

    return provideCommerceContext(
      Effect.gen(function* () {
        const customerPrincipal = yield* CommerceContext.customerPrincipal();
        expect(customerPrincipal.businessUnitId).toBe(selected.businessUnitId);
      }),
      new CustomerCommerceContextRequest({
        store,
        authUserId,
        businessUnitId: selected.businessUnitId,
      }),
      [businessUnit, selected]
    );
  });

  it.effect(
    "rejects a selected Business Unit outside the Store membership",
    () =>
      Effect.void.pipe(
        Effect.provide(
          CommerceContext.layer(
            new CustomerCommerceContextRequest({
              store,
              authUserId,
              businessUnitId: CommerceBusinessUnitId.make("business-unit-2"),
            })
          ).pipe(
            Layer.provide(
              CommerceAccounts.layerMemoryFrom({
                customers: [{ authUserId, customerId }],
                businessUnitMemberships: [
                  {
                    customerId,
                    storeKey: store.storeKey,
                    membership: businessUnit,
                  },
                ],
              })
            )
          )
        ),
        Effect.flip,
        Effect.tap((error) => {
          expect(error).toMatchObject({
            _tag: "CommerceRequestContextNotFound",
            reason: "noBuyingContext",
          });
          return Effect.void;
        })
      )
  );

  it.effect(
    "requires a selection when multiple Business Units are eligible",
    () => {
      const second = new CommerceBusinessUnitMembership({
        businessUnitId: CommerceBusinessUnitId.make("business-unit-2"),
        businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-2"),
        businessUnitLabel: CommerceBusinessUnitLabel.make("Business Unit Two"),
      });

      return Effect.void.pipe(
        Effect.provide(
          CommerceContext.layer(customerRequest).pipe(
            Layer.provide(
              CommerceAccounts.layerMemoryFrom({
                customers: [{ authUserId, customerId }],
                businessUnitMemberships: [businessUnit, second].map(
                  (membership) => ({
                    customerId,
                    storeKey: store.storeKey,
                    membership,
                  })
                ),
              })
            )
          )
        ),
        Effect.flip,
        Effect.tap((error) => {
          expect(error).toMatchObject({
            _tag: "CommerceRequestContextNotFound",
            reason: "noBuyingContext",
          });
          return Effect.void;
        })
      );
    }
  );
});
