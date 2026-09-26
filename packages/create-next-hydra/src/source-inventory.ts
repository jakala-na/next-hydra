import {
  Array as EffectArray,
  Config,
  Context,
  Effect,
  Layer,
  Order,
  Path,
  Stream,
} from "effect";
import type { PlatformError } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { InvalidComposition } from "./errors.ts";
import {
  cacheDirectories,
  eligiblePackageFile,
  isEnvironmentFile,
  isCanonicalSource,
} from "./file-policy.ts";
import { relativeFile } from "./files.ts";
import type { SourceInputs } from "./model.ts";
import { packageManifestMatcher } from "./package-catalog.ts";

// Prune recursive observation before reaching dependency trees or composed apps.
// Definitions remain observable; SourceChanges filters them by exact coverage.
export const sourceWatchIgnores = [
  "**/.git",
  "**/.workspace-composition*",
  ...[...cacheDirectories].map((directory) => `**/${directory}`),
  "workspaces/*/!(next-hydra.json)",
];

export function sourceInputMatcher(
  inputs: SourceInputs | null
): (file: string) => boolean {
  const files = new Set(inputs?.files);
  const excluded = new Set(inputs?.excluded);
  const matchesManifest = packageManifestMatcher(inputs?.packagePatterns ?? []);
  const ancestors = new Set<string>();
  for (const file of files) {
    const parts = file.split("/");
    for (let end = 1; end < parts.length; end += 1) {
      ancestors.add(parts.slice(0, end).join("/"));
    }
  }
  return (file) => {
    if (!isCanonicalSource(file)) {
      return false;
    }
    if (inputs === null || files.has(file) || ancestors.has(file)) {
      return true;
    }
    // ShadCN includes explicitly name registry.json files. Package manifests
    // and ignore rules can change discovery even outside the selected closure.
    const name = file.split("/").at(-1);
    if (
      name === "registry.json" ||
      name === ".gitignore" ||
      matchesManifest(file)
    ) {
      return true;
    }
    return (
      !excluded.has(file) &&
      eligiblePackageFile(file) &&
      inputs.packages.some(
        (directory) => file === directory || file.startsWith(`${directory}/`)
      )
    );
  };
}

export interface LocalEnvironmentFile {
  readonly source: string;
  readonly target: string;
}

export interface SourceControlFiles {
  readonly directory: string;
  readonly files: readonly string[];
}

export class SourceInventory extends Context.Service<
  SourceInventory,
  {
    readonly controlFiles: (
      root: string
    ) => Effect.Effect<
      readonly SourceControlFiles[],
      PlatformError.PlatformError | InvalidComposition
    >;
    readonly list: (
      root: string
    ) => Effect.Effect<
      readonly string[],
      PlatformError.PlatformError | InvalidComposition
    >;
    readonly localEnvironment: (
      root: string
    ) => Effect.Effect<
      readonly LocalEnvironmentFile[],
      PlatformError.PlatformError | InvalidComposition
    >;
  }
