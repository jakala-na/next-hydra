import { describe, expect, it } from "vitest";

import { hasTransientTransportCode } from "./transport";

describe("transient transport code detection", () => {
  it("does not infer availability from an error class", () => {
    expect(
      hasTransientTransportCode(new TypeError("application bug"))
    ).toBeFalsy();
  });

  it("recognizes transport codes through nested causes", () => {
    const failure = new TypeError("fetch failed", {
      cause: Object.assign(new Error("socket reset"), { code: "ECONNRESET" }),
    });

    expect(hasTransientTransportCode(failure)).toBeTruthy();
  });

  it("accepts adapter-specific transport codes", () => {
    expect(
      hasTransientTransportCode(
        Object.assign(new Error("JWKS timed out"), {
          code: "ERR_JWKS_TIMEOUT",
        }),
        ["ERR_JWKS_TIMEOUT"]
      )
    ).toBeTruthy();
  });

  it("does not classify unknown host names as transient outages", () => {
    const failure = Object.assign(new Error("host not found"), {
      code: "ENOTFOUND",
    });

    expect(hasTransientTransportCode(failure)).toBeFalsy();
  });
});
