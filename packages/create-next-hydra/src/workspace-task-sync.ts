/// <reference lib="es2023.array" />
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { composeWorkspace } from "./compose.js";
import {
  discoverDevelopmentWorkspaces,
  workspaceDefinitionSchema,
} from "./development-workspaces.js";
import { workspaceNonSourceDirectories } from "./workspace-artifacts.js";
import { assertDirectoryPath } from "./workspace-files.js";
import { workspaceTaskManifest } from "./workspace-task-manifest.js";

/** Project the constructor's actual source closure into native Turbo inputs. No Git matching here. */
export function workspaceCompositionTask(
  name: string,
  sources: readonly string[]
) {
  const selected = new Set(
    sources.map((source) => {
      const directory = /^(?:apps|packages)\/[^/]+(?=\/)/u.exec(source)?.[0];
      return directory ? `${directory}/**` : source;
    })
  );
  return {
    extends: ["//"],
    tasks: {
      build: {
        cache: false,
        dependsOn: ["^build"],
        inputs: [
          "$TURBO_DEFAULT$",
          `$TURBO_ROOT$/workspaces/${name}/next-hydra.json`,
          `$TURBO_ROOT$/workspaces/${name}/apps/*/vercel.json`,
          "$TURBO_ROOT$/*",
          "$TURBO_ROOT$/apps/**/registry.json",
          "$TURBO_ROOT$/packages/**/registry.json",
          "$TURBO_ROOT$/apps/*/package.json",
          "$TURBO_ROOT$/packages/*/package.json",
          "$TURBO_ROOT$/packages/create-next-hydra/schema/**",
          "$TURBO_ROOT$/packages/create-next-hydra/scripts/**",
          ...[...selected].toSorted().map((source) => `$TURBO_ROOT$/${source}`),
          ...[...workspaceNonSourceDirectories].map(
            (directory) => `!$TURBO_ROOT$/**/${directory}/**`
          ),
          "!$TURBO_ROOT$/**/.env",
          "!$TURBO_ROOT$/**/.env.local",
          "!$TURBO_ROOT$/**/.env.*.local",
          "!$TURBO_ROOT$/**/*.tsbuildinfo",
        ],
        outputs: [],
      },
    },
  };
}

export async function planWorkspaceTaskFiles(sourceRoot: string, name: string) {
  const manifest = workspaceTaskManifest(name);
  const workspace = path.join(sourceRoot, "workspaces", name);
  await assertDirectoryPath(workspace);
  const definitionPath = path.join(workspace, "next-hydra.json");
  const definitionInfo = await lstat(definitionPath);
  if (!definitionInfo.isFile()) {
    throw new Error(
      `Workspace definition must be a regular file: ${definitionPath}`
    );
  }
  const definition = workspaceDefinitionSchema.parse(
    JSON.parse(await readFile(definitionPath, "utf-8"))
  );
  if (!definition.providers.cms) {
    throw new Error(`${name} requires a CMS provider.`);
  }
  const temporary = await mkdtemp(
    path.join(await realpath(tmpdir()), "workspace-tasks-")
  );
  try {
    const composed = await composeWorkspace(
      path.join(temporary, name),
      {
        addOns: definition.addOns,
        auth: definition.providers.auth,
        cms: definition.providers.cms,
        commerce: definition.providers.commerce,
        copyEnv: false,
        install: false,
        linked: false,
      },
      { name, report: () => undefined, sourceRoot }
    );
    return {
      "package.json": {
        ...manifest,
        nextHydra: { localSourcesOnly: composed.sourceInputs.complete },
      },
      "turbo.json": workspaceCompositionTask(
        name,
        composed.sourceInputs.sources
      ),
    };
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

export async function syncWorkspaceTasks(sourceRoot: string, check = false) {
  const names = await discoverDevelopmentWorkspaces(sourceRoot);
  const mismatches = await Promise.all(
    names.map(async (name) => {
      const files = await planWorkspaceTaskFiles(sourceRoot, name);
      const directory = path.join(sourceRoot, "workspaces", name, "tasks");
      await assertDirectoryPath(directory);
      return await Promise.all(
        Object.entries(files).map(async ([file, expected]) => {
          const target = path.join(directory, file);
          let matches = false;
          try {
            const info = await lstat(target);
            if (!info.isFile()) {
              throw new Error(
                `Workspace task metadata must be a regular file: ${target}`
              );
            }
            matches = isDeepStrictEqual(
              JSON.parse(await readFile(target, "utf-8")),
              expected
            );
          } catch (error) {
            if (
              !(
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
              )
            ) {
              throw error;
            }
          }
          if (!matches && !check) {
            await mkdir(directory, { recursive: true });
            await writeFile(target, `${JSON.stringify(expected, null, 2)}\n`);
          }
          return matches ? undefined : target;
        })
      );
    })
  );
  return mismatches.flat().filter((file) => file !== undefined);
}
