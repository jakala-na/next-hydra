import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

describe("named workspace task lifecycle through the installed CLI", () => {
  let scratch: string;
  let source: string;
  let target: string;

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

  beforeAll(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "workspace-task-lifecycle-"));
    source = path.join(scratch, "source");
    target = path.join(source, "workspaces/proof");
    const tool = path.join(scratch, "unused-tool");
    await mkdir(tool);
    await writeJsonFile(path.join(tool, "package.json"), {
      name: "unused-fixture-tool",
      version: "1.0.0",
    });
    const { catalog } = z
      .object({ catalog: z.object({ typescript: z.string() }) })
      .parse(
        parseYaml(
          await readFile(path.join(repo, "pnpm-workspace.yaml"), "utf-8")
        )
      );
    // Real Turbo and pnpm, with local-only tooling dependencies and a service-free app.
    await writeJsonFile(await fixtureFile("package.json"), {
      devDependencies: {
        portless: `link:${tool}`,
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
      futureFlags: { affectedUsingTaskInputs: true },
      tasks: { build: {}, "workspace:check": {}, "workspace:sync": {} },
    });
    await write(
      ".gitignore",
      "node_modules/\ndist/\n.turbo/\n/workspaces/*/*\n!/workspaces/*/next-hydra.json\n!/workspaces/*/tasks/\n"
    );
    await writeJsonFile(await fixtureFile(`${cli}/package.json`), {
      name: "create-next-hydra",
      scripts: {
        build: "node --check dist/cli.js",
        "workspace:check": "node dist/sync-workspace-tasks.js --check",
        "workspace:sync": "node dist/sync-workspace-tasks.js",
      },
      type: "module",
      version: "1.0.0",
    });
    await writeJsonFile(await fixtureFile(`${cli}/turbo.json`), {
      extends: ["//"],
      tasks: {
        build: { cache: false },
        "workspace:check": { cache: false },
        "workspace:sync": { cache: false },
      },
    });
    await writeJsonFile(await fixtureFile("apps/web/package.json"), {
      name: "web",
      scripts: {
        build:
          'node -e \'const fs = require("node:fs"); fs.mkdirSync(".next", {recursive:true}); fs.writeFileSync(".next/result", fs.readFileSync("../../packages/cms-fixture/content.txt"));\'',
      },
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

  afterAll(async () => {
    await rm(scratch, { force: true, recursive: true });
  });

  it("synchronizes a new definition so a fresh checkout installs with a frozen lockfile", async () => {
    await expect(pnpm(["workspace:check"])).rejects.toThrow(
      "Workspace Turbo metadata is stale"
    );
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
    const dependency = await lstat(
      path.join(fresh, "workspaces/proof/tasks/node_modules/create-next-hydra")
    );
    expect(dependency.isSymbolicLink()).toBeTruthy();
    await expect(
      lstat(path.join(fresh, "workspaces/proof/apps/web"))
    ).rejects.toThrow("ENOENT");
  }, 60_000);

  it("runs the generated outer task through composition, installation, and cached app builds", async () => {
    const args = [
      "exec",
      "turbo",
      "run",
      "build",
      "--filter=@workspaces/proof",
      "--cache=local:rw",
    ];
    await pnpm(args);
    const resultFile = path.join(target, "apps/web/.next/result");
    await expect(readFile(resultFile, "utf-8")).resolves.toBe("first version");
    const repeated = await pnpm(args);
    expect(repeated.stdout).toContain("web:build: cache hit");
    await write("packages/cms-fixture/content.txt", "second version");
    await pnpm(args);
    await expect(readFile(resultFile, "utf-8")).resolves.toBe("second version");
  }, 60_000);

  it("rejects stale lockfile membership without writes and repairs it even when task files are unchanged", async () => {
    const file = path.join(source, "pnpm-lock.yaml");
    const lock = z
      .object({ importers: z.record(z.unknown()) })
      .passthrough()
      .parse(parseYaml(await readFile(file, "utf-8")));
    delete lock.importers["workspaces/proof/tasks"];
    await writeFile(file, stringifyYaml(lock));
    const stale = await readFile(file, "utf-8");
    await expect(pnpm(["workspace:check"])).rejects.toThrow(
      "ERR_PNPM_OUTDATED_LOCKFILE"
    );
    await expect(readFile(file, "utf-8")).resolves.toBe(stale);
    await pnpm(["workspace:sync"]);
    const checked = await pnpm(["workspace:check"]);
    expect(checked.stdout).toContain(
      "Workspace Turbo metadata and lockfile are current."
    );
  }, 60_000);
});
