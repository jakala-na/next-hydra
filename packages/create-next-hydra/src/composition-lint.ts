import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import { composeWorkspace } from "./compose.js";
import {
  discoverDevelopmentWorkspaces,
  workspaceDefinitionSchema,
} from "./development-workspaces.js";
import { CommandExecutionError, runCommand, runGit } from "./git.js";
import { info } from "./logger.js";
import { workspaceSourceFiles } from "./workspace-files.js";
import type { WorkspaceOrigin } from "./workspace-update.js";

type Origin = { target: string; origin?: WorkspaceOrigin };
const scriptExtension = /\.[cm]?[jt]sx?$/u;
const lintResultSchema = z.object({
  diagnostics: z.array(
    z
      .object({
        code: z.string().optional(),
        filename: z.string(),
        labels: z
          .array(
            z
              .object({
                span: z.object({ column: z.number(), line: z.number() }),
              })
              .passthrough()
          )
          .optional(),
        message: z.string(),
        severity: z.string(),
      })
      .passthrough()
  ),
  number_of_files: z.number().int().nonnegative(),
});

/** Templates always participate: their rendered code has no directly lintable source. */
export function selectLintTargets(
  origins: readonly Origin[],
  requested: ReadonlySet<string>
): string[] {
  return origins
    .filter(
      ({ target, origin }) =>
        scriptExtension.test(target) &&
        (origin?.kind === "template" || (origin && requested.has(origin.path)))
    )
    .map(({ target }) => target);
}

export function assertLintCoverage(
  expected: readonly string[],
  actual: readonly string[]
): void {
  const found = new Set(actual);
  const missing = expected.filter((file) => !found.has(file));
  if (missing.length) {
    throw new Error(
      `Lint did not inspect expected files:\n${missing.join("\n")}`
    );
  }
}

export function lintSourceLocation(
  target: string,
  origins: readonly Origin[]
): string {
  const origin = origins.find((file) => file.target === target)?.origin;
  return origin
    ? `${origin.path}${origin.kind === "template" ? ` (rendered ${target})` : ""}`
    : target;
}

/** Only for disposable lint copies, never an authoring or development workspace. */
export async function generateLintRouteTypes(webRoot: string): Promise<void> {
  const configPath = path.join(webRoot, "next.config.ts");
  const configuration = await readFile(configPath);
  try {
    // Route-shape types need the real composed route tree, not provider secrets.
    // Use the shared routing settings; restore the full config before linting it.
    // This deliberately does not validate provider build configuration.
    await writeFile(
      configPath,
      'export { baseConfig as default } from "@repo/next-config";\n'
    );
    await runCommand(
      path.join(webRoot, "node_modules/.bin/next"),
      ["typegen"],
      {
        cwd: webRoot,
      }
    );
  } finally {
    await writeFile(configPath, configuration);
  }
}

export async function lintWorkspaceFiles(
  root: string,
  executable: string,
  files: string[],
  origins: readonly Origin[]
): Promise<number> {
  if (files.length === 0) {
    return 0;
  }
  // Source candidates have already been filtered by the shared config. No
  // further loss is permitted when relocating them into their composition.
  const discovery = await runCommand(
    executable,
    ["--debug", "files", ...files],
    { cwd: root }
  );
  const expected = discovery.stdout.trim().split(/\r?\n/u).filter(Boolean);
  assertLintCoverage(files, expected);
  if (expected.length === 0) {
    throw new Error(
      `No lint coverage for ${files.length} requested files in ${root}.`
    );
  }
  let stdout: string;
  try {
    ({ stdout } = await runCommand(
      executable,
      ["--type-check", "--format", "json", ...expected],
      { cwd: root }
    ));
  } catch (error) {
    if (!(error instanceof CommandExecutionError) || error.code !== 1) {
      throw error;
    }
    ({ stdout } = error);
  }
  const result = lintResultSchema.parse(JSON.parse(stdout));
  if (result.number_of_files !== expected.length) {
    throw new Error(
      `Lint coverage changed: expected ${expected.length} files, inspected ${result.number_of_files}.`
    );
  }
  for (const diagnostic of result.diagnostics) {
    const target = path.isAbsolute(diagnostic.filename)
      ? path.relative(root, diagnostic.filename)
      : diagnostic.filename;
    const location = diagnostic.labels?.[0]?.span;
    info(
      `${lintSourceLocation(target, origins)}:${location?.line ?? 1}:${location?.column ?? 1}: ${diagnostic.severity} ${diagnostic.code ?? ""}: ${diagnostic.message}`
    );
  }
  info(`Lint inspected ${result.number_of_files} files.`);
  return result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length;
}

