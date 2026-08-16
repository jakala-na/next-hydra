import { CartId } from "@repo/commerce/domain/cart";
import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  contact:
    vi.fn<(previousResult: unknown, formData: FormData) => Promise<unknown>>(),
  delivery:
    vi.fn<(previousResult: unknown, formData: FormData) => Promise<unknown>>(),
  revalidatePath: vi.fn<(path: string) => void>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/i18n", () => ({
  getLocale: () => "en-US",
  getTranslations: () => (key: string) => key,
}));
vi.mock("next/headers", () => ({ cookies: vi.fn<() => void>() }));
vi.mock("next/server", () => ({ connection: vi.fn<() => void>() }));
vi.mock("./commerce-runtime", () => ({ CommerceActions: {} }));
vi.mock("@repo/commerce/cart/procedures", () => ({
  makeCartProcedures: () => ({
    addToCartProcedure: { toAction: () => vi.fn<() => void>() },
    changeCartItemsQuantityProcedure: { toAction: () => vi.fn<() => void>() },
    removeCartItemProcedure: { toAction: () => vi.fn<() => void>() },
  }),
}));
vi.mock("@repo/commerce/checkout/procedures", () => ({
  makeCheckoutProcedures: () => ({
    saveCheckoutContactProcedure: {
      toFormAction: () => boundary.contact,
    },
    saveCheckoutDeliveryDetailsProcedure: {
      toFormAction: () => boundary.delivery,
    },
  }),
}));
vi.mock("./app-runtime", async () => {
  const { NextServer } = await import("@repo/actions/next-server");
  const { Effect, Layer, ManagedRuntime } = await import("effect");
  const { NextRequestApi } = await import("./next-request");
  const testLayer = Layer.mergeAll(
    Layer.succeed(NextRequestApi, {
      connect: () => Effect.void,
      getCookies: () => Effect.die("not used"),
      getLocale: () => Effect.succeed("en-US" as const),
    }),
    Layer.succeed(NextServer, {
      revalidatePath: (path) =>
        Effect.sync(() => boundary.revalidatePath(path)),
    })
  );

  return { AppRuntime: ManagedRuntime.make(testLayer) };
});

const { saveCheckoutContact, saveCheckoutDeliveryDetails } =
  await import("./commerce-actions");

describe("Commerce action cache policy", () => {
  beforeEach(() => {
    boundary.contact.mockReset();
    boundary.delivery.mockReset();
    boundary.revalidatePath.mockClear();
  });

  it("revalidates Checkout after success and state conflicts", async () => {
    boundary.contact.mockResolvedValueOnce({
      _tag: "Success",
      success: {},
    });
    await saveCheckoutContact(null, new FormData());

    boundary.contact.mockResolvedValueOnce({
      _tag: "Failure",
      failure: {
        displayMessage: "Checkout changed",
        error: {
          _tag: "CheckoutVersionConflict",
          cartId: CartId.make("cart-1"),
          message: "Checkout changed",
        },
      },
    });
    await saveCheckoutContact(null, new FormData());

    expect(boundary.revalidatePath).toHaveBeenCalledTimes(2);
    expect(boundary.revalidatePath).toHaveBeenCalledWith("/en-US/checkout");
  });

  it("does not revalidate for ordinary validation failures", async () => {
    boundary.contact.mockResolvedValueOnce({
      _tag: "Failure",
      failure: {
        displayMessage: "Invalid input",
        error: {
          _tag: "CheckoutMutationSchemaFailure",
          message: "Invalid input",
        },
      },
    });

    await saveCheckoutContact(null, new FormData());

    expect(boundary.revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates provider failures only when an Address Book entry may have changed", async () => {
    boundary.delivery.mockResolvedValueOnce({
      _tag: "Failure",
      failure: {
        displayMessage: "Provider failure",
        error: {
          _tag: "CheckoutMutationProviderFailure",
          addressBookReference: "office",
          message: "Provider failure",
          operation: "saveDeliveryDetails",
        },
      },
    });
    await saveCheckoutDeliveryDetails(null, new FormData());

    boundary.delivery.mockResolvedValueOnce({
      _tag: "Failure",
      failure: {
        displayMessage: "Provider failure",
        error: {
          _tag: "CheckoutMutationProviderFailure",
          message: "Provider failure",
          operation: "saveDeliveryDetails",
        },
      },
    });
    await saveCheckoutDeliveryDetails(null, new FormData());

    expect(boundary.revalidatePath).toHaveBeenCalledOnce();
  });
});
