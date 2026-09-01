import { NextServer } from "@repo/actions/next-server";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import {
  shouldRevalidateContact,
  shouldRevalidateDeliveryDetails,
  shouldRevalidateShippingOptions,
} from "./commerce-action-cache-policy";
import { NextRequestApi } from "./next-request-api";

describe("Commerce action cache policy", () => {
  it("revalidates Checkout after success and state conflicts", () => {
    expect(shouldRevalidateContact({ _tag: "Success" })).toBeTruthy();
    expect(
      shouldRevalidateContact({
        _tag: "Failure",
        failure: { error: { _tag: "CheckoutVersionConflict" } },
      })
    ).toBeTruthy();
  });

  it("does not revalidate for ordinary validation failures", () => {
    expect(
      shouldRevalidateContact({
        _tag: "Failure",
        failure: { error: { _tag: "CheckoutMutationSchemaFailure" } },
      })
    ).toBeFalsy();
  });

  it("keeps incomplete Customer Profile recovery in the current form", () => {
    expect(
      shouldRevalidateContact({
        _tag: "Failure",
        failure: { error: { _tag: "CheckoutCustomerProfileIncomplete" } },
      })
    ).toBeFalsy();
  });

  it("revalidates Checkout after an ambiguous mutation outcome", () => {
    expect(
      shouldRevalidateContact({
        _tag: "Failure",
        failure: { error: { _tag: "CheckoutMutationOutcomeUnknown" } },
      })
    ).toBeTruthy();
  });

  it("revalidates after Shipping Options were saved but the refreshed quote failed", () => {
    expect(
      shouldRevalidateShippingOptions({
        _tag: "Failure",
        failure: {
          error: { _tag: "CheckoutShippingOptionsRefreshRequired" },
        },
      })
    ).toBeTruthy();
  });

  it("revalidates provider failures only when an Address Book entry may have changed", () => {
    expect(
      shouldRevalidateDeliveryDetails({
        _tag: "Failure",
        failure: {
          error: {
            _tag: "CheckoutMutationProviderFailure",
            addressBookReference: "office",
          },
        },
      })
    ).toBeTruthy();
    expect(
      shouldRevalidateDeliveryDetails({
        _tag: "Failure",
        failure: { error: { _tag: "CheckoutMutationProviderFailure" } },
      })
    ).toBeFalsy();
  });

  it("revalidates Checkout through NextRequestApi and NextServer Layers", async () => {
    const paths: string[] = [];
    const layer = Layer.mergeAll(
      Layer.succeed(NextRequestApi, {
        connect: () => Effect.void,
        getCookies: () => Effect.die("not used"),
        getLocale: () => Effect.succeed("en-US" as const),
      }),
      Layer.succeed(NextServer, {
        refresh: () => Effect.void,
        revalidatePath: (path) => Effect.sync(() => paths.push(path)),
      })
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const request = yield* NextRequestApi;
        const next = yield* NextServer;
        const locale = yield* request.getLocale();
        yield* next.revalidatePath(`/${locale}/checkout`);
      }).pipe(Effect.provide(layer))
    );

    expect(paths).toStrictEqual(["/en-US/checkout"]);
  });
});
