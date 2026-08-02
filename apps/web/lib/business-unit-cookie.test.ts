import { describe, expect, it } from "vitest";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  BUSINESS_UNIT_COOKIE_OPTIONS,
  getBusinessUnitIdFromCookieValue,
} from "./business-unit-cookie";

const BUSINESS_UNIT_COOKIE_MAX_AGE_DAYS = 90;
const NINETY_DAYS_IN_SECONDS = 60 * 60 * 24 * BUSINESS_UNIT_COOKIE_MAX_AGE_DAYS;

describe("Business Unit selection cookie", () => {
  it("uses the request-boundary cookie contract", () => {
    expect(BUSINESS_UNIT_COOKIE_NAME).toBe("business-unit-id");
    expect(BUSINESS_UNIT_COOKIE_OPTIONS).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: NINETY_DAYS_IN_SECONDS,
    });
  });

  it("reads a selected Business Unit id", () => {
    expect(getBusinessUnitIdFromCookieValue("business-unit-1")).toBe(
      "business-unit-1"
    );
  });

  it("ignores a missing or empty selection", () => {
    expect(getBusinessUnitIdFromCookieValue(undefined)).toBeUndefined();
    expect(getBusinessUnitIdFromCookieValue("")).toBeUndefined();
  });
});
