/* oxlint-disable vitest/max-expects -- The matrix verifies one complete customer/development runner parity contract. */
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { composeWorkspace } from "../src/compose.js";
import { readPackageJson } from "../src/composition/packages.js";
import { updateDevelopmentWorkspace } from "../src/development-workspaces.js";
import { writeJsonFile } from "../src/fs-utils.js";
import { runGit } from "../src/git.js";
import { runWorkspaceE2E } from "../src/workspace-e2e.js";
import { createSourceRepository } from "./fixtures/source-repository.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("workspace-owned E2E runners", () => {
  let scratch: string;
  let source: string;
  beforeAll(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "workspace-e2e-"));
    source = path.join(scratch, "source");
    await createSourceRepository(repoRoot, source);
  }, 30_000);

  afterAll(async () => {
    await rm(scratch, { force: true, recursive: true });
  });

  it.each([
    { auth: undefined, commerce: undefined, name: "cms" },
    { auth: "workos", commerce: undefined, name: "auth" },
    { auth: "clerk", commerce: "commercetools", name: "storefront" },
  ])(
    "delivers identical selected runners for $name projects and named workspaces",
    async ({ name, auth, commerce }) => {
      const customer = path.join(scratch, name);
      const developer = path.join(source, "workspaces", name);
      await composeWorkspace(
        customer,
        { auth, cms: "contentstack", commerce, install: false },
        { name, report: () => {}, sourceRoot: source }
      );
      await mkdir(developer, { recursive: true });
      await writeJsonFile(path.join(developer, "next-hydra.json"), {
        addOns: [],
        providers: { auth, cms: "contentstack", commerce },
      });
      await updateDevelopmentWorkspace(source, name, { install: false });

      const directory = "tests/e2e";
      const files = await readdir(path.join(customer, directory), {
        recursive: true,
        withFileTypes: true,
      });
      await Promise.all(
        files
          .filter((entry) => entry.isFile())
          .map(async (file) => {
            const relative = path.relative(
              customer,
              path.join(file.parentPath, file.name)
            );
            const content = await readFile(
              path.join(customer, relative),
              "utf-8"
            );
            await expect(
              readFile(path.join(developer, relative), "utf-8")
            ).resolves.toBe(content);
            expect(content).not.toMatch(
              /create-next-hydra|storefront-contentstack|reference-workspace/u
            );
          })
      );
      const manifest = await readPackageJson(
        path.join(customer, directory, "package.json")
      );
      expect(manifest.devDependencies?.["create-next-hydra"]).toBeUndefined();
      expect(manifest.devDependencies?.web).toBe("workspace:*");
      expect(manifest.devDependencies?.["@repo/cms"]).toBe(
        "workspace:@repo/cms-contentstack@*"
      );
      expect(manifest.devDependencies?.["@repo/auth"]).toBe(
        auth ? `workspace:@repo/auth-${auth}@*` : undefined
      );
      expect(manifest.devDependencies?.api).toBe(
        commerce ? "workspace:*" : undefined
      );
      expect(files.some((file) => file.name === "commerce.ts")).toBe(
        Boolean(commerce)
      );
      await expect(
        readFile(path.join(customer, "pnpm-workspace.yaml"), "utf-8")
      ).resolves.toContain("tests/*");
      const rootManifest = await readPackageJson(
        path.join(customer, "package.json")
      );
      expect(rootManifest.scripts).toMatchObject({
        "test:e2e": "turbo run e2e",
      });
      const authFeatures = await readdir(
        path.join(customer, "packages/auth-contract/e2e/@auth")
      ).catch(() => []);
      expect(authFeatures).toEqual(commerce ? ["company-login.feature"] : []);
    },
    60_000
  );

  it("delegates arguments and failures to the selected project's own command", async () => {
    const root = path.join(scratch, "delegation");
    const workspace = path.join(root, "workspaces", "cms");
    await mkdir(workspace, { recursive: true });
    await runGit(["init"], { cwd: root });
    await writeJsonFile(path.join(workspace, "next-hydra.json"), {
      providers: { cms: "contentstack" },
    });
    await writeJsonFile(path.join(workspace, "package.json"), {
      private: true,
      scripts: { "test:e2e": "node runner.cjs" },
    });
    await writeFile(
      path.join(workspace, "runner.cjs"),
      `require('node:fs').writeFileSync('invoked.json', JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) })); if(process.argv.includes('--fail')) process.exit(7);\n`
    );
    await runWorkspaceE2E(root, "cms", ["--list"]);
    expect(
      JSON.parse(await readFile(path.join(workspace, "invoked.json"), "utf-8"))
    ).toEqual({ args: ["--", "--list"], cwd: workspace });
    await expect(
      runWorkspaceE2E(root, "cms", ["--fail"])
    ).rejects.toMatchObject({ code: 7 });
    await expect(runWorkspaceE2E(root, "../cms")).rejects.toThrow(
      "Unknown workspace"
    );
    await rm(path.join(workspace, "package.json"));
    await expect(runWorkspaceE2E(root, "cms")).rejects.toThrow(
      "compose cms first"
    );
  }, 15_000);
});
