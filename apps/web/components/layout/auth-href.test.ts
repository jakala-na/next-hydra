import { describe, expect, it } from "vitest";

import { localizeAuthHref } from "./auth-href";

describe(localizeAuthHref, () => {
  it("uses unprefixed auth routes for the default locale", () => {
    expect(localizeAuthHref("/sign-in", "en-US")).toBe("/sign-in");
  });

  it("prefixes application auth routes with a non-default locale", () => {
    expect(localizeAuthHref("/sign-in", "fr-FR")).toBe("/fr-FR/sign-in");
    expect(localizeAuthHref("/sign-out", "fr-FR")).toBe("/fr-FR/sign-out");
  });

  it("leaves provider and API auth routes unchanged", () => {
    expect(localizeAuthHref("https://auth.example.test/sign-in", "fr-FR")).toBe(
      "https://auth.example.test/sign-in"
    );
    expect(localizeAuthHref("/api/auth/signout", "fr-FR")).toBe(
      "/api/auth/signout"
    );
  });
});
