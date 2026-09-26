import { ActionClient, ActionMiddleware } from "@repo/actions";
import type { EmptyActionContext } from "@repo/actions";
import { makeCartProcedures } from "@repo/commerce/cart/procedures";
import { getBusinessUnitIdFromCookieValue } from "@repo/commerce/commerce-context/business-unit-cookie";
import { canSelectBusinessUnit } from "@repo/commerce/commerce-context/can-select-business-unit";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import { makeHeaderCommerceLayer } from "@repo/commerce/runtime/header-layer";
import { CartPolicies } from "@repo/commerce/services/cart-policies";
import { Carts } from "@repo/commerce/services/carts";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { CurrentCart } from "@repo/commerce/services/current-cart";
import { StoreKey } from "@repo/commerce/store";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer, ManagedRuntime, Option } from "effect";
import { describe, expect, it } from "vitest";

import { makeCommerceRequest } from "./commerce-request-input";

function testHeader(userId?: string, businessUnitId?: string) {
  const writes: string[] = [];
  const cookieStore = {
    delete: (name: string) => {
      writes.push(name);
    },
    get: (name: string) =>
      name === "business-unit-id" && businessUnitId !== undefined
        ? { value: businessUnitId }
        : undefined,
    set: (name: string, value: string) => {
      writes.push(`${name}=${value}`);
    },
  };
  const accounts = CommerceAccounts.layerMemoryFrom({
    businessUnitMemberships: ["business-1", "business-2"].map((id) => ({
      customerId: CommerceCustomerId.make("customer-1"),
      membership: new CommerceBusinessUnitMembership({
        businessUnitId: CommerceBusinessUnitId.make(id),
        businessUnitKey: CommerceBusinessUnitKey.make(id),
        businessUnitLabel: CommerceBusinessUnitLabel.make(id),
        roles: ["buyer"],
      }),
      storeKey: StoreKey.make("default-store"),
    })),
    customers: [
      {
        authUserId: AuthUserId.make("user-1"),
        customerId: CommerceCustomerId.make("customer-1"),
      },
    ],
  });
  const layer = Layer.unwrap(
    makeCommerceRequest("en-US", cookieStore, userId).pipe(
      Effect.orDie,
      Effect.map((request) =>
        makeHeaderCommerceLayer(request).pipe(
          Layer.provideMerge(accounts),
          Layer.provide(Carts.layerMemory()),
          Layer.provide(CartPolicies.layer)
        )
      )
    )
  );
  return { layer, writes };
}

describe("composed header commerce boundary", () => {
  it("reads an anonymous cart without auth, checkout, or payment services", async () => {
    const { layer, writes } = testHeader();
    const cart = await Effect.runPromise(
      CurrentCart.get().pipe(Effect.provide(layer))
    );
    expect(Option.isNone(cart)).toBeTruthy();
    expect(writes).toStrictEqual([]);
  });

  it("resolves authenticated business context using the catalog request builder", async () => {
    const { layer } = testHeader("user-1", "business-2");
    const context = await Effect.runPromise(
      CommerceContext.pipe(Effect.provide(layer))
    );
    expect(context.principal).toMatchObject({
      _tag: "CustomerCommercePrincipal",
      businessUnitId: "business-2",
    });
  });

  it("reuses cart procedure input validation with only header services", async () => {
    const { layer, writes } = testHeader();
    const runtime = ManagedRuntime.make(Layer.empty);
    try {
      const context = ActionMiddleware.context<
        EmptyActionContext,
        { readonly locale: Locale }
      >(() => Effect.succeed({ locale: "en-US" }));
      const actions = ActionClient.make(runtime)
        .use(context)
        .provide(() => layer);
      const result = await makeCartProcedures(
        actions
      ).addToCartProcedure.toAction()({
        productId: "",
        quantity: 0,
        variantId: "1",
      });
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "InputInvalid" },
      });
      expect(writes).toStrictEqual([]);
    } finally {
      await runtime.dispose();
    }
  });

  it("permits a verified business-unit membership", async () => {
    const { layer } = testHeader("user-1");
    const allowed = await Effect.runPromise(
      canSelectBusinessUnit(CommerceBusinessUnitId.make("business-2")).pipe(
        Effect.provide(layer)
      )
    );
    expect(allowed).toBeTruthy();
  });

  it.each(["another-company", "business-2"])(
    "rejects an anonymous switch to %s",
    async (id) => {
      const { layer } = testHeader();
      const allowed = await Effect.runPromise(
        canSelectBusinessUnit(CommerceBusinessUnitId.make(id)).pipe(
          Effect.provide(layer)
        )
      );
      expect(allowed).toBeFalsy();
    }
  );

  it("rejects another customer's business unit", async () => {
    const { layer } = testHeader("user-1");
    const allowed = await Effect.runPromise(
      canSelectBusinessUnit(
        CommerceBusinessUnitId.make("another-company")
      ).pipe(Effect.provide(layer))
    );
    expect(allowed).toBeFalsy();
  });

  it("rejects an invalid selector before requesting services", () => {
    expect(getBusinessUnitIdFromCookieValue("")).toBeUndefined();
  });
});
