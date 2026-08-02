import { CommerceBusinessUnitId } from "@repo/commerce/domain/commerce-account";
import { Option, Schema } from "effect";

export const BUSINESS_UNIT_COOKIE_NAME = "business-unit-id";

const BUSINESS_UNIT_COOKIE_MAX_AGE_DAYS = 90;

export const BUSINESS_UNIT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * BUSINESS_UNIT_COOKIE_MAX_AGE_DAYS,
};

export const getBusinessUnitIdFromCookieValue = (
  value: string | undefined
): CommerceBusinessUnitId | undefined =>
  Option.getOrUndefined(
    Schema.decodeUnknownOption(CommerceBusinessUnitId)(value)
  );
