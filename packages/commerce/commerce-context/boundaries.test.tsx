import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
} from "../domain/commerce-account";
import {
  AuthUserId,
  CustomerCommercePrincipal,
} from "../domain/commerce-request-context";
import { CommerceAccounts } from "../services/commerce-accounts";
import { CommerceContext } from "../services/commerce-context";
import { CommerceLocale, Store, StoreKey } from "../store";
import { selectBusinessUnit } from "./actions";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  BUSINESS_UNIT_COOKIE_OPTIONS,
} from "./business-unit-cookie";
import { BusinessUnitSwitcher } from "./business-unit-switcher";

const boundary = vi.hoisted(() => ({
  refresh: vi.fn(),
  requestLayer: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/design-system/components/layout/business-unit-switcher", () => ({
  BusinessUnitSwitcher: () => null,
}));
vi.mock("./request", () => ({
  commerceRequestLayer: boundary.requestLayer,
}));
vi.mock("next/cache", () => ({ refresh: boundary.refresh }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: boundary.setCookie }),
}));

const store = new Store({
  locale: CommerceLocale.make("en-US"),
  storeKey: StoreKey.make("default-store"),
  currency: "USD",
});
const customerId = CommerceCustomerId.make("customer-1");
const memberships = [
  new CommerceBusinessUnitMembership({
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
    businessUnitLabel: CommerceBusinessUnitLabel.make("Business Unit One"),
  }),
  new CommerceBusinessUnitMembership({
    businessUnitId: CommerceBusinessUnitId.make("business-unit-2"),
    businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-2"),
    businessUnitLabel: CommerceBusinessUnitLabel.make("Business Unit Two"),
  }),
] as const;
const principal = new CustomerCommercePrincipal({
  authUserId: AuthUserId.make("auth-user-1"),
  customerId,
  businessUnitId: memberships[1].businessUnitId,
  businessUnitKey: memberships[1].businessUnitKey,
});

const buyingContextLayer = () =>
  Layer.merge(
    Layer.succeed(
      CommerceContext,
      CommerceContext.of({
        store,
        principal,
        customerPrincipal: () => Effect.succeed(principal),
        customerProfile: () => Effect.die("not used"),
      })
    ),
    CommerceAccounts.layerMemoryFrom({
      businessUnitMemberships: memberships.map((membership) => ({
        customerId,
        storeKey: store.storeKey,
        membership,
      })),
    })
  );

beforeEach(() => {
  boundary.refresh.mockClear();
  boundary.requestLayer.mockReset();
  boundary.requestLayer.mockImplementation(async () => buyingContextLayer());
  boundary.setCookie.mockClear();
});

describe("Buying Context boundaries", () => {
  it("presents verified Business Unit labels from the resolved Commerce Context", async () => {
    const switcher = await BusinessUnitSwitcher({ locale: "en-US" });

    expect(boundary.requestLayer).toHaveBeenCalledOnce();
    expect(switcher?.props).toMatchObject({
      currentBusinessUnitId: "business-unit-2",
      items: [
        { id: "business-unit-1", label: "Business Unit One" },
        { id: "business-unit-2", label: "Business Unit Two" },
      ],
      onSwitchBusinessUnit: selectBusinessUnit,
    });
  });

  it("persists a structurally valid Business Unit ID selector and refreshes the current route", async () => {
    await selectBusinessUnit("");

    expect(boundary.setCookie).not.toHaveBeenCalled();
    expect(boundary.refresh).not.toHaveBeenCalled();

    await selectBusinessUnit("business-unit-1");

    expect(boundary.setCookie).toHaveBeenCalledExactlyOnceWith(
      BUSINESS_UNIT_COOKIE_NAME,
      "business-unit-1",
      BUSINESS_UNIT_COOKIE_OPTIONS
    );
    expect(boundary.refresh).toHaveBeenCalledOnce();
  });
});
