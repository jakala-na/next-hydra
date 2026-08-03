import "server-only";

import { withAuth } from "@repo/auth-workos/server";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  ANONYMOUS_CART_COOKIE_OPTIONS,
} from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import type { Locale } from "@repo/i18n/types";
import { cookies } from "next/headers";
import { BUSINESS_UNIT_COOKIE_NAME } from "./business-unit-cookie";
import type { CurrentCartRequest } from "./current-cart";

export const readCurrentCartRequest = async (
  locale: Locale
): Promise<CurrentCartRequest> => {
  const [session, cookieStore] = await Promise.all([withAuth(), cookies()]);

  return {
    locale,
    authUserId: session.user?.id,
    businessUnitIdCookie: cookieStore.get(BUSINESS_UNIT_COOKIE_NAME)?.value,
    anonymousCartCookie: {
      value: cookieStore.get(ANONYMOUS_CART_COOKIE_NAME)?.value,
      set: (value) =>
        cookieStore.set(
          ANONYMOUS_CART_COOKIE_NAME,
          value,
          ANONYMOUS_CART_COOKIE_OPTIONS
        ),
      clear: () => cookieStore.delete(ANONYMOUS_CART_COOKIE_NAME),
    },
  };
};
