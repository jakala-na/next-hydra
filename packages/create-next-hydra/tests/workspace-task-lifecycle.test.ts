import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import { NEXT_HYDRA_SELECTION_SCHEMA_URL } from "../src/composition/schema.js";
import { writeJsonFile } from "../src/fs-utils.js";
import { CommandExecutionError, runCommand, runGit } from "../src/git.js";

const repo = path.resolve(import.meta.dirname, "../../..");
const cli = "packages/create-next-hydra";
const environment = {
  CI: "true",
  NODE_ENV: "test",
  TURBO_TELEMETRY_DISABLED: "1",
  npm_config_offline: "true",
} satisfies NodeJS.ProcessEnv;

describe("workspace synchronization through the installed CLI", () => {
  let scratch: string;
  let source: string;

  async function fixtureFile(file: string) {
    const absolute = path.join(source, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    return absolute;
  }

  async function write(file: string, content: string) {
    await writeFile(await fixtureFile(file), content);
  }

  async function pnpm(args: string[], cwd = source) {
    try {
      return await runCommand("pnpm", args, { cwd, env: environment });
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        throw new CommandExecutionError({
          code: error.code,
          command: error.command,
          message: `${error.message}\n${error.stdout}\n${error.stderr}`,
          stderr: error.stderr,
          stdout: error.stdout,
        });
      }
      throw error;
    }
  }

  beforeEach(async () => {
    scratch = await mkdtemp(
      path.join(await realpath(tmpdir()), "workspace-task-lifecycle-")
    );
    source = path.join(scratch, "source");
    const { catalog } = z
      .object({ catalog: z.object({ typescript: z.string() }) })
      .parse(
        parseYaml(
          await readFile(path.join(repo, "pnpm-workspace.yaml"), "utf-8")
        )
      );
    // Exercise the real workspace commands without external services.
    await writeJsonFile(await fixtureFile("package.json"), {
      devDependencies: {
        portless: `link:${path.join(repo, "node_modules/portless")}`,
        turbo: `link:${path.join(repo, "node_modules/turbo")}`,
      },
      packageManager: "pnpm@10.11.0",
      private: true,
      scripts: {
        "workspace:check":
          "turbo run workspace:check --filter=create-next-hydra",
        "workspace:sync": "turbo run workspace:sync --filter=create-next-hydra",
      },
    });
    await write(
      "pnpm-workspace.yaml",
      stringifyYaml({
        catalog,
        packages: ["apps/*", "packages/*", "workspaces/*/tasks"],
      })
    );
    await writeJsonFile(await fixtureFile("turbo.json"), {
      tasks: { "workspace:check": {}, "workspace:sync": {} },
    });
    await write(".gitignore", "node_modules/\ndist/\n.turbo/\n");
    await writeJsonFile(await fixtureFile(`${cli}/package.json`), {
      name: "create-next-hydra",
      scripts: {
        "workspace:check": "node dist/sync-workspace-tasks.js --check",
        "workspace:sync": "node dist/sync-workspace-tasks.js",
      },
      type: "module",
      version: "1.0.0",
    });
    await writeJsonFile(await fixtureFile(`${cli}/turbo.json`), {
      extends: ["//"],
      tasks: {
        "workspace:check": { cache: false },
        "workspace:sync": { cache: false },
      },
    });
    await writeJsonFile(await fixtureFile("apps/web/package.json"), {
      name: "web",
    });
    await writeJsonFile(
      await fixtureFile("packages/cms-fixture/package.json"),
      {
        name: "@repo/cms-fixture",
      }
    );
    await write("packages/cms-fixture/content.txt", "first version");
    await writeJsonFile(await fixtureFile("registry.json"), {
      homepage: "https://example.com",
      items: [
        {
          $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
          files: [
            {
              path: "apps/web/package.json",
              target: "~/apps/web/package.json",
              type: "registry:file",
            },
          ],
          meta: {
            nextHydra: {
              id: "fixture/recipe/web",
              kind: "recipe",
              providerDependencies: [
                { cwd: "apps/web", section: "dependencies", slot: "cms" },
              ],
            },
          },
          name: "app-web",
          type: "registry:item",
        },
        {
          $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL,
          files: ["package.json", "content.txt"].map((file) => ({
            path: `packages/cms-fixture/${file}`,
            target: `~/packages/cms-fixture/${file}`,
            type: "registry:file",
          })),
          meta: {
            nextHydra: {
              binding: { specifier: "workspace:@repo/cms-fixture@*" },
              id: "fixture/cms/provider",
              kind: "provider",
              slot: "cms",
            },
          },
          name: "cms-fixture",
          type: "registry:item",
        },
      ],
      name: "fixture",
    });
    await writeJsonFile(await fixtureFile("workspaces/proof/next-hydra.json"), {
      providers: { cms: "cms-fixture" },
    });
    await runGit(["init", "--quiet"], { cwd: source });
    await runCommand(
      "pnpm",
      [
        "exec",
        "tsc6",
        "-p",
        "tsconfig.json",
        "--outDir",
        path.join(source, cli, "dist"),
      ],
      {
        cwd: path.join(repo, cli),
        env: environment,
      }
    );
    await pnpm([
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-frozen-lockfile",
    ]);
    await symlink(
      path.join(repo, cli, "node_modules"),
      path.join(source, cli, "node_modules"),
      "dir"
    );
  }, 60_000);

  afterEach(async () => {
    await rm(scratch, { force: true, recursive: true });
  });

  it("reports missing task metadata without creating files or changing the lockfile", async () => {
    const lockfile = path.join(source, "pnpm-lock.yaml");
    const originalLockfile = await readFile(lockfile, "utf-8");
    await expect(pnpm(["workspace:check"])).rejects.toMatchObject({ code: 1 });
    await expect(readFile(lockfile, "utf-8")).resolves.toBe(originalLockfile);
    await expect(
      lstat(path.join(source, "workspaces/proof/tasks"))
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  }, 60_000);

  it("synchronizes through a symlinked temporary directory and cleans up staging", async () => {
    const physical = path.join(scratch, "physical-temp");
    const linked = path.join(scratch, "linked-temp");
    await mkdir(physical);
    await symlink(physical, linked, "dir");
    const entrypoint = path.join(source, cli, "dist/sync-workspace-tasks.js");
    const options = {
      cwd: source,
      env: {
        ...environment,
        NODE_DISABLE_COMPILE_CACHE: "1",
        TMPDIR: linked,
      },
    };

    await runCommand(process.execPath, [entrypoint], options);
    await expect(readdir(physical)).resolves.toEqual([]);
    await runCommand(process.execPath, [entrypoint, "--check"], options);
    await expect(readdir(physical)).resolves.toEqual([]);
  }, 60_000);

  it("synchronizes repeatably so a fresh checkout installs with a frozen lockfile", async () => {
    await pnpm(["workspace:sync"]);
    await pnpm(["workspace:check"]);
    await runGit(["add", "--all"], { cwd: source });
    await runGit(
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.com",
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "--quiet",
        "-m",
        "synchronized workspace",
      ],
      { cwd: source }
    );
    await pnpm(["workspace:sync"]);
    await pnpm(["workspace:check"]);
    const unchanged = await runGit(["status", "--porcelain"], { cwd: source });
    expect(unchanged.stdout).toBe("");
    const fresh = path.join(scratch, "fresh");
    await runGit(["clone", "--quiet", "--local", source, fresh]);
    const before = await readFile(path.join(fresh, "pnpm-lock.yaml"), "utf-8");
    await pnpm(
      ["install", "--offline", "--ignore-scripts", "--frozen-lockfile"],
      fresh
    );
    await expect(
      readFile(path.join(fresh, "pnpm-lock.yaml"), "utf-8")
    ).resolves.toBe(before);
    await expect(
      lstat(path.join(fresh, "workspaces/proof/apps/web"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  }, 60_000);

  it("rejects stale lockfile membership without writes and repairs it even when task files are unchanged", async () => {
    await pnpm(["workspace:sync"]);
    const file = path.join(source, "pnpm-lock.yaml");
    const lock = z
      .object({ importers: z.record(z.unknown()) })
      .passthrough()
      .parse(parseYaml(await readFile(file, "utf-8")));
    delete lock.importers["workspaces/proof/tasks"];
    await writeFile(file, stringifyYaml(lock));
    const stale = await readFile(file, "utf-8");
    await expect(pnpm(["workspace:check"])).rejects.toMatchObject({ code: 1 });
    await expect(readFile(file, "utf-8")).resolves.toBe(stale);
    await pnpm(["workspace:sync"]);
    await pnpm(["workspace:check"]);
    await pnpm([
      "install",
      "--offline",
      "--ignore-scripts",
      "--frozen-lockfile",
    ]);
  }, 60_000);
});
