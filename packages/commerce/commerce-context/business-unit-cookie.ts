import { Option, Schema } from "effect";

import { CommerceBusinessUnitId } from "../domain/commerce-account";

export const BUSINESS_UNIT_COOKIE_NAME = "business-unit-id";

const BUSINESS_UNIT_COOKIE_MAX_AGE_DAYS = 90;

export const BUSINESS_UNIT_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * BUSINESS_UNIT_COOKIE_MAX_AGE_DAYS,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export const getBusinessUnitIdFromCookieValue = (
  value: string | undefined
): CommerceBusinessUnitId | undefined =>
  Option.getOrUndefined(
    Schema.decodeUnknownOption(CommerceBusinessUnitId)(value)
  );
