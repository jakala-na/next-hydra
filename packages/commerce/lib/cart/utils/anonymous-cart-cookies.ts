import { Option, Schema } from "effect";

import { CartId } from "../../../domain/cart";
import { CurrencyCode } from "../../../domain/money";
import { CommerceLocale, StoreKey } from "../../../store";
import type { Store } from "../../../store";

export const ANONYMOUS_CART_COOKIE_NAME = "cart";
const CART_COOKIE_MAX_AGE_DAYS = 90;

export class AnonymousCartCookie extends Schema.Class<AnonymousCartCookie>(
  "AnonymousCartCookie"
)({
  cartId: CartId,
  currency: CurrencyCode,
  locale: CommerceLocale,
  storeKey: StoreKey,
}) {}

const AnonymousCartCookieJson = Schema.fromJsonString(AnonymousCartCookie);
const decodeCookieWireValue = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const makeAnonymousCartCookie = ({
  cartId,
  store,
}: {
  readonly cartId: string;
  readonly store: Store;
}) =>
  new AnonymousCartCookie({
    cartId: CartId.make(cartId),
    currency: store.currency,
    locale: store.locale,
    storeKey: store.storeKey,
  });

export const encodeAnonymousCartCookie = (
  cookie: AnonymousCartCookie
): string =>
  encodeURIComponent(Schema.encodeSync(AnonymousCartCookieJson)(cookie));

export const decodeAnonymousCartCookie = (
  value: string | undefined
): AnonymousCartCookie | null => {
  if (value === undefined || value.length === 0) {
    return null;
  }

  const result = Schema.decodeUnknownOption(AnonymousCartCookieJson)(
    decodeCookieWireValue(value)
  );

  return Option.getOrNull(result);
};

const anonymousCartCookieMatchesContext = (
  cookie: AnonymousCartCookie,
  store: Store
) =>
  cookie.currency === store.currency &&
  cookie.locale === store.locale &&
  cookie.storeKey === store.storeKey;

export const getAnonymousCartIdFromCookieValue = (
  value: string | undefined,
  store: Store
): string | null => {
  const cartCookie = decodeAnonymousCartCookie(value);

  if (
    cartCookie === null ||
    !anonymousCartCookieMatchesContext(cartCookie, store)
  ) {
    return null;
  }

  return cartCookie.cartId;
};

export const ANONYMOUS_CART_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * CART_COOKIE_MAX_AGE_DAYS,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
