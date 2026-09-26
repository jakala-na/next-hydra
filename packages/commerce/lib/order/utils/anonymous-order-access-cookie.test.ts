import { describe, expect, it } from "vitest";

import { CartId } from "../../../domain/cart";
import { OrderId } from "../../../domain/order";
import {
  AnonymousOrderAccessCookie,
  decodeAnonymousOrderAccessCookie,
  encodeAnonymousOrderAccessCookie,
} from "./anonymous-order-access-cookie";

describe("anonymous Order access cookie", () => {
  it("round trips the Order capability and ignores malformed values", () => {
    const cookie = new AnonymousOrderAccessCookie({
      cartId: CartId.make("cart-from-input"),
      orderId: OrderId.make("order-from-provider"),
    });

    expect(
      decodeAnonymousOrderAccessCookie(encodeAnonymousOrderAccessCookie(cookie))
    ).toStrictEqual(cookie);
    expect(decodeAnonymousOrderAccessCookie("not-json")).toBeUndefined();
  });
});
