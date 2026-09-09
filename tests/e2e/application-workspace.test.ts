import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveApplicationWorkspace } from "./application-workspace";

describe("application workspace selection", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "application-workspace-"));
  });
  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  async function maintainer(): Promise<void> {
    const directory = path.join(root, "packages/create-next-hydra");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "package.json"), "{}");
  }
  async function composition(name: string): Promise<string> {
    const workspace = path.join(root, "workspaces", name);
    await Promise.all(
      ["web", "api", "admin"].map(async (app) => {
        const directory = path.join(workspace, "apps", app);
        await mkdir(directory, { recursive: true });
        await writeFile(
          path.join(directory, "package.json"),
          JSON.stringify({
            dependencies: {
              "@repo/auth": "workspace:@repo/auth-workos@*",
              "@repo/cms": "workspace:@repo/cms-contentstack@*",
              "@repo/commerce-provider":
                "workspace:@repo/commerce-commercetools@*",
            },
          })
        );
      })
    );
    return workspace;
  }

  it("uses a customer project directly", () => {
    expect(resolveApplicationWorkspace(root, {})).toBe(root);
  });

  it("uses only the reference storefront locally", async () => {
    await maintainer();
    const reference = await composition("storefront-contentstack");
    expect(resolveApplicationWorkspace(root, {})).toBe(reference);
    expect(
      resolveApplicationWorkspace(root, {
        E2E_WORKSPACE: "storefront-contentstack",
      })
    ).toBe(reference);
    expect(() =>
      resolveApplicationWorkspace(root, { E2E_WORKSPACE: "another-storefront" })
    ).toThrow("Remove E2E_WORKSPACE");
  });

  it("requires materialization and rejects paths", async () => {
    await maintainer();
    expect(() => resolveApplicationWorkspace(root, {})).toThrow(
      "compose storefront-contentstack --copy-env"
    );
    expect(() =>
      resolveApplicationWorkspace(root, { E2E_WORKSPACE: "../source" })
    ).toThrow("Remove E2E_WORKSPACE");
  });

  it("refuses a storefront whose providers differ from the runner", async () => {
    await maintainer();
    const workspace = await composition("storefront-contentstack");
    await writeFile(
      path.join(workspace, "apps/web/package.json"),
      JSON.stringify({
        dependencies: { "@repo/auth": "workspace:@repo/auth-clerk@*" },
      })
    );
    expect(() => resolveApplicationWorkspace(root, {})).toThrow(
      "@repo/auth must select auth-workos"
    );
  });

  it("keeps externally hosted regression tests independent of local materialization", async () => {
    await maintainer();
    expect(
      resolveApplicationWorkspace(root, {
        CI: "true",
        E2E_ADMIN_URL: "https://admin.example.test",
        E2E_API_URL: "https://api.example.test",
        E2E_WEB_URL: "https://web.example.test",
      })
    ).toBe(root);
  });
});
