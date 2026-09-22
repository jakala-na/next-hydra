import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readPackageJson } from "../src/composition/packages.js";
import {
  updateDevelopmentWorkspace,
  watchWorkspaceInputs,
} from "../src/development-workspaces.js";
import { writeJsonFile } from "../src/fs-utils.js";
import { createSourceRepository } from "./fixtures/source-repository.js";

const repository = path.resolve(import.meta.dirname, "../../..");
const fixture = "packages/watch-fixture";
const name = "watch-test";
let temporary: string;
let sourceRoot: string;
let targetRoot: string;
let controller: AbortController;
let watching: Promise<void> | undefined;
let watchFailure: Error | undefined;
let refreshes: number;
let duringRefresh: (() => Promise<void>) | undefined;

async function writeSource(relative: string, content: string): Promise<void> {
  const file = path.join(sourceRoot, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function output(): Promise<Record<string, string>> {
  if (watchFailure) {
    throw watchFailure;
  }
  const directory = path.join(targetRoot, fixture, "src");
  const files = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return Object.fromEntries(
    await Promise.all(
      files
        .filter((file) => file.isFile())
        .map(async (file) => {
          const absolute = path.join(file.parentPath, file.name);
          return [
            path.relative(directory, absolute),
            await readFile(absolute, "utf-8"),
          ] as const;
        })
    )
  );
}

async function watchSources(): Promise<void> {
  try {
    await watchWorkspaceInputs(
      sourceRoot,
      [name],
      async () => {
        await updateDevelopmentWorkspace(sourceRoot, name, { install: false });
        refreshes += 1;
        await duringRefresh?.();
      },
      controller.signal
    );
  } catch (error) {
    watchFailure =
      error instanceof Error
        ? error
        : new Error("Watcher failed.", { cause: error });
  }
}

describe("watching canonical source through real composition", () => {
  beforeEach(async () => {
    temporary = await mkdtemp(path.join(tmpdir(), "workspace-watch-"));
    sourceRoot = path.join(temporary, "source");
    targetRoot = path.join(sourceRoot, "workspaces", name);
    controller = new AbortController();
    watching = undefined;
    watchFailure = undefined;
    refreshes = 0;
    duringRefresh = undefined;
    await createSourceRepository(repository, sourceRoot);
    await writeSource(
      `${fixture}/package.json`,
      JSON.stringify({ name: "@repo/watch-fixture" })
    );
    await writeSource(`${fixture}/src/existing.ts`, "existing");
    await writeSource(
      "packages/unselected-fixture/package.json",
      JSON.stringify({ name: "@repo/unselected-fixture" })
    );
    await writeSource(
      "packages/unselected-fixture/src/existing.ts",
      "unselected"
    );
    const manifestPath = path.join(
      sourceRoot,
      "apps/web/registry/apps/web/package.json"
    );
    const manifest = await readPackageJson(manifestPath);
    manifest.dependencies = {
      ...manifest.dependencies,
      "@repo/watch-fixture": "workspace:*",
    };
    await writeJsonFile(manifestPath, manifest);
    await mkdir(targetRoot, { recursive: true });
    await writeJsonFile(path.join(targetRoot, "next-hydra.json"), {
      addOns: [],
      providers: { cms: "contentstack" },
    });
    await updateDevelopmentWorkspace(sourceRoot, name, { install: false });
    await readFile(path.join(targetRoot, fixture, "src/existing.ts"));
    watching = watchSources();
    await vi.waitFor(
      () => {
        if (watchFailure) {
          throw watchFailure;
        }
        if (refreshes === 0) {
          throw new Error("Waiting for the initial watched refresh.");
        }
      },
      { timeout: 5000 }
    );
  }, 20_000);

  afterEach(async () => {
    controller.abort();
    await watching;
    await rm(temporary, { force: true, recursive: true });
    if (watchFailure) {
      throw watchFailure;
    }
  });

  it("copies new files and follows subsequent edits in newly created directories", async () => {
    await writeSource(`${fixture}/src/new.ts`, "new");
    await expect
      .poll(output, { timeout: 5000 })
      .toEqual({ "existing.ts": "existing", "new.ts": "new" });
    await writeSource(
      `${fixture}/src/new-directory/nested/module.ts`,
      "nested"
    );
    await expect.poll(output, { timeout: 5000 }).toEqual({
      "existing.ts": "existing",
      "new-directory/nested/module.ts": "nested",
      "new.ts": "new",
    });
    await writeSource(
      `${fixture}/src/new-directory/nested/module.ts`,
      "edited"
    );
    await expect.poll(output, { timeout: 5000 }).toEqual({
      "existing.ts": "existing",
      "new-directory/nested/module.ts": "edited",
      "new.ts": "new",
    });
  }, 20_000);

  it("refreshes directory renames, deletion and recreation without losing its watches", async () => {
    await rename(
      path.join(sourceRoot, fixture, "src"),
      path.join(sourceRoot, fixture, "moved")
    );
    await expect
      .poll(
        async () =>
          await readFile(
            path.join(targetRoot, fixture, "moved/existing.ts"),
            "utf-8"
          ),
        { timeout: 5000 }
      )
      .toBe("existing");
    await expect.poll(output, { timeout: 5000 }).toEqual({});
    await rm(path.join(sourceRoot, fixture, "moved"), { recursive: true });
    await expect
      .poll(
        async () => await readdir(path.join(targetRoot, fixture, "moved")),
        {
          timeout: 5000,
        }
      )
      .toEqual([]);
    await writeSource(`${fixture}/src/restored.ts`, "restored");
    await expect
      .poll(output, { timeout: 5000 })
      .toEqual({ "restored.ts": "restored" });
  }, 20_000);

  it("captures edits during refresh after replacing a directory at the same path", async () => {
    // Let the initial refresh finish reconnecting before replacing its watched directory.
    await delay(800);
    duringRefresh = async () => {
      duringRefresh = undefined;
      await expect(output()).resolves.toEqual({ "existing.ts": "replacement" });
      // Composition has read the replacement, but watches have not reconnected yet.
      await writeSource(`${fixture}/src/existing.ts`, "edited during refresh");
    };
    await rename(
      path.join(sourceRoot, fixture, "src"),
      path.join(temporary, "previous-source")
    );
    await writeSource(`${fixture}/src/existing.ts`, "replacement");
    await expect.poll(output, { timeout: 5000 }).toEqual({
      "existing.ts": "edited during refresh",
    });
  }, 20_000);

  it("does not refresh for dependencies, caches, environment files or materialized output", async () => {
    await delay(800);
    const before = refreshes;
    await writeSource(`${fixture}/node_modules/example/index.js`, "dependency");
    await writeSource(`${fixture}/.next/cache/data`, "cache");
    await writeSource(
      `${fixture}/.env.local`,
      "SECRET=not-a-composition-input"
    );
    await writeSource("packages/unselected-fixture/src/new.ts", "unselected");
    await writeFile(
      path.join(targetRoot, fixture, "src/existing.ts"),
      "local edit"
    );
    await delay(1000);
    expect(refreshes).toBe(before);
    expect(watchFailure).toBeUndefined();
    await expect(output()).resolves.toEqual({ "existing.ts": "local edit" });
  });
});
