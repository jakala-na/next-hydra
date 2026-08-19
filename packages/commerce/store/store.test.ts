import { describe, expect, it } from "vitest";

import { CurrencyCode } from "../domain/money";
import { CommerceLocale, resolveStore, StoreKey } from "./index";
import type { StoreConfiguration } from "./index";

const enUs = CommerceLocale.make("en-US");
const selectableStores = [
  {
    currency: CurrencyCode.make("USD"),
    isDefault: true,
    locale: enUs,
    storeKey: StoreKey.make("default-store"),
  },
  {
    currency: CurrencyCode.make("USD"),
    isDefault: false,
    locale: enUs,
    storeKey: StoreKey.make("wholesale-store"),
  },
  {
    currency: CurrencyCode.make("GBP"),
    isDefault: true,
    locale: CommerceLocale.make("en-GB"),
    storeKey: StoreKey.make("europe-store"),
  },
] satisfies StoreConfiguration;

describe(resolveStore, () => {
  it("resolves the locale's configured default Store", () => {
    const store = resolveStore({ locale: CommerceLocale.make("en-GB") });

    expect(store).toEqual({
      currency: "GBP",
      locale: "en-GB",
      storeKey: "de-fr-uk",
    });
  });

  it("resolves an explicitly selected eligible Store", () => {
    const store = resolveStore(
      {
        locale: enUs,
        selectedStoreKey: StoreKey.make("wholesale-store"),
      },
      selectableStores
    );

    expect(store.storeKey).toBe("wholesale-store");
  });

  it("falls back when a configured Store is not eligible for the locale", () => {
    const store = resolveStore(
      {
        locale: enUs,
        selectedStoreKey: StoreKey.make("europe-store"),
      },
      selectableStores
    );

    expect(store.storeKey).toBe("default-store");
  });

  it("falls back when a selected Store is not configured", () => {
    const store = resolveStore(
      {
        locale: enUs,
        selectedStoreKey: StoreKey.make("tampered-store"),
      },
      selectableStores
    );

    expect(store.storeKey).toBe("default-store");
  });
});
