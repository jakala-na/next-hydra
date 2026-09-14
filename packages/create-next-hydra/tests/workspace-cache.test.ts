import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCommand, runGit } from "../src/git.js";
import { workspaceTaskConfiguration } from "../src/workspace-tasks.js";
import { updateWorkspaceFiles } from "../src/workspace-update.js";
import type { WorkspaceFile } from "../src/workspace-update.js";

const turbo = path.resolve(
  import.meta.dirname,
  "../../../node_modules/.bin/turbo"
);
function file(target: string, content: string) {
  return {
    content: Buffer.from(content),
    mode: 0o644,
    owner: "fixture",
    target,
  };
}

async function install(cwd: string): Promise<void> {
  await runCommand("pnpm", ["install", "--offline", "--no-frozen-lockfile"], {
    cwd,
  });
}

describe("application task caching", () => {
  let scratch: string;
  let target: string;
  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), "workspace-cache-"));
    target = path.join(scratch, "workspaces/site");
    await mkdir(target, { recursive: true });
  });
  afterEach(async () => {
    await rm(scratch, { force: true, recursive: true });
  });

  async function refresh(
    files: WorkspaceFile[],
    installDependencies?: (cwd: string) => Promise<void>
  ) {
    return await updateWorkspaceFiles({
      dependencyDirectories: ["."],
      dependencyHash: "fixture",
      files,
      install: installDependencies,
      rejectUnowned: true,
      sourceRoot: scratch,
      targetRoot: target,
    });
  }

  it.each([
    "ANALYZE",
    "VERCEL",
    "SENTRY_ORG",
    "SENTRY_PROJECT",
    "SENTRY_AUTH_TOKEN",
  ])(
    "rebuilds when the %s build setting changes without an env file",
    async (variable) => {
      const files = [
        file(
          "package.json",
          JSON.stringify({
            name: "site",
            packageManager: "pnpm@10.11.0",
            private: true,
          })
        ),
        file("pnpm-workspace.yaml", "packages:\n  - apps/*\n"),
        file(
          "pnpm-lock.yaml",
          "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/web: {}\n"
        ),
        file(
          "apps/web/package.json",
          JSON.stringify({ name: "web", scripts: { build: "node build.mjs" } })
        ),
        file(
          "apps/web/build.mjs",
          `import { mkdir, writeFile } from "node:fs/promises"; await mkdir(".next", { recursive: true }); await writeFile(".next/result", process.env.${variable});`
        ),
      ];
      await refresh([
        ...files,
        file(
          "turbo.json",
          JSON.stringify(
            workspaceTaskConfiguration(
              files.map((entry) => [entry.target, entry])
            )
          )
        ),
      ]);
      const build = async (value: string) => {
        const command = await runCommand(
          turbo,
          [
            "run",
            "build",
            "--filter=web",
            "--cache=local:rw",
            "--cache-dir=node_modules/.cache/turbo",
          ],
          {
            cwd: target,
            env: {
              [variable]: value,
              NODE_ENV: "test",
              TURBO_TELEMETRY_DISABLED: "1",
            },
          }
        );
        return {
          cache: /cache (?<status>hit|miss)/u.exec(command.stdout)?.groups
            ?.status,
          output: await readFile(
            path.join(target, "apps/web/.next/result"),
            "utf-8"
          ),
        };
      };
      const first = await build("false");
      const changed = await build("true");
      await unlink(path.join(target, "apps/web/.next/result"));
      const restored = await build("true");
      expect({ changed, first, restored }).toEqual({
        changed: { cache: "miss", output: "true" },
        first: { cache: "miss", output: "false" },
        restored: { cache: "hit", output: "true" },
      });
    },
    30_000
  );

  it("keeps pnpm's normalized lockfile and restored caches without reinstalling unchanged dependencies", async () => {
    await mkdir(path.join(target, "node_modules/.cache/turbo"), {
      recursive: true,
    });
    await writeFile(
      path.join(target, "node_modules/.cache/turbo/sentinel"),
      "keep"
    );
    const files = [
      file(
        "package.json",
        JSON.stringify({
          name: "site",
          packageManager: "pnpm@10.11.0",
          private: true,
          scripts: {
            preinstall: `node -e "require('node:fs').appendFileSync('node_modules/.cache/install-count', 'x')"`,
          },
        })
      ),
      file("pnpm-workspace.yaml", "packages:\n  - apps/*\n"),
      file("pnpm-lock.yaml", "lockfileVersion: '9.0'\nimporters:\n  .: {}\n"),
    ];
    await refresh(files, install);
    const lockfile = await readFile(
      path.join(target, "pnpm-lock.yaml"),
      "utf-8"
    );
    const result = await refresh(files, install);
    expect({
      cache: await readFile(
        path.join(target, "node_modules/.cache/turbo/sentinel"),
        "utf-8"
      ),
      installs: await readFile(
        path.join(target, "node_modules/.cache/install-count"),
        "utf-8"
      ),
      lockfile: await readFile(path.join(target, "pnpm-lock.yaml"), "utf-8"),
      result,
    }).toMatchObject({
      cache: "keep",
      installs: "x",
      lockfile,
      result: { changed: 0, needsInstall: false },
    });
  }, 30_000);

  it.each(["copied", "linked"])(
    "restores outputs and invalidates %s source, dependency source and environment changes",
    async (mode) => {
      await runGit(["init", "--quiet"], { cwd: scratch });
      await writeFile(path.join(scratch, ".gitignore"), "workspaces/\n");
      const source = path.join(scratch, "canonical.txt");
      await writeFile(source, "first");
      const files = [
        file(
          "package.json",
          JSON.stringify({
            name: "site",
            packageManager: "pnpm@10.11.0",
            private: true,
          })
        ),
        file("pnpm-workspace.yaml", "packages:\n  - apps/*\n  - packages/*\n"),
        file(
          "pnpm-lock.yaml",
          "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/web:\n    dependencies:\n      content:\n        specifier: workspace:*\n        version: link:../../packages/content\n  packages/content: {}\n"
        ),
        file(".gitignore", "node_modules/\n.next/\n.turbo/\n"),
        file(
          "apps/web/package.json",
          JSON.stringify({
            dependencies: { content: "workspace:*" },
            name: "web",
            scripts: { build: "node build.mjs" },
          })
        ),
        file(
          "apps/web/build.mjs",
          'import { mkdir, readFile, writeFile } from "node:fs/promises"; await mkdir(".next", {recursive:true}); await writeFile(".next/result", (await readFile("source.txt", "utf8")) + (await readFile("../../packages/content/source.txt", "utf8")) + process.env.CACHE_TEST_FLAVOR);'
        ),
        file("apps/web/.env.example", "CACHE_TEST_FLAVOR=\n"),
        file(
          "packages/content/package.json",
          JSON.stringify({ name: "content", private: true })
        ),
        file("packages/content/source.txt", "dependency"),
      ];
      const config = workspaceTaskConfiguration(
        files.map((entry) => [entry.target, entry])
      );
      const commonFiles = [
        ...files,
        file("turbo.json", JSON.stringify(config)),
      ];
      const sources = (content: string): WorkspaceFile[] => [
        ...commonFiles,
        mode === "linked"
          ? { owner: "fixture", source, target: "apps/web/source.txt" }
          : file("apps/web/source.txt", content),
      ];
      const build = async (flavor = "A") => {
        const command = await runCommand(
          turbo,
          [
            "run",
            "build",
            "--filter=web",
            "--cache=local:rw",
            "--cache-dir=node_modules/.cache/turbo",
          ],
          {
            cwd: target,
            env: {
              CACHE_TEST_FLAVOR: flavor,
              NODE_ENV: "test",
              TURBO_TELEMETRY_DISABLED: "1",
            },
          }
        );
        return {
          cache: /cache (?<status>hit|miss)/u.exec(command.stdout)?.groups
            ?.status,
          output: await readFile(
            path.join(target, "apps/web/.next/result"),
            "utf-8"
          ),
        };
      };
      await refresh(sources("first"));
      const first = await build();
      await mkdir(path.join(target, "apps/web/.next/cache"), {
        recursive: true,
      });
      await writeFile(
        path.join(target, "apps/web/.next/cache/sentinel"),
        "keep"
      );
      await refresh(sources("first"));
      await unlink(path.join(target, "apps/web/.next/result"));
      const unchanged = await build();
      // Linked source changes are live: build directly, without composing again.
      await (mode === "linked"
        ? writeFile(path.join(target, "apps/web/source.txt"), "second")
        : refresh(sources("second")));
      const sourceChanged = await build();
      await writeFile(
        path.join(target, "packages/content/source.txt"),
        "updated"
      );
      const dependencyChanged = await build();
      const environmentChanged = await build("B");
      expect({
        cache: await readFile(
          path.join(target, "apps/web/.next/cache/sentinel"),
          "utf-8"
        ),
        dependencyChanged,
        environmentChanged,
        first,
        sourceChanged,
        unchanged,
      }).toEqual({
        cache: "keep",
        dependencyChanged: { cache: "miss", output: "secondupdatedA" },
        environmentChanged: { cache: "miss", output: "secondupdatedB" },
        first: { cache: "miss", output: "firstdependencyA" },
        sourceChanged: { cache: "miss", output: "seconddependencyA" },
        unchanged: { cache: "hit", output: "firstdependencyA" },
      });
    },
    30_000
  );
});
