import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { ApplicationTaskFailed, InvalidComposition } from "./errors.ts";
import { WorkspaceDefinition } from "./model.ts";
import type { FileExplanation } from "./model.ts";
import { Shadcn } from "./shadcn.ts";
import { SourceInventory } from "./source-inventory.ts";
import { TemplateDefinition } from "./templates.ts";
import { Workspaces } from "./workspaces.ts";

const scriptExtension = /\.[cm]?[jt]sx?$/u;
export type CompositionLintScope =
  | { readonly kind: "all" }
  | { readonly kind: "source" }
  | { readonly kind: "workspace"; readonly name: string };
const allCompositions: CompositionLintScope = { kind: "all" };

const sharedLintInputs = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "registry.json",
  "components.json",
  "oxlint.config.ts",
  "tsconfig.json",
  ".node-version",
  ".npmrc",
  ".github/workflows/registry-integrity.yml",
]);

function sourcePath(file: FileExplanation): string | undefined {
  return "source" in file.origin ? file.origin.source : undefined;
}

export const affectedLintWorkspaces = Effect.fn("CompositionLint.affected")(
  function* (sourceRoot: string, changedFiles?: readonly string[]) {
    const workspaces = yield* Workspaces;
    const references = yield* workspaces.discover(sourceRoot);
    if (references.length === 0) {
      return yield* new InvalidComposition({
        message:
          "Composition lint requires at least one named workspace definition.",
      });
    }
    if (
      changedFiles === undefined ||
      changedFiles.some(
        (file) =>
          sharedLintInputs.has(file) ||
          (file.startsWith("tools/oxlint/") && !file.endsWith(".md")) ||
          file.startsWith("packages/create-next-hydra/src/") ||
          file === "packages/create-next-hydra/package.json"
      )
    ) {
      return references.map((reference) => reference.name);
    }
    const changes = changedFiles.filter((file) => !file.endsWith(".md"));
    if (changes.length === 0) {
      return [];
    }
    const selected: string[] = [];
    for (const reference of references) {
      if (
        changes.some((file) => file.startsWith(`workspaces/${reference.name}/`))
      ) {
        selected.push(reference.name);
        continue;
      }
      const workspace = yield* workspaces.named(reference);
      const origins = (yield* workspace.explain()).files;
      const sources = origins.flatMap((file) => {
        const source = sourcePath(file);
        return source === undefined ? [] : [source];
      });
      // Package ownership also covers additions and deletions that are absent
      // from the current exact-file explanation. Dependencies are included.
      const directories = new Set(
        sources
          .filter((file) => /^(?:apps|packages)\//u.test(file))
          .map((file) => `${file.split("/").slice(0, 2).join("/")}/`)
      );
      if (
        changes.some(
          (file) =>
            sources.includes(file) ||
            [...directories].some((directory) => file.startsWith(directory))
        )
      ) {
        selected.push(reference.name);
      }
    }
    return selected;
  }
);

const LintResult = Schema.fromJsonString(
  Schema.Struct({
    diagnostics: Schema.Array(
      Schema.Struct({
        code: Schema.optionalKey(Schema.String),
        filename: Schema.String,
        labels: Schema.optionalKey(
          Schema.Array(
            Schema.Struct({
              span: Schema.Struct({ column: Schema.Int, line: Schema.Int }),
            })
          )
        ),
        message: Schema.String,
        severity: Schema.String,
      })
    ),
    number_of_files: Schema.Int,
  })
);

export const executeLintCommand = Effect.fn("CompositionLint.execute")(
  function* (
    cwd: string,
    executable: string,
    args: readonly string[],
    accepted: readonly number[] = [0]
  ) {
    const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const child = yield* processes.spawn(
          ChildProcess.make(executable, args, {
            cwd,
            env: {
              ...process.env,
              GIT_COMMON_DIR: undefined,
              GIT_DIR: undefined,
              GIT_INDEX_FILE: undefined,
              GIT_WORK_TREE: undefined,
            },
            stderr: "inherit",
            stdin: "ignore",
            stdout: "pipe",
          })
        );
        const [output, code] = yield* Effect.all(
          [Stream.mkString(Stream.decodeText(child.stdout)), child.exitCode],
          { concurrency: "unbounded" }
        );
        if (!accepted.includes(code)) {
          return yield* new ApplicationTaskFailed({ code, directory: cwd });
        }
        return output;
      })
    );
  }
);

