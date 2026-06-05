import { describe, expect, test } from "vitest";
import {
  decodeAnonymousCartCookie,
  encodeAnonymousCartCookie,
  getAnonymousCartCookieContextByLocale,
  getAnonymousCartIdFromCookieValue,
  makeAnonymousCartCookie,
} from "./anonymous-cart-cookies";

const context = {
  currency: "USD",
  locale: "en-US",
  storeKey: "default-store",
} as const;

describe("anonymous cart cookies", () => {
  test("encodes a schema-backed cart cookie with store, locale, currency, and cart id", () => {
    const cookie = makeAnonymousCartCookie({
      cartId: "cart-1",
      context,
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
        context,
      })
    );

    expect(getAnonymousCartIdFromCookieValue(encoded, context)).toBe("cart-1");
    expect(
      getAnonymousCartIdFromCookieValue(encoded, {
        ...context,
        currency: "EUR",
      })
    ).toBeNull();
    expect(
      getAnonymousCartIdFromCookieValue(encoded, {
        ...context,
        locale: "en-GB",
      })
    ).toBeNull();
    expect(
      getAnonymousCartIdFromCookieValue(encoded, {
        ...context,
        storeKey: "de-fr-uk",
      })
    ).toBeNull();
  });

  test("ignores malformed cart cookie values", () => {
    expect(getAnonymousCartIdFromCookieValue("not-json", context)).toBeNull();
    expect(getAnonymousCartIdFromCookieValue("", context)).toBeNull();
    expect(getAnonymousCartIdFromCookieValue(undefined, context)).toBeNull();
  });

  test("derives the cart cookie context from locale using store mappings", () => {
    expect(getAnonymousCartCookieContextByLocale("en-GB")).toEqual({
      currency: "GBP",
      locale: "en-GB",
      storeKey: "de-fr-uk",
    });
  });
});
