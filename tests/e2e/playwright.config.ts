import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";
import type { PlaywrightTestConfig } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

import {
  loadPortlessApplicationNames,
  resolveE2EApplicationRouting,
} from "./application-routing";
import { loadE2EEnvironments, withE2EApplicationUrls } from "./environment";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const loadedEnvironments = loadE2EEnvironments(workspaceRoot);
Object.assign(process.env, loadedEnvironments.runner);
const explicitUrls = {
  admin: process.env.E2E_ADMIN_URL,
  api: process.env.E2E_API_URL,
  web: process.env.E2E_WEB_URL,
};
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
const { urls } = applicationRouting;
const environments = withE2EApplicationUrls(loadedEnvironments, urls);
process.env.E2E_WEB_URL = urls.web;
if (urls.api) {
  process.env.E2E_API_URL = urls.api;
}
if (urls.admin) {
  process.env.E2E_ADMIN_URL = urls.admin;
}
const webServers: NonNullable<PlaywrightTestConfig["webServer"]> = [];
if (applicationRouting.mode === "direct") {
  if (!explicitUrls.web) {
    webServers.push({
      command: "pnpm --filter web dev:app",
      cwd: workspaceRoot,
      env: { ...environments.servers.web, PORT: "3001" },
      timeout: 120_000,
      url: urls.web,
    });
  }
  if (urls.api && !explicitUrls.api) {
    webServers.push({
      command: "pnpm --filter api dev:app",
      cwd: workspaceRoot,
      env: { ...environments.servers.api, PORT: "3002" },
      timeout: 120_000,
      url: new URL("/health", urls.api).href,
    });
  }
  if (urls.admin && !explicitUrls.admin) {
    webServers.push({
      command: "pnpm --filter admin dev:app",
      cwd: workspaceRoot,
      env: { ...environments.servers.admin, PORT: "3005" },
      timeout: 120_000,
      url: urls.admin,
    });
  }
}

const bddTestDir = defineBddConfig({
  disableWarnings: { importTestFrom: true },
  features: ["../../packages/*/e2e/**/*.feature", "features/**/*.feature"],
  featuresRoot: "../..",
  importTestFrom: "composition.ts",
  missingSteps: "fail-on-gen",
  outputDir: ".features-gen",
  steps: ["../../packages/*/e2e/**/*.steps.ts", "features/**/*.steps.ts"],
});

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  globalSetup: fileURLToPath(new URL("global.setup.ts", import.meta.url)),
  metadata: { applicationUrls: urls },
  outputDir: "test-results",
  projects: [
    {
      name: "chromium",
      testDir: bddTestDir,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "browser",
      testDir: ".",
      testMatch: "**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: urls.web,
    ignoreHTTPSErrors: applicationRouting.mode === "portless",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  webServer: webServers,
});