const assertCoverage = (
  expected: readonly string[],
  actual: readonly string[]
) => {
  const found = new Set(actual);
  const missing = expected.filter((file) => !found.has(file));
  return missing.length === 0
    ? Effect.void
    : Effect.fail(
        new InvalidComposition({
          message: `Lint did not inspect expected files:\n${missing.join("\n")}`,
        })
      );
};

export const lintWorkspaceFiles = Effect.fn("CompositionLint.files")(function* (
  root: string,
  executable: string,
  files: readonly string[],
  origins: readonly FileExplanation[],
  mode: "typed" | "syntax" = "typed"
) {
  if (files.length === 0) {
    return 0;
  }
  const path = yield* Path.Path;
  const discovered = (yield* executeLintCommand(root, executable, [
    "--debug",
    "files",
    ...files,
  ]))
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
  yield* assertCoverage(files, discovered);
  const result = yield* executeLintCommand(
    root,
    executable,
    [
      ...(mode === "typed" ? ["--type-aware", "--type-check"] : []),
      "--format",
      "json",
      ...discovered,
    ],
    [0, 1]
  ).pipe(Effect.flatMap(Schema.decodeEffect(LintResult)));
  if (result.number_of_files !== discovered.length) {
    return yield* new InvalidComposition({
      message: `Lint coverage changed: expected ${discovered.length} files, inspected ${result.number_of_files}.`,
    });
  }
  for (const diagnostic of result.diagnostics) {
    const target = path.isAbsolute(diagnostic.filename)
      ? path.relative(root, diagnostic.filename)
      : diagnostic.filename;
    const origin = origins.find((file) => file.target === target);
    const location = origin ? (sourcePath(origin) ?? target) : target;
    const rendered =
      origin?.origin.kind === "template" ? ` (rendered ${target})` : "";
    const span = diagnostic.labels?.[0]?.span;
    yield* Console.error(
      `${location}${rendered}:${span?.line ?? 1}:${span?.column ?? 1}: ${diagnostic.severity} ${diagnostic.code ?? ""}: ${diagnostic.message}`
    );
  }
  return result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  ).length;
});