>()("create-next-hydra/SourceInventory") {
  static readonly layer = Layer.effect(
    SourceInventory,
    Effect.gen(function* () {
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const path = yield* Path.Path;
      const configHome = yield* Config.String("XDG_CONFIG_HOME").pipe(
        Config.withDefault(""),
        Effect.mapError(
          () =>
            new InvalidComposition({
              message:
                "Could not read XDG_CONFIG_HOME for Git source inventory",
            })
        )
      );
      const defaultIgnore = configHome
        ? path.join(configHome, "git/ignore")
        : "~/.config/git/ignore";
      const git = (
        root: string,
        args: readonly string[],
        accepted: readonly number[] = [0]
      ) =>
        Effect.scoped(
          Effect.gen(function* () {
            const process = yield* processes.spawn(
              ChildProcess.make("git", args, { cwd: root, stderr: "ignore" })
            );
            const [output, code] = yield* Effect.all(
              [
                Stream.mkString(Stream.decodeText(process.stdout)),
                process.exitCode,
              ],
              { concurrency: "unbounded" }
            );
            if (!accepted.includes(code)) {
              return yield* new InvalidComposition({
                message: `Git source inventory failed (exit ${code})`,
              });
            }
            return output;
          })
        );
      return SourceInventory.of({
        controlFiles: Effect.fn("SourceInventory.controlFiles")(
          function* (root) {
            const index = (yield* git(root, [
              "rev-parse",
              "--path-format=absolute",
              "--git-path",
              "index",
            ])).trim();
            const common = (yield* git(root, [
              "rev-parse",
              "--path-format=absolute",
              "--git-common-dir",
            ])).trim();
            const directory = (yield* git(root, [
              "rev-parse",
              "--absolute-git-dir",
            ])).trim();
            const excludes = (yield* git(root, [
              "config",
              "--path",
              "--default",
              defaultIgnore,
              "--get",
              "core.excludesFile",
            ])).trim();
            // Git expands configured paths and evaluates conditional includes.
            // Retain include targets even while empty/missing, without reading
            // unrelated configuration values or interpreting config syntax.
            const configuration = (yield* git(
              root,
              [
                "config",
                "--null",
                "--path",
                "--show-origin",
                "--get-regexp",
                "^(include|includeif\\..*)\\.path$",
              ],
              [0, 1]
            )).split("\0");
            const controls: SourceControlFiles[] = [
              { directory: path.dirname(index), files: [index] },
              {
                directory,
                files: [
                  path.join(directory, "HEAD"),
                  path.join(directory, "config.worktree"),
                ],
              },
              {
                directory: common,
                files: [
                  path.join(common, "info/exclude"),
                  path.join(common, "config"),
                ],
              },
            ];
            // Git reports the platform's config paths even before they exist.
            for (const variable of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"]) {
              const locations = yield* git(root, ["var", variable], [0, 1]);
              for (const location of locations.split("\n").filter(Boolean)) {
                const file = path.resolve(root, location);
                controls.push({ directory: path.dirname(file), files: [file] });
              }
            }
            for (let offset = 0; offset < configuration.length; offset += 2) {
              const origin = configuration[offset];
              const entry = configuration[offset + 1];
              if (origin && entry) {
                const include = entry.slice(entry.indexOf("\n") + 1);
                const base = origin.startsWith("file:")
                  ? path.dirname(path.resolve(root, origin.slice(5)))
                  : root;
                const file = path.resolve(base, include);
                controls.push({ directory: path.dirname(file), files: [file] });
              }
            }
            if (excludes) {
              const file = path.resolve(root, excludes);
              controls.push({ directory: path.dirname(file), files: [file] });
            }
            return controls;
          }
        ),
        list: Effect.fn("SourceInventory.list")(function* (root) {
          const inventory = yield* git(root, [
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
          ]);
          const deleted = new Set(
            (yield* git(root, ["ls-files", "--deleted", "-z"])).split("\0")
          );
          return EffectArray.sort(
            [...new Set(inventory.split("\0"))].filter(
              (file) =>
                file.length > 0 && !file.endsWith("/") && !deleted.has(file)
            ),
            Order.String
          );
        }),
        localEnvironment: Effect.fn("SourceInventory.localEnvironment")(
          function* (root) {
            const worktrees = yield* git(root, [
              "worktree",
              "list",
              "--porcelain",
              "-z",
            ]);
            const primary = worktrees
              .split("\0")
              .find((field) => field.startsWith("worktree "))
              ?.slice(9);
            if (!primary) {
              return yield* new InvalidComposition({
                message:
                  "Git source inventory did not identify the primary worktree",
              });
            }
            const selected = new Map<string, LocalEnvironmentFile>();
            for (const directory of new Set([primary, path.resolve(root)])) {
              const ignored = yield* git(directory, [
                "ls-files",
                "--others",
                "--ignored",
                "--exclude-standard",
                "-z",
                "--",
                ":(glob).env",
                ":(glob).env.*",
                ":(glob)apps/**/.env",
                ":(glob)apps/**/.env.*",
                ":(glob)packages/**/.env",
                ":(glob)packages/**/.env.*",
                ":(glob)tests/**/.env",
                ":(glob)tests/**/.env.*",
              ]);
              for (const candidate of ignored.split("\0")) {
                if (
                  !candidate ||
                  !isEnvironmentFile(candidate) ||
                  candidate
                    .split("/")
                    .some(
                      (part) => part === ".git" || cacheDirectories.has(part)
                    )
                ) {
                  continue;
                }
                const target = yield* relativeFile(candidate);
                selected.set(target, {
                  source: path.join(directory, target),
                  target,
                });
              }
            }
            return EffectArray.sortWith(
              selected.values(),
              (file) => file.target,
              Order.String
            );
          }
        ),
      });
    })
  );
}
