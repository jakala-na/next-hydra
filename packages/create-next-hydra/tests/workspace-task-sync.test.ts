import { spawnSync } from "node:child_process";
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { registryItemSchema } from "shadcn/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { git } from "../scripts/deployment-git.mts";
import { cloneStarter } from "../src/clone.js";
import { composeWorkspace } from "../src/compose.js";
import { readPackageJson } from "../src/composition/packages.js";
import { updateDevelopmentWorkspace } from "../src/development-workspaces.js";
import { writeJsonFile } from "../src/fs-utils.js";
import { runCommand } from "../src/git.js";
import { workspaceSourceFiles } from "../src/workspace-files.js";
import {
  planWorkspaceTaskFiles,
  syncWorkspaceTasks,
} from "../src/workspace-task-sync.js";

const repo = path.resolve(import.meta.dirname, "../../..");
const turbo = path.join(repo, "node_modules/.bin/turbo");
const environment = {
  NODE_ENV: "test",
  TURBO_TELEMETRY_DISABLED: "1",
} satisfies NodeJS.ProcessEnv;
const webManifest = "apps/web/registry/apps/web/package.json";
const cmsManifest = "packages/cms-contentstack/package.json";
const providerSource = "packages/cms-contentstack/keys.ts";
const templateSource = "apps/web/registry/templates/layout.tsx.template";
const dependencySource = "packages/cache-proof/value.txt";
const buildScript = `node -e 'const fs = require("node:fs"); const crypto = require("node:crypto"); const files = ["../../packages/cms-contentstack/keys.ts", "app/[locale]/layout.tsx", "../../packages/cache-proof/value.txt", "proof-recipe.txt"]; const input = files.map(p => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "absent").join("\\n"); fs.mkdirSync(".next", { recursive: true }); fs.writeFileSync(".next/result", crypto.createHash("sha256").update(input).digest("hex"));'`;

