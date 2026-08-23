import { afterEach, describe, expect, it, vi } from "vitest";

import { keys, webhookKeys } from "./keys";

const configureRequiredClerkEnvironment = () => {
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_secret");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_publishable");
  vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL", "/");
  vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_IN_URL", "/sign-in");
};

describe(keys, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires at least one authorized application origin", () => {
    configureRequiredClerkEnvironment();
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", " , ");

    expect(() => keys()).toThrow("Invalid environment variables");
  });

  it("accepts comma-separated authorized application origins", () => {
    configureRequiredClerkEnvironment();
    vi.stubEnv(
      "CLERK_AUTHORIZED_PARTIES",
      "https://shop.example.com,https://admin.example.com"
    );

    expect(keys().CLERK_AUTHORIZED_PARTIES).toContain(
      "https://shop.example.com"
    );
  });
});

describe(webhookKeys, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires the webhook secret used to finish registration onboarding", () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "");

    expect(() => webhookKeys()).toThrow("Invalid environment variables");
  });

  it("accepts a Clerk webhook signing secret", () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_test");

    expect(webhookKeys().CLERK_WEBHOOK_SECRET).toBe("whsec_test");
  });
});
