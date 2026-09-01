import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  loadPortlessApplicationNames,
  resolveE2EApplicationRouting,
} from "./application-routing";

describe(loadPortlessApplicationNames, () => {
  it("loads the sanitized names from each application package", async () => {
    const workspaceRoot = await mkdtemp(
      path.join(tmpdir(), "e2e-application-routing-")
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
            path.join(applicationDirectory, "package.json"),
            JSON.stringify({
              portless: { name: `${application}.customer-project` },
            })
          );
        })
      );

      expect(loadPortlessApplicationNames(workspaceRoot)).toStrictEqual({
        admin: "admin.customer-project",
        api: "api.customer-project",
        web: "web.customer-project",
      });
    } finally {
      await rm(workspaceRoot, { force: true, recursive: true });
    }
  });
});

describe(resolveE2EApplicationRouting, () => {
  it("uses the current worktree's Portless origins for local E2E", () => {
    const getPortlessUrl = vi.fn<(name: string) => string>(
      (name: string) =>
        `https://research-bdd-playwright-testing.${name}.localhost:1355`
    );

    const routing = resolveE2EApplicationRouting({
      environment: {},
      getPortlessUrl,
      portlessApplicationNames: {
        admin: "admin.customer-project",
        api: "api.customer-project",
        web: "web.customer-project",
      },
    });

    expect(routing).toEqual({
      mode: "portless",
      urls: {
        admin:
          "https://research-bdd-playwright-testing.admin.customer-project.localhost:1355",
        api: "https://research-bdd-playwright-testing.api.customer-project.localhost:1355",
        web: "https://research-bdd-playwright-testing.web.customer-project.localhost:1355",
      },
    });
    expect(getPortlessUrl).toHaveBeenCalledTimes(3);
  });

  it("uses direct fixed-port origins in CI without starting Portless", () => {
    const getPortlessUrl = vi.fn<(name: string) => string>();

    const routing = resolveE2EApplicationRouting({
      environment: { CI: "true" },
      getPortlessUrl,
      portlessApplicationNames: {
        admin: "admin.customer-project",
        api: "api.customer-project",
        web: "web.customer-project",
      },
    });

    expect(routing).toEqual({
      mode: "direct",
      urls: {
        admin: "http://localhost:3005",
        api: "http://localhost:3002",
        web: "http://localhost:3001",
      },
    });
    expect(getPortlessUrl).not.toHaveBeenCalled();
  });

  it("uses fully explicit external application origins without local servers", () => {
    const getPortlessUrl = vi.fn<(name: string) => string>();

    const routing = resolveE2EApplicationRouting({
      environment: {
        CI: "true",
        E2E_ADMIN_URL: "https://admin.example.test",
        E2E_API_URL: "https://api.example.test",
        E2E_WEB_URL: "https://web.example.test",
      },
      getPortlessUrl,
      portlessApplicationNames: {
        admin: "admin.customer-project",
        api: "api.customer-project",
        web: "web.customer-project",
      },
    });

    expect(routing).toEqual({
      mode: "external",
      urls: {
        admin: "https://admin.example.test",
        api: "https://api.example.test",
        web: "https://web.example.test",
      },
    });
    expect(getPortlessUrl).not.toHaveBeenCalled();
  });

  it("keeps explicit local application URL overrides", () => {
    const getPortlessUrl = vi.fn<(name: string) => string>(
      (name) => `https://${name}.localhost`
    );

    const routing = resolveE2EApplicationRouting({
      environment: {
        E2E_ADMIN_URL: "https://admin.preview.example.test",
      },
      getPortlessUrl,
      portlessApplicationNames: {
        admin: "admin.customer-project",
        api: "api.customer-project",
        web: "web.customer-project",
      },
    });

    expect(routing.urls).toEqual({
      admin: "https://admin.preview.example.test",
      api: "https://api.customer-project.localhost",
      web: "https://web.customer-project.localhost",
    });
    expect(getPortlessUrl).toHaveBeenCalledTimes(2);
  });
});
