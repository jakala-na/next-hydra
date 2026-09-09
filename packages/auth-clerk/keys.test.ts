import { afterEach, describe, expect, it, vi } from "vitest";

import { keys } from "./keys";

describe("sign-in environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the site root when the optional sign-in fallback is not configured", () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_fixture");
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_fixture");
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_IN_URL", "/sign-in");
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL", undefined);
    expect(keys().NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL).toBe("/");
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL", "/account");
    expect(keys().NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL).toBe(
      "/account"
    );
  });
});
