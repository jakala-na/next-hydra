import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { cloneStarter } from "../src/clone.js";
import { composeWorkspace } from "../src/compose.js";
import { readPackageJson } from "../src/composition/packages.js";
import { updateDevelopmentWorkspace } from "../src/development-workspaces.js";
import { writeJsonFile } from "../src/fs-utils.js";
import { runCommand, runGit } from "../src/git.js";
import { scaffoldProject } from "../src/scaffold.js";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const selectionSchema =
  "https://raw.githubusercontent.com/jakala-na/next-hydra/main/packages/create-next-hydra/schema/selection-definition.json";

async function inventory(root: string) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return new Map(
    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const absolute = path.join(entry.parentPath, entry.name);
          return [
            path.relative(root, absolute),
            createHash("sha256")
              .update(await readFile(absolute))
              .digest("hex"),
          ] as const;
        })
    )
  );
}

describe("shared customer and developer construction", () => {
  let scratch: string;
  let source: string;
  beforeAll(async () => {
    scratch = await mkdtemp(
      path.join(tmpdir(), "workspace-construction-test-")
    );
    source = path.join(scratch, "source");
    await cloneStarter({
      repoUrl: repoRoot,
      targetPath: source,
      verbose: false,
    });
    await mkdir(path.join(source, "packages/fixture-peer"), {
      recursive: true,
    });
    await writeJsonFile(
      path.join(source, "packages/fixture-peer/package.json"),
      { name: "@repo/fixture-peer" }
    );
    await writeFile(
      path.join(source, "packages/fixture-peer/index.ts"),
      "export const peer = true;\n"
    );
    const webManifestPath = path.join(
      source,
      "apps/web/registry/apps/web/package.json"
    );
    const webManifest = await readPackageJson(webManifestPath);
    await writeJsonFile(webManifestPath, {
      ...webManifest,
      scripts: {
        ...z.record(z.string()).parse(webManifest.scripts ?? {}),
        "dev:app":
          "pnpm run inspect && node -e \"console.log('DEV_PORT=' + process.env.PORT)\"",
        inspect: "node --version",
      },
    });
    await runGit(
      [
        "add",
        "packages/fixture-peer",
        "apps/web/registry/apps/web/package.json",
      ],
      { cwd: source }
    );
    await runGit(
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "Add peer fixture",
      ],
      { cwd: source }
    );
  });

  afterAll(async () => {
    await rm(scratch, { force: true, recursive: true });
  });

  it.each(["customer", "developer"])(
    "%s adapts Portless hosting without replacing a compound development command",
    async (mode) => {
      const name = `hosting-command-${mode}`;
      const target =
        mode === "developer"
          ? path.join(source, "workspaces", name)
          : path.join(scratch, name);
      if (mode === "developer") {
        await mkdir(target, { recursive: true });
        await writeJsonFile(path.join(target, "next-hydra.json"), {
          addOns: [],
          providers: { cms: "contentstack" },
        });
        await updateDevelopmentWorkspace(source, name, { install: false });
      } else {
        await scaffoldProject(
          {
            cms: "contentstack",
            commit: false,
            repoUrl: source,
            skipGit: true,
            targetDir: target,
            verbose: false,
            without: ["auth", "commerce"],
            yes: true,
          },
          { install: async () => {} }
        );
      }
      const web = path.join(target, "apps/web");
      const manifest = await readPackageJson(path.join(web, "package.json"));
      expect(manifest.portless).toEqual({
        name: `web.${name}`,
        script: "dev:app",
      });
      const bin = path.join(target, "node_modules/.bin");
      await mkdir(bin, { recursive: true });
      await symlink(
        path.join(repoRoot, "node_modules/portless/dist/cli.js"),
        path.join(bin, "portless")
      );
      // Exercise the real Portless script dispatcher without starting a proxy
      // or modifying the machine's certificates in this command-contract test.
      const result = await runCommand("pnpm", ["run", "dev"], {
        cwd: web,
        env: { NODE_ENV: "test", PORT: "3900", PORTLESS: "0" },
      });
      expect(result.stdout).toContain("DEV_PORT=3900");
    },
    30_000
  );

  it.each(["customer", "developer"])(
    "%s preserves and executes an external application's own standard commands",
    async (mode) => {
      const name = `external-commands-${mode}`;
      const registry = path.join(scratch, `${name}.json`);
      const scripts = {
        build: "pnpm run generate && node verify.cjs",
        dev: "node verify.cjs",
        "dev:app": "node verify.cjs",
        "dev:public": "node verify.cjs",
        generate:
          "node -e \"require('node:fs').writeFileSync('generated.txt', 'package-owned')\"",
        start: "node verify.cjs",
        test: "node --test verify.cjs",
        typecheck: "node verify.cjs",
      };
      await writeJsonFile(registry, {
        $schema: selectionSchema,
        files: [
          {
            content: JSON.stringify({
              dependencies: { next: "catalog:" },
              name: "portal",
              private: true,
              scripts,
            }),
            path: "package.json",
            target: "~/apps/portal/package.json",
            type: "registry:file",
          },
          {
            content:
              "require('node:assert/strict').equal(require('node:fs').readFileSync('generated.txt', 'utf-8'), 'package-owned'); console.log('PACKAGE_COMMAND_RAN');\n",
            path: "verify.cjs",
            target: "~/apps/portal/verify.cjs",
            type: "registry:file",
          },
        ],
        meta: { nextHydra: { id: `fixture/add-on/${name}`, kind: "add-on" } },
        name,
        type: "registry:item",
      });
      const target =
        mode === "developer"
          ? path.join(source, "workspaces", name)
          : path.join(scratch, name);
      if (mode === "developer") {
        await mkdir(target, { recursive: true });
        await writeJsonFile(path.join(target, "next-hydra.json"), {
          addOns: [registry],
          providers: { cms: "contentstack" },
        });
        await updateDevelopmentWorkspace(source, name, { install: false });
      } else {
        await scaffoldProject(
          {
            addOns: [registry],
            cms: "contentstack",
            commit: false,
            repoUrl: source,
            skipGit: true,
            targetDir: target,
            verbose: false,
            without: ["auth", "commerce"],
            yes: true,
          },
          { install: async () => {} }
        );
      }
      const manifest = await readPackageJson(
        path.join(target, "apps/portal/package.json")
      );
      expect(manifest.scripts).toEqual(scripts);
      const build = await runCommand("pnpm", ["run", "build"], {
        cwd: path.join(target, "apps/portal"),
      });
      expect(build.stdout).toContain("PACKAGE_COMMAND_RAN");
      const test = await runCommand("pnpm", ["run", "test"], {
        cwd: path.join(target, "apps/portal"),
      });
      expect(test.stdout).toContain("pass 1");
    },
    30_000
  );

  it.each(["customer", "developer"])(
    "%s tasks preserve environment access, package commands and failing build gates",
    async (mode) => {
      const name = `task-contract-${mode}`;
      const target =
        mode === "developer"
          ? path.join(source, "workspaces", name)
          : path.join(scratch, name);
      if (mode === "developer") {
        await mkdir(target, { recursive: true });
        await writeJsonFile(path.join(target, "next-hydra.json"), {
          addOns: [],
          providers: { cms: "contentstack" },
        });
        await updateDevelopmentWorkspace(source, name, { install: false });
      } else {
        await scaffoldProject(
          {
            cms: "contentstack",
            commit: false,
            repoUrl: source,
            skipGit: true,
            targetDir: target,
            verbose: false,
            without: ["auth", "commerce"],
            yes: true,
          },
          { install: async () => {} }
        );
      }
      const webManifest = await readPackageJson(
        path.join(target, "apps/web/package.json")
      );
      expect(webManifest.scripts).toMatchObject({
        inspect: "node --version",
      });
      // Substitute only task payloads, so the real materialized task graph is under test.
      await writeJsonFile(path.join(target, "apps/web/package.json"), {
        name: "web",
        private: true,
        scripts: {
          build:
            "node -e \"if(process.env.COMPOSITION_TEST_SECRET !== 'fixture') process.exit(2); require('node:fs').writeFileSync('build-marker', 'ok'); console.log('BUILD_EXECUTED')\"",
          test: "node -e \"if(process.env.COMPOSITION_FAIL_GATE === 'test') process.exit(1)\"",
          typecheck:
            "node -e \"if(process.env.COMPOSITION_FAIL_GATE === 'typecheck') process.exit(1)\"",
        },
      });
      const turbo = path.join(repoRoot, "node_modules/.bin/turbo");
      const build = async (gate: string) =>
        await runCommand(turbo, ["run", "build", "--filter=web", "--force"], {
          cwd: target,
          env: {
            COMPOSITION_FAIL_GATE: gate,
            COMPOSITION_TEST_SECRET: "fixture",
            NODE_ENV: "test",
          },
        });
      await expect(build("typecheck")).rejects.toMatchObject({
        code: 1,
      });
      await expect(build("test")).rejects.toMatchObject({
        code: 1,
      });
      await expect(
        lstat(path.join(target, "apps/web/build-marker"))
      ).rejects.toMatchObject({ code: "ENOENT" });
      const built = await build("none");
      expect(built.stdout).toContain("BUILD_EXECUTED");
    },
    30_000
  );

  it("initializes and refreshes named workspaces without owning or replacing registry environment defaults", async () => {
    const name = "environment-lifecycle";
    const target = path.join(source, "workspaces", name);
    const addOn = path.join(scratch, "environment-addon.json");
    await writeJsonFile(addOn, {
      $schema: selectionSchema,
      envVars: { EXTERNAL_TEST_VALUE: "registry-default" },
      meta: { nextHydra: { id: "fixture/add-on/environment", kind: "add-on" } },
      name: "environment-addon",
      type: "registry:item",
    });
    await mkdir(target, { recursive: true });
    const definition = path.join(target, "next-hydra.json");
    await writeJsonFile(definition, {
      addOns: [addOn],
      providers: { cms: "contentstack" },
    });
    await updateDevelopmentWorkspace(source, name, {
      check: true,
      install: false,
    });
    await expect(lstat(path.join(target, ".env.local"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await updateDevelopmentWorkspace(source, name, { install: false });
    await expect(
      readFile(path.join(target, ".env.local"), "utf-8")
    ).resolves.toContain("EXTERNAL_TEST_VALUE=registry-default");
    const credentials =
      "# local credentials\nEXTERNAL_TEST_VALUE=local-secret\n";
    await writeFile(path.join(target, ".env.local"), credentials);
    const refreshed = await updateDevelopmentWorkspace(source, name, {
      install: false,
    });
    expect(refreshed).toMatchObject({
      changed: 0,
      conflicts: [],
      removed: 0,
      unowned: [],
    });
    await writeJsonFile(definition, {
      addOns: [],
      providers: { cms: "contentstack" },
    });
    await updateDevelopmentWorkspace(source, name, { install: false });
    const state = await readFile(
      path.join(target, ".workspace-composition.json"),
      "utf-8"
    );
    expect({
      credentials: await readFile(path.join(target, ".env.local"), "utf-8"),
      ownsEnv: state.includes('".env.local"'),
      recordsSecret: state.includes("local-secret"),
    }).toEqual({ credentials, ownsEnv: false, recordsSecret: false });
  }, 30_000);

  it.each([
    { auth: undefined, cms: "contentstack", commerce: undefined },
    { auth: undefined, cms: "drupal", commerce: undefined },
    { auth: "workos", cms: "contentstack", commerce: "commercetools" },
    { auth: "clerk", cms: "drupal", commerce: "commercetools" },
  ])(
    "produces byte-identical copied output for $cms / $auth",
    async (selection) => {
      const name = `${selection.cms}-${selection.auth ?? "cms"}`;
      const customer = path.join(scratch, "customer", name);
      const developer = path.join(scratch, "developer", name);
      await mkdir(customer, { recursive: true });
      const result = await scaffoldProject(
        {
          ...selection,
          commit: false,
          repoUrl: source,
          skipGit: true,
          targetDir: customer,
          verbose: false,
          without: selection.commerce ? [] : ["auth", "commerce"],
          yes: true,
        },
        { install: async () => {} }
      );
      await composeWorkspace(
        developer,
        { ...selection, install: false },
        { name, sourceRoot: source }
      );
      await expect(inventory(customer)).resolves.toEqual(
        await inventory(developer)
      );
      expect(result.packageName).toBe(name);
      await expect(
        lstat(path.join(customer, ".workspace-create.lock"))
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(lstat(path.join(customer, ".git"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
    30_000
  );

  it("materializes external packages, transitive registry items and standard registry effects in both workflows", async () => {
    const dependency = path.join(scratch, "external-dependency.json");
    await writeJsonFile(dependency, {
      files: [
        {
          content: "export const external = true;\n",
          path: "index.ts",
          target: "~/packages/external/index.ts",
          type: "registry:file",
        },
      ],
      name: "external-dependency",
      type: "registry:item",
    });
    const external = path.join(scratch, "external-selection.json");
    await writeJsonFile(external, {
      $schema: selectionSchema,
      dependencies: ["nanoid@^5.1.6"],
      envVars: { EXTERNAL_TEST_VALUE: "dummy" },
      files: [
        {
          content: JSON.stringify({ name: "api", private: true }),
          path: "api-package.json",
          target: "~/apps/api/package.json",
          type: "registry:file",
        },
        {
          content: JSON.stringify({
            name: "@repo/external",
            peerDependencies: { "@repo/fixture-peer": "workspace:*" },
          }),
          path: "package.json",
          target: "~/packages/external/package.json",
          type: "registry:file",
        },
        {
          content: "export const GET = () => new Response('external');\n",
          path: "route.ts",
          target: "~/apps/web/app/api/external/route.ts",
          type: "registry:file",
        },
      ],
      meta: {
        nextHydra: {
          id: "fixture/add-on/external",
          kind: "add-on",
          packages: [
            {
              cwd: "apps/web",
              name: "@repo/external",
              section: "dependencies",
              specifier: "workspace:*",
            },
          ],
        },
      },
      name: "external-selection",
      registryDependencies: [dependency],
      type: "registry:item",
    });
    const customer = path.join(scratch, "external-customer");
    const developer = path.join(scratch, "external-developer");
    await scaffoldProject(
      {
        addOns: [external],
        cms: "contentstack",
        commit: false,
        repoUrl: source,
        skipGit: true,
        targetDir: customer,
        verbose: false,
        without: ["auth", "commerce"],
        yes: true,
      },
      { install: async () => {} }
    );
    await composeWorkspace(
      developer,
      { addOns: [external], cms: "contentstack", install: false },
      { name: "external-customer", sourceRoot: source }
    );
    await expect(inventory(customer)).resolves.toEqual(
      await inventory(developer)
    );
    await expect(
      readFile(path.join(customer, "packages/external/index.ts"), "utf-8")
    ).resolves.toContain("external = true");
    await expect(
      readFile(path.join(customer, "package.json"), "utf-8")
    ).resolves.toContain('"nanoid": "^5.1.6"');
    await expect(
      readFile(path.join(customer, ".env.local"), "utf-8")
    ).resolves.toContain("EXTERNAL_TEST_VALUE=dummy");
    const linked = path.join(source, "workspaces/external-linked");
    await composeWorkspace(
      linked,
      { addOns: [external], cms: "contentstack", install: false, linked: true },
      { sourceRoot: source }
    );
    const implementation = await lstat(
      path.join(linked, "packages/external/index.ts")
    );
    const peer = await lstat(path.join(linked, "packages/fixture-peer"));
    const backend = await lstat(path.join(linked, "apps/api/package.json"));
    expect({
      backend: backend.isFile(),
      linked: implementation.isSymbolicLink(),
      peer: peer.isDirectory(),
    }).toEqual({ backend: true, linked: false, peer: true });
  }, 30_000);

  it("does not claim Git covers external registry items that contain no files", async () => {
    const external = path.join(scratch, "external-environment.json");
    await writeJsonFile(external, {
      $schema: selectionSchema,
      envVars: { EXTERNAL_TEST_VALUE: "dummy" },
      meta: {
        nextHydra: { id: "fixture/add-on/environment", kind: "add-on" },
      },
      name: "external-environment",
      type: "registry:item",
    });
    const result = await composeWorkspace(
      path.join(scratch, "external-environment-workspace"),
      { addOns: [external], cms: "contentstack", install: false },
      { sourceRoot: source }
    );
    expect(result.sourceInputs.complete).toBeFalsy();
    await expect(
      readFile(path.join(result.targetRoot, ".env.local"), "utf-8")
    ).resolves.toContain("EXTERNAL_TEST_VALUE=dummy");
  }, 30_000);

  it("preserves partial customer output when installation fails", async () => {
    const target = path.join(scratch, "failed-install");
    await expect(
      scaffoldProject(
        {
          cms: "contentstack",
          commit: false,
          repoUrl: source,
          skipGit: true,
          targetDir: target,
          verbose: false,
          without: ["auth", "commerce"],
          yes: true,
        },
        {
          install: async () => {
            await writeFile(path.join(target, "keep-me.txt"), "local work");
            throw new Error("fixture install failure");
          },
        }
      )
    ).rejects.toThrow("fixture install failure");
    await expect(
      readFile(path.join(target, "keep-me.txt"), "utf-8")
    ).resolves.toBe("local work");
    await expect(
      lstat(path.join(target, ".workspace-create.lock"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  }, 30_000);

  it("uses the requested source ref instead of the repository's current checkout", async () => {
    const { stdout } = await runGit(["rev-parse", "HEAD"], { cwd: source });
    const readme = path.join(source, "packages/cms-contentstack/README.md");
    const pinnedContent = await readFile(readme, "utf-8");
    await writeFile(readme, `${pinnedContent}\nUNSELECTED_REVISION_MARKER\n`);
    await runGit(["add", "packages/cms-contentstack/README.md"], {
      cwd: source,
    });
    await runGit(
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-m",
        "Change current source",
      ],
      { cwd: source }
    );
    const target = path.join(scratch, "pinned");
    await scaffoldProject(
      {
        cms: "contentstack",
        commit: false,
        ref: stdout.trim(),
        repoUrl: source,
        skipGit: true,
        targetDir: target,
        verbose: false,
        without: ["auth", "commerce"],
        yes: true,
      },
      { install: async () => {} }
    );
    await expect(
      readFile(
        path.join(target, "packages/cms-contentstack/README.md"),
        "utf-8"
      )
    ).resolves.not.toContain("UNSELECTED_REVISION_MARKER");
  }, 30_000);
});
