import type { Locale, LocaleCountry } from "@repo/i18n/types";
import { cookies } from "next/headers";

export const ANONYMOUS_CART_COOKIE_NAME = "cart_id";

export const getCountryCodeFromLocale = (locale: Locale) =>
  locale.split("-")[1] as LocaleCountry;

const getCookieName = (locale: Locale) => {
  const localeCountry = getCountryCodeFromLocale(locale).toLowerCase();
  return `${localeCountry}:${ANONYMOUS_CART_COOKIE_NAME}`;
};

const CART_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 90, // 90 days
};

/**
 * Get the anonymous cart ID from cookies
 */
export async function getAnonymousCartId(
  locale: Locale
): Promise<string | null> {
  const cookieStore = await cookies();
  const cartCookie = cookieStore.get(getCookieName(locale));
  return cartCookie?.value || null;
}

/**
 * Set the anonymous cart ID in cookies
 */
export async function setAnonymousCartId(
  cartId: string,
  locale: Locale
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(getCookieName(locale), cartId, CART_COOKIE_OPTIONS);
}

/**
 * Clear the anonymous cart ID from cookies
 */
export async function clearAnonymousCartId(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ANONYMOUS_CART_COOKIE_NAME);
}
