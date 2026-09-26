import {
  Array as EffectArray,
  Effect,
  FileSystem,
  Layer,
  Order,
  Path,
  Redacted,
  Schema,
} from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { registryItemSchema, registrySchema } from "shadcn/schema";
import type { RegistryItem } from "shadcn/schema";

import { Composition } from "../../src/composition.ts";
import { RegistryFailure } from "../../src/errors.ts";
import { Shadcn } from "../../src/shadcn.ts";
import { SourceChanges } from "../../src/source-changes.ts";
import { SourceInventory } from "../../src/source-inventory.ts";
import type { LocalEnvironmentFile } from "../../src/source-inventory.ts";
import { WorkspaceDependencies } from "../../src/workspace-dependencies.ts";
import { WorkspaceFiles } from "../../src/workspace-files.ts";
import { WorkspaceSnapshots } from "../../src/workspace-snapshots.ts";
import { WorkspaceSources } from "../../src/workspace-sources.ts";
import { WorkspaceState } from "../../src/workspace-state.ts";
import { Workspaces } from "../../src/workspaces.ts";
import { memoryFileSystem } from "./memory-file-system.ts";
import { snapshotProcess } from "./snapshot-process.ts";
import { exampleFiles } from "./workspace.ts";
import type { Example } from "./workspace.ts";

const reject = (diagnostic: string) =>
  new RegistryFailure({
    diagnostic: Redacted.make(diagnostic),
    operation: "test registry",
  });

// A controlled external adapter: exact-file transport only. Includes, upstream
// normalization, and process lifetime stay covered by the live integration tests.
const registryLayer = (artifacts: ReadonlyMap<string, string> = new Map()) =>
  Layer.effect(
    Shadcn,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const json = (file: string) =>
        fs
          .readFileString(file)
          .pipe(
            Effect.flatMap(
              Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))
            )
          );
      const loadRegistry: Shadcn["Service"]["loadRegistry"] = (options) =>
        Effect.gen(function* () {
          const data = yield* json(
            path.join(
              options?.cwd ?? "/source",
              options?.registryFile ?? "registry.json"
            )
          );
          const registry = yield* Effect.try({
            catch: (error) => reject(String(error)),
            try: () => registrySchema.parse(data),
          });
          return {
            ...registry,
            items: registry.items.map((item) => ({
              ...item,
              files: item.files,
            })),
          };
        }).pipe(Effect.mapError((error) => reject(String(error))));
      return Shadcn.of({
        getRegistryItems: (references) =>
          Effect.forEach((reference: string) =>
            json(artifacts.get(reference) ?? reference).pipe(
              Effect.flatMap((data) =>
                Effect.try({
                  catch: (error) => reject(String(error)),
                  try: () => registryItemSchema.parse(data),
                })
              ),
              Effect.mapError((error) => reject(String(error)))
            )
          )(references),
        install: (staging, entries) =>
          Effect.gen(function* () {
            for (const file of entries) {
              const data = yield* json(file);
              const item = yield* Effect.try({
                catch: (error) => reject(String(error)),
                try: () => registryItemSchema.parse(data),
              });
              for (const output of item.files ?? []) {
                if (!output.target || output.content === undefined) {
                  return yield* reject("Expected hydrated exact-target file");
                }
                const target = path.join(
                  staging.application,
                  output.target.replace(/^~\//u, "")
                );
                yield* fs.makeDirectory(path.dirname(target), {
                  recursive: true,
                });
                yield* fs.writeFileString(target, output.content);
              }
            }
          }),
        loadRegistry,
        loadRegistryItem: (name, options) =>
          Effect.gen(function* () {
            const registry = yield* loadRegistry(options);
            const item = registry.items.find(
              (candidate) => candidate.name === name
            );
            if (!item) {
              return yield* reject(`Missing item: ${name}`);
            }
            const files: NonNullable<RegistryItem["files"]> = [];
            for (const file of item.files ?? []) {
              files.push({
                ...file,
                content: yield* fs.readFileString(
                  path.join(options?.cwd ?? "/source", file.path)
                ),
              });
            }
            return { ...item, files };
          }).pipe(Effect.mapError((error) => reject(String(error)))),
      });
    })
  );

