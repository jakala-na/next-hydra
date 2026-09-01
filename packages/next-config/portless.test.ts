import { afterEach, describe, expect, it, vi } from "vitest";

import { configurePortlessEnvironment } from "./portless";

const CONFIGURED_ENVIRONMENT_KEYS = [
  "ADMIN_CLERK_AUTHORIZED_PARTIES",
  "ADMIN_URL",
  "CLERK_AUTHORIZED_PARTIES",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_WEB_URL",
  "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
  "PORTLESS_AUTO_ENV",
  "PORTLESS_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
] as const;
const initialEnvironment = new Map(
  CONFIGURED_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]])
);

describe("configurePortlessEnvironment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();

    for (const key of CONFIGURED_ENVIRONMENT_KEYS) {
      const initialValue = initialEnvironment.get(key);

      if (initialValue === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = initialValue;
      }
    }
  });

  it("leaves explicit development configuration unchanged outside Portless", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");

    configurePortlessEnvironment("web");

    expect(process.env.NEXT_PUBLIC_API_URL).toBe("https://api.example.test");
  });

  it("allows deliberate mixed local and remote development", () => {
    vi.stubEnv("PORTLESS_AUTO_ENV", "0");
    vi.stubEnv("PORTLESS_URL", "https://web.storefront.localhost");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");

    configurePortlessEnvironment("web");

    expect(process.env.NEXT_PUBLIC_API_URL).toBe("https://api.example.test");
  });

  it("wires the primary web checkout to sibling services", () => {
    vi.stubEnv("PORTLESS_URL", "https://web.storefront.localhost");

    configurePortlessEnvironment("web");

    expect(process.env).toMatchObject({
      ADMIN_CLERK_AUTHORIZED_PARTIES: "https://admin.storefront.localhost",
      ADMIN_URL: "https://admin.storefront.localhost",
      CLERK_AUTHORIZED_PARTIES: "https://web.storefront.localhost",
      NEXT_PUBLIC_API_URL: "https://api.storefront.localhost",
      NEXT_PUBLIC_WEB_URL: "https://web.storefront.localhost",
      NEXT_PUBLIC_WORKOS_REDIRECT_URI:
        "https://web.storefront.localhost/api/auth/callback",
      VERCEL_PROJECT_PRODUCTION_URL: "web.storefront.localhost",
    });
  });

  it("preserves worktree prefixes and a custom proxy port", () => {
    vi.stubEnv(
      "PORTLESS_URL",
      "https://fix-auth.api.storefront.localhost:1355"
    );

    configurePortlessEnvironment("api");

    expect(process.env).toMatchObject({
      ADMIN_URL: "https://fix-auth.admin.storefront.localhost:1355",
      NEXT_PUBLIC_API_URL: "https://fix-auth.api.storefront.localhost:1355",
      NEXT_PUBLIC_WEB_URL: "https://fix-auth.web.storefront.localhost:1355",
      NEXT_PUBLIC_WORKOS_REDIRECT_URI:
        "https://fix-auth.web.storefront.localhost:1355/api/auth/callback",
    });
  });

  it("keeps the application label distinct from a matching project label", () => {
    vi.stubEnv("PORTLESS_URL", "https://web.web.localhost");

    configurePortlessEnvironment("web");

    expect(process.env).toMatchObject({
      ADMIN_URL: "https://admin.web.localhost",
      NEXT_PUBLIC_API_URL: "https://api.web.localhost",
      NEXT_PUBLIC_WEB_URL: "https://web.web.localhost",
    });
  });

  it("keeps a matching worktree prefix distinct from the application label", () => {
    vi.stubEnv("PORTLESS_URL", "https://api.api.storefront.localhost");

    configurePortlessEnvironment("api");

    expect(process.env).toMatchObject({
      ADMIN_URL: "https://api.admin.storefront.localhost",
      NEXT_PUBLIC_API_URL: "https://api.api.storefront.localhost",
      NEXT_PUBLIC_WEB_URL: "https://api.web.storefront.localhost",
    });
  });

  it("uses the isolated admin origin for admin authentication", () => {
    vi.stubEnv("PORTLESS_URL", "https://admin.storefront.localhost");

    configurePortlessEnvironment("admin");

    expect(process.env.CLERK_AUTHORIZED_PARTIES).toBe(
      "https://admin.storefront.localhost"
    );
    expect(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI).toBe(
      "https://admin.storefront.localhost/api/auth/callback"
    );
  });

  it("does not rewrite configuration for an unrelated hostname", () => {
    vi.stubEnv("PORTLESS_URL", "https://different.storefront.localhost");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");

    configurePortlessEnvironment("web");

    expect(process.env.NEXT_PUBLIC_API_URL).toBe("https://api.example.test");
  });
});
