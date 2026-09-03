import { Option, Schema } from "effect";

import { CartId } from "../../../domain/cart";

export const ORDER_PLACEMENT_RECOVERY_COOKIE_NAME = "order-placement-recovery";

export class OrderPlacementRecoveryCookie extends Schema.Class<OrderPlacementRecoveryCookie>(
  "OrderPlacementRecoveryCookie"
)({
  cartId: CartId,
}) {}

const OrderPlacementRecoveryCookieJson = Schema.fromJsonString(
  OrderPlacementRecoveryCookie
);

export const encodeOrderPlacementRecoveryCookie = (
  cookie: OrderPlacementRecoveryCookie
) =>
  encodeURIComponent(
    Schema.encodeSync(OrderPlacementRecoveryCookieJson)(cookie)
  );

export const decodeOrderPlacementRecoveryCookie = (
  value: string | undefined
) => {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  try {
    return Option.getOrUndefined(
      Schema.decodeOption(OrderPlacementRecoveryCookieJson)(
        decodeURIComponent(value)
      )
    );
  } catch {
    return undefined;
  }
};

export const ORDER_PLACEMENT_RECOVERY_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 60 * 60,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