export const lintCompositions = Effect.fn("CompositionLint.run")(function* (
  sourceRoot: string,
  requestedFiles?: readonly string[],
  scope: CompositionLintScope = allCompositions
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaces = yield* Workspaces;
  const inventory = yield* SourceInventory;
  const registry = yield* Shadcn;
  const requested = new Set(
    requestedFiles ?? (yield* inventory.list(sourceRoot))
  );
  const executable = path.join(sourceRoot, "node_modules/.bin/oxlint");
  const candidates = [...requested].filter((file) =>
    scriptExtension.test(file)
  );
  if (candidates.length > 0) {
    const eligible = new Set(
      (yield* executeLintCommand(sourceRoot, executable, [
        "--debug",
        "files",
        ...candidates,
      ]))
        .trim()
        .split(/\r?\n/u)
        .filter(Boolean)
    );
    for (const file of candidates) {
      if (!eligible.has(file)) {
        requested.delete(file);
      }
    }
  }
  const names = yield* workspaces.discover(sourceRoot);
  if (names.length === 0) {
    return yield* new InvalidComposition({
      message:
        "Composition lint requires at least one named workspace definition.",
    });
  }
  const selected =
    scope.kind === "workspace"
      ? names.filter((reference) => reference.name === scope.name)
      : names;
  if (scope.kind === "workspace" && selected.length === 0) {
    return yield* new InvalidComposition({
      message: `Unknown lint workspace: ${scope.name}`,
    });
  }
  // The source registry owns production templates. Authored CLI test inputs are
  // not production applications and are verified by their own behavioral tests.
  const declaredTemplates = new Set<string>();
  for (const item of (yield* registry.loadRegistry({
    cwd: sourceRoot,
    registryFile: "registry.json",
  })).items) {
    const definition = yield* Schema.decodeUnknownEffect(TemplateDefinition)(
      item.meta?.composition ?? {}
    );
    for (const template of definition.templates ?? []) {
      declaredTemplates.add(template.source);
    }
  }
  const covered = new Set<string>();
  let errors = 0;
  for (const reference of selected) {
    if (scope.kind === "source") {
      // Explain establishes ownership without installing or materializing apps.
      const workspace = yield* workspaces.named(reference);
      for (const file of (yield* workspace.explain()).files) {
        const source = sourcePath(file);
        if (source !== undefined) {
          covered.add(source);
        }
      }
      continue;
    }
    errors += yield* Effect.scoped(
      Effect.gen(function* () {
        const definition = yield* fs
          .readFileString(
            path.join(
              sourceRoot,
              "workspaces",
              reference.name,
              "next-hydra.json"
            )
          )
          .pipe(
            Effect.flatMap(
              Schema.decodeEffect(Schema.fromJsonString(WorkspaceDefinition))
            )
          );
        // Keep this disposable copy below the repository so type-aware lint's
        // plugins can resolve maintainer tooling, never below a named workspace.
        const temporary = yield* fs.makeTempDirectoryScoped({
          directory: path.join(sourceRoot, "workspaces"),
          prefix: ".lint-",
        });
        const destination = path.join(temporary, reference.name);
        const fresh = yield* workspaces.fresh({
          destination,
          name: reference.name,
          selection: {
            addOns: definition.addOns,
            providers: definition.providers,
          },
          source: { kind: "working-tree", root: sourceRoot },
        });
        const result = yield* fresh.materialize({ git: "initialize" });
        yield* executeLintCommand(destination, "pnpm", [
          "-r",
          "--if-present",
          "run",
          "lint:prepare",
        ]);
        const web = path.join(destination, "apps/web");
        const config = path.join(web, "next.config.ts");
        if (yield* fs.exists(config)) {
          yield* Effect.acquireUseRelease(
            fs.readFile(config),
            () =>
              Effect.gen(function* () {
                yield* fs.writeFileString(
                  config,
                  'export { baseConfig as default } from "@repo/next-config";\n'
                );
                yield* executeLintCommand(
                  web,
                  path.join(web, "node_modules/.bin/next"),
                  ["typegen"]
                );
              }),
            (content) => fs.writeFile(config, content).pipe(Effect.orDie)
          );
        }
        const encodeString = Schema.encodeEffect(
          Schema.fromJsonString(Schema.String)
        );
        const configuration = yield* encodeString(
          (yield* path.toFileUrl(path.join(sourceRoot, "oxlint.config.ts")))
            .href
        );
        yield* fs.writeFileString(
          path.join(destination, "oxlint.config.mts"),
          `import path from "node:path";\nimport configuration from ${configuration};\nexport default { ...configuration, jsPlugins: configuration.jsPlugins?.map(plugin => ({ ...plugin, specifier: path.resolve(${yield* encodeString(sourceRoot)}, plugin.specifier) })) };\n`
        );
        const files = result.origins
          .filter(
            (file) =>
              scriptExtension.test(file.target) &&
              (file.origin.kind === "template" ||
                requested.has(sourcePath(file) ?? ""))
          )
          .map((file) => file.target);
        for (const file of result.origins) {
          const source = sourcePath(file);
          if (source !== undefined) {
            covered.add(source);
          }
        }
        yield* Console.log(`Lint composition: ${reference.name}`);
        return yield* lintWorkspaceFiles(
          destination,
          executable,
          files,
          result.origins
        );
      })
    );
  }
  // A matrix job checks its own application. The separate source job checks
  // files outside every composition and enforces complete application coverage.
  if (scope.kind !== "workspace") {
    const sourceFiles = [...requested].filter(
      (file) => scriptExtension.test(file) && !covered.has(file)
    );
    yield* assertCoverage(
      [
        ...sourceFiles.filter(
          (file) => file.startsWith("apps/web/") || file.startsWith("apps/api/")
        ),
        ...[...requested].filter(
          (file) => declaredTemplates.has(file) && !covered.has(file)
        ),
      ],
      []
    );
    // Authored examples are input trees, not installed TypeScript projects.
    // Keep their syntax checks; real application output is checked above.
    const examples = sourceFiles.filter((file) =>
      file.startsWith("packages/create-next-hydra/tests/examples/")
    );
    const exampleSet = new Set(examples);
    errors += yield* lintWorkspaceFiles(
      sourceRoot,
      executable,
      sourceFiles.filter((file) => !exampleSet.has(file)),
      []
    );
    errors += yield* lintWorkspaceFiles(
      sourceRoot,
      executable,
      examples,
      [],
      "syntax"
    );
  }
  if (errors > 0) {
    return yield* new InvalidComposition({
      message: `Composition lint failed with ${errors} errors. Fix the reported canonical sources and templates.`,
    });
  }
});
