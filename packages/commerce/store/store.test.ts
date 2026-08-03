import { describe, expect, it } from "vitest";
import { CurrencyCode } from "../domain/money";
import {
  CommerceLocale,
  resolveStore,
  type StoreConfiguration,
  StoreKey,
} from "./index";

const enUs = CommerceLocale.make("en-US");
const selectableStores = [
  {
    storeKey: StoreKey.make("default-store"),
    locale: enUs,
    currency: CurrencyCode.make("USD"),
    isDefault: true,
  },
  {
    storeKey: StoreKey.make("wholesale-store"),
    locale: enUs,
    currency: CurrencyCode.make("USD"),
    isDefault: false,
  },
  {
    storeKey: StoreKey.make("europe-store"),
    locale: CommerceLocale.make("en-GB"),
    currency: CurrencyCode.make("GBP"),
    isDefault: true,
  },
] satisfies StoreConfiguration;

describe("resolveStore", () => {
  it("resolves the locale's configured default Store", () => {
    const store = resolveStore({ locale: CommerceLocale.make("en-GB") });

    expect(store).toEqual({
      storeKey: "de-fr-uk",
      locale: "en-GB",
      currency: "GBP",
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
