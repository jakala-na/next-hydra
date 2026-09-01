import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

import {
  loadPortlessApplicationNames,
  resolveE2EApplicationRouting,
} from "./application-routing";
import { loadE2EEnvironments, withE2EApplicationUrls } from "./environment";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const authSetupPath = fileURLToPath(new URL("auth.setup.ts", import.meta.url));
const loadedEnvironments = loadE2EEnvironments(workspaceRoot);
Object.assign(process.env, loadedEnvironments.runner);
const portlessExecutable = fileURLToPath(
  new URL(
    `../../node_modules/.bin/portless${process.platform === "win32" ? ".cmd" : ""}`,
    import.meta.url
  )
);
const applicationRouting = resolveE2EApplicationRouting({
  environment: process.env,
  getPortlessUrl: (name) =>
    new URL(
      execFileSync(portlessExecutable, ["get", name], {
        cwd: workspaceRoot,
        encoding: "utf-8",
      }).trim()
    ).origin,
  portlessApplicationNames: loadPortlessApplicationNames(workspaceRoot),
});
const applicationUrls = applicationRouting.urls;
const environments = withE2EApplicationUrls(
  loadedEnvironments,
  applicationUrls
);
Object.assign(process.env, {
  E2E_ADMIN_URL: applicationUrls.admin,
  E2E_API_URL: applicationUrls.api,
  E2E_WEB_URL: applicationUrls.web,
});

const testDir = defineBddConfig({
  disableWarnings: { importTestFrom: true },
  features: "../../packages/*/e2e/**/*.feature",
  featuresRoot: "../..",
  importTestFrom: "composition.ts",
  missingSteps: "fail-on-run",
  outputDir: ".features-gen",
  steps: "../../packages/*/e2e/**/*.steps.ts",
});

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  globalSetup: authSetupPath,
  outputDir: "test-results",
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
  retries: process.env.CI ? 2 : 0,
  testDir,
  use: {
    baseURL: applicationUrls.web,
    ignoreHTTPSErrors: applicationRouting.mode === "portless",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  webServer:
    applicationRouting.mode === "direct"
      ? [
          {
            command: "pnpm --filter web dev:app",
            cwd: workspaceRoot,
            env: { ...environments.servers.web, PORT: "3001" },
            timeout: 120_000,
            url: applicationUrls.web,
          },
          {
            command: "pnpm --filter api dev:app",
            cwd: workspaceRoot,
            env: { ...environments.servers.api, PORT: "3002" },
            timeout: 120_000,
            url: new URL("/health", applicationUrls.api).href,
          },
          {
            command: "pnpm --filter admin dev:app",
            cwd: workspaceRoot,
            env: { ...environments.servers.admin, PORT: "3005" },
            timeout: 120_000,
            url: applicationUrls.admin,
          },
        ]
      : undefined,
});