const inventoryLayer = (
  local: readonly LocalEnvironmentFile[],
  ignored: readonly string[]
) =>
  Layer.effect(
    SourceInventory,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      return SourceInventory.of({
        controlFiles: () => Effect.succeed([]),
        list: (root) =>
          Effect.gen(function* () {
            const files: string[] = [];
            const pending = [""];
            while (pending.length) {
              const directory = pending.pop();
              if (directory === undefined) {
                break;
              }
              for (const entry of yield* fs.readDirectory(
                path.join(root, directory)
              )) {
                const name = path.join(directory, entry);
                if (ignored.includes(name)) {
                  continue;
                }
                if (
                  (yield* fs.stat(path.join(root, name))).type === "Directory"
                ) {
                  pending.push(name);
                } else {
                  files.push(name);
                }
              }
            }
            return EffectArray.sort(files, Order.String);
          }),
        localEnvironment: () => Effect.succeed(local),
      });
    })
  );

export const memoryWorkspaceServices = (
  local: readonly LocalEnvironmentFile[] = [],
  processes: Layer.Layer<
    ChildProcessSpawner.ChildProcessSpawner,
    never,
    FileSystem.FileSystem
  > = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() =>
      Effect.die(new Error("Unexpected process in files-only test"))
    )
  ),
  sourceChanges: Layer.Layer<
    SourceChanges,
    never,
    FileSystem.FileSystem
  > = Layer.succeed(
    SourceChanges,
    SourceChanges.of({
      open: () => Effect.die("Unexpected source observation"),
    })
  ),
  registryReferences: ReadonlyMap<string, string> = new Map(),
  ignored: readonly string[] = []
) => {
  const inventory = inventoryLayer(local, ignored);
  const registry = registryLayer(registryReferences);
  const composition = Composition.layer.pipe(
    Layer.provide([registry, inventory])
  );
  return Workspaces.layer.pipe(
    Layer.provide([
      registry,
      WorkspaceState.layer,
      sourceChanges,
      WorkspaceSnapshots.layer.pipe(Layer.provide(snapshotProcess)),
      WorkspaceFiles.layer,
      WorkspaceDependencies.layer,
    ]),
    Layer.provideMerge([composition, WorkspaceSources.layer, inventory]),
    Layer.provide(processes),
    Layer.fresh
  );
};

export const memoryWorkspace = (
  example: Example,
  options: {
    readonly localEnvironment?: readonly LocalEnvironmentFile[];
    readonly fileSystem?: (fs: FileSystem.FileSystem) => FileSystem.FileSystem;
    readonly processes?: Layer.Layer<
      ChildProcessSpawner.ChildProcessSpawner,
      never,
      FileSystem.FileSystem
    >;
    readonly sourceChanges?: Layer.Layer<
      SourceChanges,
      never,
      FileSystem.FileSystem
    >;
    readonly registryReferences?: ReadonlyMap<string, string>;
    readonly ignored?: readonly string[];
  } = {}
) =>
  Effect.gen(function* () {
    const files = yield* exampleFiles(example);
    const basePlatform = Layer.merge(
      Path.layer,
      memoryFileSystem(
        new Map([...files].map(([name, bytes]) => [`/source/${name}`, bytes]))
      )
    );
    const platform = Layer.effect(
      FileSystem.FileSystem,
      FileSystem.FileSystem.pipe(
        Effect.map((fs) => options.fileSystem?.(fs) ?? fs)
      )
    ).pipe(Layer.provideMerge(basePlatform));
    return memoryWorkspaceServices(
      options.localEnvironment,
      options.processes,
      options.sourceChanges,
      options.registryReferences,
      options.ignored
    ).pipe(Layer.provideMerge(platform));
  });
