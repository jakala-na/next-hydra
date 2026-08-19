import { describe, expect, it } from "vitest";

import { localizedCountryName } from "./violation-message";

describe(localizedCountryName, () => {
  it("localizes schema-safe country codes", () => {
    expect(localizedCountryName("RE", "en-US", "Unknown destination")).toBe(
      "Réunion"
    );
  });

  it("falls back without throwing for malformed violation parameters", () => {
    const numericCountryParameter = 123;

    expect(
      localizedCountryName("not-a-country", "en-US", "Unknown destination")
    ).toBe("Unknown destination");
    expect(
      localizedCountryName(
        numericCountryParameter,
        "en-US",
        "Unknown destination"
      )
    ).toBe("Unknown destination");
  });
});
