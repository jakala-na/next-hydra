import type { Locale } from "@repo/i18n/types";
import { Option, Schema } from "effect";
import { CartId, StoreKey } from "../../../domain/cart";
import type { StoreContext } from "../../store/types";
import {
  getDefaultCurrencyByLocale,
  getStoreKeyByLocale,
} from "../../store/utils/mappings";

export const ANONYMOUS_CART_COOKIE_NAME = "cart";
const CART_COOKIE_MAX_AGE_DAYS = 90;

export class AnonymousCartCookie extends Schema.Class<AnonymousCartCookie>(
  "AnonymousCartCookie"
)({
  cartId: CartId,
  currency: Schema.NonEmptyString,
  locale: Schema.NonEmptyString,
  storeKey: StoreKey,
}) {}

export type AnonymousCartCookieContext = Pick<
  StoreContext,
  "currency" | "locale" | "storeKey"
>;

const AnonymousCartCookieJson = Schema.fromJsonString(AnonymousCartCookie);
const decodeCookieWireValue = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const getAnonymousCartCookieContextByLocale = (
  locale: Locale
): AnonymousCartCookieContext => ({
  currency: getDefaultCurrencyByLocale(locale),
  locale,
  storeKey: getStoreKeyByLocale(locale),
});

export const makeAnonymousCartCookie = ({
  cartId,
  context,
}: {
  readonly cartId: string;
  readonly context: AnonymousCartCookieContext;
}) =>
  new AnonymousCartCookie({
    cartId: CartId.make(cartId),
    currency: context.currency,
    locale: context.locale,
    storeKey: StoreKey.make(context.storeKey),
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
  context: AnonymousCartCookieContext
) =>
  cookie.currency === context.currency &&
  cookie.locale === context.locale &&
  cookie.storeKey === context.storeKey;

export const getAnonymousCartIdFromCookieValue = (
  value: string | undefined,
  context: AnonymousCartCookieContext
): string | null => {
  const cartCookie = decodeAnonymousCartCookie(value);

  if (
    cartCookie === null ||
    !anonymousCartCookieMatchesContext(cartCookie, context)
  ) {
    return null;
  }

  return cartCookie.cartId;
};

export const ANONYMOUS_CART_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * CART_COOKIE_MAX_AGE_DAYS,
};
