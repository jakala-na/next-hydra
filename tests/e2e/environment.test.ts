import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  composeE2EEnvironments,
  loadE2EEnvironments,
  withE2EApplicationUrls,
} from "./environment";

describe(loadE2EEnvironments, () => {
  it("loads each application's .env with its normal runtime values", async () => {
    const workspaceRoot = await mkdtemp(
      path.join(tmpdir(), "e2e-environment-")
    );

    try {
      await Promise.all(
        ["admin", "api", "web"].map(async (application) => {
          const applicationDirectory = path.join(
            workspaceRoot,
            "apps",
            application
          );
          await mkdir(applicationDirectory, { recursive: true });
          await writeFile(
            path.join(applicationDirectory, ".env"),
            `E2E_TEST_${application.toUpperCase()}_MARKER=${application}\n`
          );
        })
      );

      const environments = loadE2EEnvironments(workspaceRoot);

      expect(environments.servers.admin.E2E_TEST_ADMIN_MARKER).toBe("admin");
      expect(environments.servers.api.E2E_TEST_API_MARKER).toBe("api");
      expect(environments.servers.web.E2E_TEST_WEB_MARKER).toBe("web");
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});

describe(composeE2EEnvironments, () => {
  it("keeps each application's normal runtime values isolated", () => {
    const environments = composeE2EEnvironments({
      applications: {
        admin: {
          NEXT_PUBLIC_WORKOS_REDIRECT_URI:
            "http://localhost:3005/api/auth/callback",
          WORKOS_ACCESS_TOKEN_ISSUER: "https://admin-auth.example.test",
          WORKOS_API_KEY: "sk_admin",
          WORKOS_CLIENT_ID: "client_admin",
          WORKOS_COOKIE_PASSWORD: "admin-cookie-password",
        },
        api: {
          ADMIN_WORKOS_API_KEY: "sk_admin",
          ADMIN_WORKOS_CLIENT_ID: "client_admin",
          COMMERCETOOLS_PROJECT_KEY: "e2e-project",
          REGISTRATION_CONTAINER: "registrations-e2e",
          WORKOS_API_KEY: "sk_customer",
          WORKOS_CLIENT_ID: "client_customer",
        },
        web: {
          NEXT_PUBLIC_WORKOS_REDIRECT_URI:
            "http://localhost:3001/api/auth/callback",
          WORKOS_API_KEY: "sk_customer",
          WORKOS_CLIENT_ID: "client_customer",
          WORKOS_COOKIE_PASSWORD: "customer-cookie-password",
        },
      },
      explicitEnvironment: { CI: "true" },
    });

    expect(environments.runner).toMatchObject({
      ADMIN_WORKOS_ACCESS_TOKEN_ISSUER: "https://admin-auth.example.test",
      ADMIN_WORKOS_API_KEY: "sk_admin",
      ADMIN_WORKOS_CLIENT_ID: "client_admin",
      ADMIN_WORKOS_COOKIE_PASSWORD: "admin-cookie-password",
      COMMERCETOOLS_PROJECT_KEY: "e2e-project",
      REGISTRATION_CONTAINER: "registrations-e2e",
      WORKOS_API_KEY: "sk_customer",
      WORKOS_CLIENT_ID: "client_customer",
      WORKOS_COOKIE_PASSWORD: "customer-cookie-password",
    });
    expect(environments.servers.web).toMatchObject({
      WORKOS_API_KEY: "sk_customer",
      WORKOS_CLIENT_ID: "client_customer",
    });
    expect(environments.servers.api).toMatchObject({
      ADMIN_WORKOS_API_KEY: "sk_admin",
      WORKOS_API_KEY: "sk_customer",
    });
    expect(environments.servers.admin).toMatchObject({
      NEXT_PUBLIC_WORKOS_REDIRECT_URI:
        "http://localhost:3005/api/auth/callback",
      WORKOS_ACCESS_TOKEN_ISSUER: "https://admin-auth.example.test",
      WORKOS_API_KEY: "sk_admin",
      WORKOS_CLIENT_ID: "client_admin",
      WORKOS_COOKIE_PASSWORD: "admin-cookie-password",
    });
  });

  it("projects CI admin names only into the admin child process", () => {
    const environments = composeE2EEnvironments({
      applications: { admin: {}, api: {}, web: {} },
      explicitEnvironment: {
        ADMIN_WORKOS_API_KEY: "sk_admin",
        ADMIN_WORKOS_CLIENT_ID: "client_admin",
        ADMIN_WORKOS_COOKIE_NAME: "admin-session",
        ADMIN_WORKOS_COOKIE_PASSWORD: "admin-cookie-password",
        NEXT_PUBLIC_ADMIN_WORKOS_REDIRECT_URI:
          "http://localhost:3005/api/auth/callback",
        WORKOS_API_KEY: "sk_customer",
        WORKOS_CLIENT_ID: "client_customer",
      },
    });

    expect(environments.runner).toMatchObject({
      ADMIN_WORKOS_API_KEY: "sk_admin",
      WORKOS_API_KEY: "sk_customer",
    });
    expect(environments.servers.web).toMatchObject({
      WORKOS_API_KEY: "sk_customer",
      WORKOS_CLIENT_ID: "client_customer",
    });
    expect(environments.servers.admin).toMatchObject({
      NEXT_PUBLIC_WORKOS_REDIRECT_URI:
        "http://localhost:3005/api/auth/callback",
      WORKOS_API_KEY: "sk_admin",
      WORKOS_CLIENT_ID: "client_admin",
      WORKOS_COOKIE_NAME: "admin-session",
      WORKOS_COOKIE_PASSWORD: "admin-cookie-password",
    });
  });

  it("projects isolated Clerk credentials into the runner and admin app", () => {
    const environments = composeE2EEnvironments({
      applications: {
        admin: {},
        api: {
          ADMIN_CLERK_AUTHORIZED_PARTIES: "http://localhost:3005",
          ADMIN_CLERK_PUBLISHABLE_KEY: "pk_test_admin",
          ADMIN_CLERK_SECRET_KEY: "sk_test_admin",
        },
        web: {
          CLERK_AUTHORIZED_PARTIES: "http://localhost:3001",
          CLERK_SECRET_KEY: "sk_test_customer",
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_customer",
        },
      },
      explicitEnvironment: {},
    });

    expect(environments.runner).toMatchObject({
      ADMIN_CLERK_PUBLISHABLE_KEY: "pk_test_admin",
      ADMIN_CLERK_SECRET_KEY: "sk_test_admin",
      CLERK_SECRET_KEY: "sk_test_customer",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_customer",
    });
    expect(environments.servers.web).toMatchObject({
      CLERK_SECRET_KEY: "sk_test_customer",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_customer",
    });
    expect(environments.servers.admin).toMatchObject({
      CLERK_AUTHORIZED_PARTIES: "http://localhost:3005",
      CLERK_SECRET_KEY: "sk_test_admin",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_admin",
    });
  });
});

describe(withE2EApplicationUrls, () => {
  it("projects the resolved topology into each application's runtime names", () => {
    const environments = withE2EApplicationUrls(
      {
        runner: { RUNNER_MARKER: "runner" },
        servers: {
          admin: {
            ADMIN_MARKER: "admin",
            NEXT_PUBLIC_API_URL: "https://api.old.example.test",
          },
          api: {
            ADMIN_URL: "https://admin.old.example.test",
            API_MARKER: "api",
            NEXT_PUBLIC_API_URL: "https://api.old.example.test",
            NEXT_PUBLIC_WEB_URL: "https://web.old.example.test",
          },
          web: {
            NEXT_PUBLIC_API_URL: "https://api.old.example.test",
            NEXT_PUBLIC_WEB_URL: "https://web.old.example.test",
            WEB_MARKER: "web",
          },
        },
      },
      {
        admin: "http://localhost:3005",
        api: "http://localhost:3002",
        web: "http://localhost:3001",
      }
    );

    expect(environments).toStrictEqual({
      runner: { RUNNER_MARKER: "runner" },
      servers: {
        admin: {
          ADMIN_MARKER: "admin",
          NEXT_PUBLIC_API_URL: "http://localhost:3002",
        },
        api: {
          ADMIN_URL: "http://localhost:3005",
          API_MARKER: "api",
          NEXT_PUBLIC_API_URL: "http://localhost:3002",
          NEXT_PUBLIC_WEB_URL: "http://localhost:3001",
        },
        web: {
          NEXT_PUBLIC_API_URL: "http://localhost:3002",
          NEXT_PUBLIC_WEB_URL: "http://localhost:3001",
          WEB_MARKER: "web",
        },
      },
    });
  });
});