/** Sequential snapshots bound disk use; they never refresh a developer's workspace. */
export async function lintCompositions(
  sourceRoot: string,
  requestedFiles?: readonly string[]
): Promise<void> {
  const requested = new Set(
    requestedFiles ?? (await workspaceSourceFiles(sourceRoot))
  );
  const executable = path.join(sourceRoot, "node_modules", ".bin", "oxlint");
  const sourceCandidates = [...requested].filter((file) =>
    scriptExtension.test(file)
  );
  if (sourceCandidates.length > 0) {
    const discovery = await runCommand(
      executable,
      ["--debug", "files", ...sourceCandidates],
      { cwd: sourceRoot }
    );
    const eligible = new Set(
      discovery.stdout.trim().split(/\r?\n/u).filter(Boolean)
    );
    for (const file of sourceCandidates) {
      if (!eligible.has(file)) {
        requested.delete(file);
      }
    }
  }
  const configurationModule = pathToFileURL(
    path.join(sourceRoot, "oxlint.config.ts")
  ).href;
  const names = await discoverDevelopmentWorkspaces(sourceRoot);
  if (names.length === 0) {
    throw new Error(
      "Composition lint requires at least one named workspace definition."
    );
  }
  const covered = new Set<string>();
  const lintWorkspace = async (name: string): Promise<number> => {
    const definition = workspaceDefinitionSchema.parse(
      JSON.parse(
        await readFile(
          path.join(sourceRoot, "workspaces", name, "next-hydra.json"),
          "utf-8"
        )
      )
    );
    const { cms, auth, commerce } = definition.providers;
    if (!cms) {
      throw new Error(`${name} requires a CMS provider.`);
    }
    // The type-aware lint backend resolves maintainer tooling through parent directories.
    const temporary = await mkdtemp(
      path.join(sourceRoot, "workspaces", ".lint-")
    );
    const targetRoot = path.join(temporary, name);
    try {
      info(`Lint composition: ${name}`);
      const composed = await composeWorkspace(
        targetRoot,
        {
          addOns: definition.addOns,
          auth,
          cms,
          commerce,
          copyEnv: false,
          install: true,
          linked: false,
        },
        { name, report: info, sourceRoot }
      );
      await generateLintRouteTypes(path.join(targetRoot, "apps/web"));
      // A private Git boundary isolates verification from any surrounding checkout.
      // No user index is read or changed.
      await runGit(["init", "--quiet"], {
        cwd: targetRoot,
        env: {
          ...process.env,
          GIT_COMMON_DIR: undefined,
          GIT_DIR: undefined,
          GIT_INDEX_FILE: undefined,
          GIT_WORK_TREE: undefined,
        },
      });
      await writeFile(
        path.join(targetRoot, "oxlint.config.mts"),
        `
import path from "node:path";
import configuration from ${JSON.stringify(configurationModule)};
export default {
  ...configuration,
  jsPlugins: configuration.jsPlugins?.map(plugin => ({
    ...plugin, specifier: path.resolve(${JSON.stringify(sourceRoot)}, plugin.specifier)
  }))
};
`
      );
      const files = selectLintTargets(composed.origins, requested);
      for (const entry of composed.origins) {
        if (entry.origin) {
          covered.add(entry.origin.path);
        }
      }
      return await lintWorkspaceFiles(
        targetRoot,
        executable,
        files,
        composed.origins
      );
    } finally {
      // This exclusively-created snapshot contains no authoring files or credentials.
      await rm(temporary, { force: true, recursive: true });
    }
  };
  async function lintNext(index: number): Promise<number> {
    const name = names[index];
    if (name === undefined) {
      return 0;
    }
    const count = await lintWorkspace(name);
    return count + (await lintNext(index + 1));
  }
  const errors = await lintNext(0);
  const sourceFiles = [...requested].filter(
    (file) => scriptExtension.test(file) && !covered.has(file)
  );
  const uncovered = sourceFiles.filter(
    (file) => file.startsWith("apps/web/") || file.startsWith("apps/api/")
  );
  const uncoveredTemplates = [...requested].filter(
    (file) => file.endsWith(".template") && !covered.has(file)
  );
  assertLintCoverage([...uncovered, ...uncoveredTemplates], []);
  const sourceErrors = await lintWorkspaceFiles(
    sourceRoot,
    executable,
    sourceFiles,
    []
  );
  if (errors + sourceErrors > 0) {
    throw new Error(
      `Composition lint failed with ${errors + sourceErrors} errors. Fix the canonical sources/templates reported above.`
    );
  }
}
