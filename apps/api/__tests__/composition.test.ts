import { baseConfig } from "@repo/next-config";
import { describe, expect, it } from "vitest";

import { env } from "../env";
import { apiServerEnvSchema } from "../env-schema";

describe("API capability configuration", () => {
  it("loads host configuration without unrelated capability settings", () => {
    const unrelatedSettings = new Set([
      "ADMIN_URL",
      "REGISTRATION_APPROVER_EMAIL",
      "NEXT_PUBLIC_POSTHOG_KEY",
      "STRIPE_SECRET_KEY",
      "RESEND_TOKEN",
    ]);
    expect(
      Object.keys(env).filter((key) => unrelatedSettings.has(key))
    ).toEqual([]);
    expect("NEXT_PUBLIC_API_URL" in env).toBeFalsy();
  });

  it("does not expose the web analytics ingestion proxy", () => {
    expect(baseConfig.rewrites).toBeUndefined();
    expect(baseConfig.skipTrailingSlashRedirect).toBeUndefined();
  });

  it("still rejects missing Registration settings at its own boundary", () => {
    expect(apiServerEnvSchema.safeParse({}).success).toBeFalsy();
  });
});