describe("composition selection agrees with customer-compatible Turbo builds", () => {
  let scratch: string;
  let source: string;
  let target: string;
  let base: string;
  function commit(message: string) {
    git(source, ["add", "--all"]);
    git(source, [
      "-c",
      "user.name=Composition Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "--quiet",
      "-m",
      message,
    ]);
    return git(source, ["rev-parse", "HEAD"]).trim();
  }
  async function build(directory: string) {
    const result = await runCommand(
      turbo,
      [
        "run",
        "build",
        "--filter=web",
        "--cache=local:rw",
        "--cache-dir=node_modules/.cache/turbo",
      ],
      { cwd: directory, env: environment }
    );
    return {
      hit: result.stdout.includes("web:build: cache hit"),
      output: await readFile(
        path.join(directory, "apps/web/.next/result"),
        "utf-8"
      ),
    };
  }
  function affected() {
    return spawnSync(
      process.execPath,
      [
        path.join(
          repo,
          "packages/create-next-hydra/scripts/ignore-vercel-build.mjs"
        ),
      ],
      {
        cwd: path.join(target, "apps/web"),
        encoding: "utf-8",
        env: {
          ...process.env,
          ...environment,
          PATH: `${path.join(repo, "node_modules/.bin")}:${process.env.PATH}`,
          VERCEL_FORCE_BUILD: "",
          VERCEL_GIT_PREVIOUS_SHA: base,
        },
      }
    ).status;
  }
  async function writeTasks() {
    const tasks = await planWorkspaceTaskFiles(source, "proof");
    await mkdir(path.join(target, "tasks"), { recursive: true });
    await Promise.all(
      Object.entries(tasks).map(async ([name, value]) => {
        await writeJsonFile(path.join(target, "tasks", name), value);
      })
    );
  }
  beforeAll(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "composition-turbo-parity-"));
    source = path.join(scratch, "source");
    target = path.join(source, "workspaces/proof");
    await cloneStarter({ repoUrl: repo, targetPath: source, verbose: false });
    await mkdir(target, { recursive: true });
    await writeJsonFile(path.join(target, "next-hydra.json"), {
      addOns: [],
      providers: { cms: "contentstack" },
    });
    await writeFile(
      path.join(source, "workspaces/.gitignore"),
      "!proof/\n!proof/**\n"
    );
    await appendFile(
      path.join(source, ".gitignore"),
      "\n!/workspaces/proof/\n!/workspaces/proof/next-hydra.json\n!/workspaces/proof/tasks/\n!/workspaces/proof/tasks/package.json\n!/workspaces/proof/tasks/turbo.json\n"
    );
    const yaml = z
      .object({ packages: z.array(z.string()) })
      .passthrough()
      .parse(
        parseYaml(
          await readFile(path.join(source, "pnpm-workspace.yaml"), "utf-8")
        )
      );
    yaml.packages.push("workspaces/*/tasks");
    await writeFile(
      path.join(source, "pnpm-workspace.yaml"),
      stringifyYaml(yaml)
    );
    await copyFile(
      path.join(repo, "pnpm-lock.yaml"),
      path.join(source, "pnpm-lock.yaml")
    );
    await appendFile(path.join(source, "pnpm-lock.yaml"), "\n");
    // Keep the real selected manifests/edges and task policy; replace task payloads to avoid external services.
    const files = await workspaceSourceFiles(source);
    await Promise.all(
      files
        .filter(
          (file) =>
            /^packages\/[^/]+\/package\.json$/u.test(file) ||
            file === webManifest
        )
        .map(async (file) => {
          const manifest = await readPackageJson(path.join(source, file));
          await writeJsonFile(path.join(source, file), {
            ...manifest,
            scripts:
              file === webManifest
                ? {
                    build: buildScript,
                    dev: "portless",
                    "dev:app": "node --version",
                  }
                : {},
          });
        })
    );
    const cms = await readPackageJson(path.join(source, cmsManifest));
    await writeJsonFile(path.join(source, cmsManifest), {
      ...cms,
      dependencies: { ...cms.dependencies, "@repo/cache-proof": "workspace:*" },
    });
    await mkdir(path.join(source, "packages/cache-proof"), { recursive: true });
    await writeJsonFile(
      path.join(source, "packages/cache-proof/package.json"),
      { name: "@repo/cache-proof" }
    );
    await writeFile(path.join(source, dependencySource), "initial dependency");
    // The cloned branch may precede the new task visibility policy.
    await writeJsonFile(path.join(source, "turbo.json"), {
      futureFlags: { affectedUsingTaskInputs: true },
      tasks: { build: {}, typecheck: {} },
    });
    await writeTasks();
    await updateDevelopmentWorkspace(source, "proof", {
      install: false,
      link: false,
    });
    git(source, [
      "add",
      "--force",
      "workspaces/proof/next-hydra.json",
      "workspaces/proof/tasks/package.json",
      "workspaces/proof/tasks/turbo.json",
    ]);
    base = commit("cache proof inputs");
  }, 60_000);

  afterAll(async () => {
    await rm(scratch, { force: true, recursive: true });
  });

  it.each([providerSource, templateSource, dependencySource])(
    "connects %s through affected selection, refresh, and both real build caches",
    async (file) => {
      const first = await build(target);
      const repeated = await build(target);
      await appendFile(
        path.join(source, file),
        "\n// changed source for cache proof\n"
      );
      commit(`change ${file}`);
      expect(affected()).toBe(1);
      await updateDevelopmentWorkspace(source, "proof", {
        install: false,
        link: false,
      });
      const refreshed = await build(target);
      expect({ changedHit: refreshed.hit, repeatHit: repeated.hit }).toEqual({
        changedHit: false,
        repeatHit: true,
      });
      expect(refreshed.output).not.toBe(first.output);
      const customer = path.join(scratch, `customer-${path.basename(file)}`);
      await composeWorkspace(
        customer,
        { cms: "contentstack", install: false },
        { name: "proof", report: () => undefined, sourceRoot: source }
      );
      const customerFirst = await build(customer);
      const customerRepeated = await build(customer);
      expect({
        config: await readFile(path.join(customer, "turbo.json"), "utf-8"),
        output: customerFirst.output,
        repeatHit: customerRepeated.hit,
      }).toEqual({
        config: await readFile(path.join(target, "turbo.json"), "utf-8"),
        output: refreshed.output,
        repeatHit: true,
      });
      await expect(
        readFile(path.join(customer, "tasks/package.json"))
      ).rejects.toThrow("ENOENT");
      base = git(source, ["rev-parse", "HEAD"]).trim();
    },
    60_000
  );

  it("tracks a registry recipe adding a file through materialization and both builds", async () => {
    const first = await build(target);
    const registryFile = path.join(
      source,
      "packages/cms-contentstack/registry.json"
    );
    const registry = z
      .object({ items: z.array(registryItemSchema) })
      .passthrough()
      .parse(JSON.parse(await readFile(registryFile, "utf-8")));
    const provider = registry.items.find(
      (item) => item.name === "cms-contentstack"
    );
    if (!provider) {
      throw new Error("Fixture CMS registry item is missing");
    }
    provider.files = [
      ...(provider.files ?? []),
      {
        path: "proof-recipe.txt",
        target: "~/apps/web/proof-recipe.txt",
        type: "registry:file",
      },
    ];
    await writeFile(
      path.join(source, "packages/cms-contentstack/proof-recipe.txt"),
      "recipe installed"
    );
    await writeJsonFile(registryFile, registry);
    commit("add package-owned recipe file");
    expect(affected()).toBe(1);
    await updateDevelopmentWorkspace(source, "proof", {
      install: false,
      link: false,
    });
    const refreshed = await build(target);
    expect(refreshed.hit).toBeFalsy();
    expect(refreshed.output).not.toBe(first.output);
    const customer = path.join(scratch, "customer-recipe");
    await composeWorkspace(
      customer,
      { cms: "contentstack", install: false },
      { name: "proof", report: () => undefined, sourceRoot: source }
    );
    const customerBuild = await build(customer);
    expect(customerBuild.output).toBe(refreshed.output);
    base = git(source, ["rev-parse", "HEAD"]).trim();
  }, 60_000);

  it("preserves task metadata and skips unselected provider changes without invalidating the build", async () => {
    const first = await build(target);
    const tasks = await readFile(
      path.join(target, "tasks/turbo.json"),
      "utf-8"
    );
    await appendFile(
      path.join(source, "packages/cms-drupal/keys.ts"),
      "\n// unrelated provider edit\n"
    );
    commit("unselected provider");
    expect(affected()).toBe(0);
    await updateDevelopmentWorkspace(source, "proof", {
      install: false,
      link: false,
    });
    await expect(build(target)).resolves.toEqual({
      hit: true,
      output: first.output,
    });
    await expect(
      readFile(path.join(target, "tasks/turbo.json"), "utf-8")
    ).resolves.toBe(tasks);
  }, 60_000);

  it("detects source membership drift using the real registry instead of a manually maintained inventory", async () => {
    await mkdir(path.join(source, "packages/cache-second"), {
      recursive: true,
    });
    await writeJsonFile(
      path.join(source, "packages/cache-second/package.json"),
      { name: "@repo/cache-second" }
    );
    await writeFile(
      path.join(source, "packages/cache-second/value.txt"),
      "new dependency"
    );
    const cms = await readPackageJson(path.join(source, cmsManifest));
    await writeJsonFile(path.join(source, cmsManifest), {
      ...cms,
      dependencies: {
        ...cms.dependencies,
        "@repo/cache-second": "workspace:*",
      },
    });
    const stale = await syncWorkspaceTasks(source, true);
    expect(stale).toContain(path.join(target, "tasks/turbo.json"));
    await writeTasks();
    const updated = await readFile(
      path.join(target, "tasks/turbo.json"),
      "utf-8"
    );
    expect(updated).toContain("$TURBO_ROOT$/packages/cache-second/**");
  }, 60_000);
});
