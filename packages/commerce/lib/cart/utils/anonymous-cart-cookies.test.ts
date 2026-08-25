import { describe, expect, test } from "vitest";

import { CurrencyCode } from "../../../domain/money";
import { CommerceLocale, Store, StoreKey } from "../../../store";
import {
  decodeAnonymousCartCookie,
  encodeAnonymousCartCookie,
  getAnonymousCartIdFromCookieValue,
  makeAnonymousCartCookie,
} from "./anonymous-cart-cookies";

const store = new Store({
  currency: CurrencyCode.make("USD"),
  locale: CommerceLocale.make("en-US"),
  storeKey: StoreKey.make("default-store"),
});

describe("anonymous cart cookies", () => {
  test("encodes a schema-backed cart cookie with store, locale, currency, and cart id", () => {
    const cookie = makeAnonymousCartCookie({
      cartId: "cart-1",
      store,
    });

    const encoded = encodeAnonymousCartCookie(cookie);
    const decoded = decodeAnonymousCartCookie(encoded);

    expect(encoded).not.toContain('"');
    expect(decoded).toMatchObject({
      cartId: "cart-1",
      currency: "USD",
      locale: "en-US",
      storeKey: "default-store",
    });
  });

  test("returns the cart id only when the cookie matches the current cart context", () => {
    const encoded = encodeAnonymousCartCookie(
      makeAnonymousCartCookie({
        cartId: "cart-1",
        store,
      })
    );

    expect(getAnonymousCartIdFromCookieValue(encoded, store)).toBe("cart-1");
    expect(
      getAnonymousCartIdFromCookieValue(
        encoded,
        new Store({ ...store, currency: CurrencyCode.make("EUR") })
      )
    ).toBeNull();
    expect(
      getAnonymousCartIdFromCookieValue(
        encoded,
        new Store({ ...store, locale: CommerceLocale.make("en-GB") })
      )
    ).toBeNull();
    expect(
      getAnonymousCartIdFromCookieValue(
        encoded,
        new Store({ ...store, storeKey: StoreKey.make("de-fr-uk") })
      )
    ).toBeNull();
  });

  test("ignores malformed cart cookie values", () => {
    expect(getAnonymousCartIdFromCookieValue("not-json", store)).toBeNull();
    expect(getAnonymousCartIdFromCookieValue("", store)).toBeNull();
    expect(getAnonymousCartIdFromCookieValue(undefined, store)).toBeNull();
  });
});
