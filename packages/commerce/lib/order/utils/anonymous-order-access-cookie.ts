import { Option, Schema } from "effect";

import { CartId } from "../../../domain/cart";
import { OrderId } from "../../../domain/order";

export const ANONYMOUS_ORDER_ACCESS_COOKIE_NAME = "order-access";
const ORDER_ACCESS_COOKIE_MAX_AGE_DAYS = 90;

export class AnonymousOrderAccessCookie extends Schema.Class<AnonymousOrderAccessCookie>(
  "AnonymousOrderAccessCookie"
)({
  cartId: CartId,
  orderId: OrderId,
}) {}

const AnonymousOrderAccessCookieJson = Schema.fromJsonString(
  AnonymousOrderAccessCookie
);

export const encodeAnonymousOrderAccessCookie = (
  cookie: AnonymousOrderAccessCookie
): string =>
  encodeURIComponent(Schema.encodeSync(AnonymousOrderAccessCookieJson)(cookie));

export const decodeAnonymousOrderAccessCookie = (
  value: string | undefined
): AnonymousOrderAccessCookie | undefined => {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  try {
    return Option.getOrUndefined(
      Schema.decodeOption(AnonymousOrderAccessCookieJson)(
        decodeURIComponent(value)
      )
    );
  } catch {
    return undefined;
  }
};

export const ANONYMOUS_ORDER_ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * ORDER_ACCESS_COOKIE_MAX_AGE_DAYS,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
