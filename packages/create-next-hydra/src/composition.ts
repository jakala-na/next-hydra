import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import type { PlatformError } from "effect";
import type { RegistryItem } from "shadcn/schema";

import {
  applicationIgnoreRules,
  applicationManifest,
  applicationWorkspace,
  normalizeApplicationName,
  readWorkspaceSettings,
} from "./baseline.ts";
import { InvalidComposition, SourceChanged } from "./errors.ts";
import type {
  RegistryFailure,
  IncompatibleSelection,
  RegistryWorkerFailure,
  StagingRetained,
} from "./errors.ts";
import { isEnvironmentFile, eligiblePackageFile } from "./file-policy.ts";
import { collectFiles, relativeFile, writeFile } from "./files.ts";
import { scopeApplicationHosts } from "./hosting.ts";
import type {
  FileOrigin,
  PreparedWorkspace,
  SelectionRequest,
} from "./model.ts";
import { packageCatalog } from "./package-catalog.ts";
import { completePackages } from "./packages.ts";
import { acquireRegistry, registryInstructions } from "./registry.ts";
import { selectRegistryItems } from "./selection.ts";
import { Shadcn } from "./shadcn.ts";
import { SourceInventory } from "./source-inventory.ts";
import { withStaging } from "./staging.ts";
import { applicationTasks } from "./tasks.ts";
import {
  readTemplateDefinitions,
  orderBindings,
  renderTemplate,
} from "./templates.ts";
import { applyTypeScriptAliases } from "./typescript-paths.ts";
import type { WorkspaceSource } from "./workspace-sources.ts";

export interface PreparationRequest {
  readonly source: WorkspaceSource;
  readonly selection: SelectionRequest;
  readonly name: string;
  readonly port?: number;
}
export type PreparationError =
  | InvalidComposition
  | IncompatibleSelection
  | SourceChanged
  | RegistryFailure
  | RegistryWorkerFailure
  | StagingRetained
  | PlatformError.PlatformError
  | Schema.SchemaError;

const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

export class Composition extends Context.Service<
  Composition,
  {
    readonly prepare: (
      request: PreparationRequest
    ) => Effect.Effect<PreparedWorkspace, PreparationError>;
  }
>()("create-next-hydra/Composition") {
  static readonly layer = Layer.effect(
    Composition,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const shadcn = yield* Shadcn;
      const inventory = yield* SourceInventory;
      const prepare = Effect.fn("Composition.prepare")(function* (
        request: PreparationRequest
      ) {
        const applicationName = normalizeApplicationName(request.name);
        const options = {
          cwd: request.source.root,
          registryFile: "registry.json",
        };
        const sourceRegistry = yield* shadcn.loadRegistry(options);
        const acquired = yield* acquireRegistry(request.source.root, {
          registry: sourceRegistry,
          selection: request.selection,
        }).pipe(
          Effect.provideService(Shadcn, shadcn),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        );
        const { registry } = acquired;
        const {
          aliases,
          assets,
          ownedAssetTargets,
          ownedAliases,
          ownedRequirements,
          patches,
          references,
          requirements,
          selectedItems,
        } = yield* selectRegistryItems(
          registry,
          request.selection,
          acquired.references
        );

        const captures = new Map<
          string,
          { content: Uint8Array; mode: number }
        >();
        const capture = Effect.fn("Composition.capture")(function* (
          input: string
        ) {
          const relative = yield* relativeFile(input);
          const cached = captures.get(relative);
          if (cached) {
            return cached;
          }
          const absolute = path.join(request.source.root, relative);
          const stat = yield* fs.stat(absolute);
          const file = {
            content: yield* fs.readFile(absolute),
            mode: stat.mode % 0o1000,
          };
          captures.set(relative, file);
          return file;
        });
        const retained = Effect.fn("Composition.retained")(function* (
          input: string
        ) {
          const file = captures.get(yield* relativeFile(input));
          if (!file) {
            return yield* Effect.die(
              new Error(`Missing captured input: ${input}`)
            );
          }
          return file;
        });
        const rootManifest = yield* capture("package.json");
        const initialManifest = {
          ...rootManifest,
          content: yield* applicationManifest(
            rootManifest.content,
            applicationName,
            selectedItems.some((item) =>
              item.files?.some(
                (file) =>
                  file.target?.replace(/^~\//u, "") === "tests/e2e/package.json"
              )
            )
          ),
        };
        for (const item of selectedItems) {
          if (
            item.type !== "registry:item" ||
            item.css ||
            item.cssVars ||
            item.tailwind ||
            item.envVars
          ) {
            return yield* new InvalidComposition({
              message: `Registry directives outside exact-file installation are not implemented in this entrypoint: ${item.name}`,
            });
          }
        }
        const definitions = yield* readTemplateDefinitions(
          registry.items,
          acquired.external
        );
        const templates = selectedItems.flatMap((item) =>
          (definitions.get(item.name)?.templates ?? []).map((template) => ({
            ...template,
            owner: item.name,
          }))
        );
        const bindings = selectedItems.flatMap((item) =>
          (definitions.get(item.name)?.slotBindings ?? []).map((binding) => ({
            ...binding,
            owner: item.name,
          }))
        );
        const targets = new Map<
          string,
          { readonly mode: number; readonly origin: FileOrigin }
        >();
        const selectedManifests = new Map<
          string,
          { content: Uint8Array; mode: number }
        >([["package.json", initialManifest]]);
        const claim = (target: string, mode: number, origin: FileOrigin) =>
          Effect.gen(function* () {
            const relative = yield* relativeFile(target);
            if (isEnvironmentFile(relative)) {
              return yield* new InvalidComposition({
                message: `Composition cannot create runtime environment files: ${relative}. Keep examples as documentation; use provisioning or explicit local environment copying for values.`,
              });
            }
            if (targets.has(relative)) {
              return yield* new InvalidComposition({
                message: `Duplicate output target: ${relative}`,
              });
            }
            targets.set(relative, { mode, origin });
          });
        yield* claim("package.json", rootManifest.mode, {
          kind: "policy",
          policy: "application-manifest",
          sources: ["package.json", "registry.json"],
        });
        for (const item of selectedItems) {
          for (const file of item.files ?? []) {
            if (
              !file.target ||
              !["registry:file", "registry:page"].includes(file.type)
            ) {
              return yield* new InvalidComposition({
                message: `Registry file needs an exact target: ${file.path}`,
              });
            }
            const remote = acquired.external.has(item.name);
            if (remote && file.content === undefined) {
              return yield* new InvalidComposition({
                message: `Published artifact has no file content: ${item.name}`,
              });
            }
            const captured = remote
              ? { content: new TextEncoder().encode(file.content), mode: 0o644 }
              : yield* capture(file.path);
            yield* claim(
              file.target,
              captured.mode,
              remote
                ? { kind: "registry", owner: item.name }
                : {
                    kind: "source",
                    owner: item.name,
                    source: yield* relativeFile(file.path),
                  }
            );
            if (file.target.endsWith("/package.json")) {
              selectedManifests.set(yield* relativeFile(file.target), captured);
            }
          }
        }
        for (const template of templates) {
          const captured = yield* capture(template.source);
          yield* claim(template.target, captured.mode, {
            bindings: orderBindings(
              bindings.filter((binding) => binding.target === template.target)
            ),
            kind: "template",
            owner: template.owner,
            source: template.source,
          });
        }
        for (const asset of assets) {
          yield* claim(asset.target, (yield* capture(asset.source)).mode, {
            kind: "source",
            owner: asset.owner,
            source: asset.source,
          });
        }
        for (const binding of bindings) {
          if (
            !templates.some(
              (template) =>
                template.target === binding.target &&
                Object.hasOwn(template.slots, binding.slot)
            )
          ) {
            return yield* new InvalidComposition({
              message: `Missing template slot: ${binding.target}#${binding.slot}`,
            });
          }
        }
        const governed = new Set(ownedAssetTargets);
        for (const item of registry.items) {
          for (const template of definitions.get(item.name)?.templates ?? []) {
            governed.add(yield* relativeFile(template.target));
          }
          for (const file of item.files ?? []) {
            if (file.target) {
              governed.add(yield* relativeFile(file.target));
            }
          }
        }
        const sourceFiles = yield* inventory.list(request.source.root);
        const settings = yield* readWorkspaceSettings(
          (yield* capture("pnpm-workspace.yaml")).content
        );
        const catalog = packageCatalog(sourceFiles, settings.data.packages);
        const {
          baseline,
          directories: packageDirectories,
          manifests,
        } = yield* completePackages({
          capture,
          files: sourceFiles,
          governed,
          ownedRequirements,
          packageManifests: catalog.manifests,
          registryItems: selectedItems,
          requirements,
          selectedManifests,
        });
        for (const target of baseline) {
          yield* claim(target, (yield* retained(target)).mode, {
            kind: "source",
            owner: null,
            source: target,
          });
        }
        const rootFiles = yield* applicationWorkspace(
          settings,
          (yield* capture("pnpm-lock.yaml")).content,
          new Set(targets.keys()),
          patches
        );
        for (const target of rootFiles.keys()) {
          yield* claim(target, (yield* retained(target)).mode, {
            kind: "policy",
            policy:
              target === "pnpm-lock.yaml"
                ? "lockfile-seed"
                : "workspace-settings",
            sources: [target, "registry.json"],
          });
        }
        yield* claim("turbo.json", 0o644, {
          kind: "policy",
          policy: "application-tasks",
          sources: [],
        });
        yield* claim(".gitignore", 0o644, {
          kind: "policy",
          policy: "application-ignore",
          sources: [],
        });
        const observedInventory = (files: readonly string[]) =>
          files.filter(
            (file) =>
              catalog.matchesManifest(file) ||
              packageDirectories.some(
                (directory) =>
                  file.startsWith(`${directory}/`) && eligiblePackageFile(file)
              )
          );

        return yield* withStaging((staging) =>
          Effect.gen(function* () {
            for (const item of selectedItems) {
              if (acquired.external.has(item.name)) {
                continue;
              }
              for (const file of item.files ?? []) {
                yield* writeFile(staging.inputs, {
                  target: file.path,
                  ...(yield* retained(file.path)),
                });
              }
            }
            for (const target of baseline) {
              yield* writeFile(staging.application, {
                target,
                ...(yield* retained(target)),
              });
            }
            for (const [target, content] of rootFiles) {
              yield* writeFile(staging.application, {
                ...(yield* retained(target)),
                content,
                target,
              });
            }
            yield* writeFile(staging.inputs, {
              content: new TextEncoder().encode(
                yield* encodeJson({
                  homepage: registry.homepage,
                  items: selectedItems,
                  name: registry.name,
                })
              ),
              mode: 0o600,
              target: "registry.json",
            });
            yield* writeFile(staging.application, {
              ...initialManifest,
              target: "package.json",
            });
            const artifacts: RegistryItem[] = [];
            for (const item of selectedItems) {
              artifacts.push(
                acquired.external.has(item.name)
                  ? item
                  : yield* shadcn.loadRegistryItem(item.name, {
                      cwd: staging.inputs,
                      registryFile: "registry.json",
                    })
              );
            }
            const artifactPaths = new Map(
              artifacts.map((item, index) => [
                item.name,
                path.join(staging.registry, `${index}.json`),
              ])
            );
            for (const [index, artifact] of artifacts.entries()) {
              const registryDependencies: string[] = [];
              for (const reference of artifact.registryDependencies ?? []) {
                const name = references.get(reference);
                const target = name ? artifactPaths.get(name) : undefined;
                if (!target) {
                  return yield* new InvalidComposition({
                    message: `Unresolved registry dependency: ${reference}`,
                  });
                }
                registryDependencies.push(target);
              }
              yield* writeFile(staging.registry, {
                content: new TextEncoder().encode(
                  yield* encodeJson({
                    ...artifact,
                    dependencies: undefined,
                    devDependencies: undefined,
                    docs: undefined,
                    registryDependencies,
                  })
                ),
                mode: 0o600,
                target: `${index}.json`,
              });
            }
            if (artifacts.length) {
              yield* shadcn.install(staging, [...artifactPaths.values()]);
            }
            for (const [target, file] of manifests) {
              yield* writeFile(staging.application, { ...file, target });
            }
            for (const asset of assets) {
              yield* writeFile(staging.application, {
                ...(yield* retained(asset.source)),
                target: asset.target,
              });
            }
            for (const template of templates) {
              const source = yield* retained(template.source);
              const content = yield* renderTemplate(
                template,
                bindings.filter(
                  (binding) => binding.target === template.target
                ),
                new TextDecoder().decode(source.content)
              );
              yield* writeFile(staging.application, {
                content: new TextEncoder().encode(content),
                mode: source.mode,
                target: template.target,
              });
            }
            yield* applyTypeScriptAliases(
              staging.application,
              aliases,
              ownedAliases
            );
            const files = yield* scopeApplicationHosts(
              yield* collectFiles(staging.application),
              applicationName,
              new Set(assets.map((asset) => asset.target)),
              request.port
            );
            files.push(
              {
                content: new TextEncoder().encode(
                  `${yield* encodeJson(applicationTasks(files))}\n`
                ),
                mode: 0o644,
                target: "turbo.json",
              },
              {
                content: new TextEncoder().encode(applicationIgnoreRules),
                mode: 0o644,
                target: ".gitignore",
              }
            );
            const changed: string[] = [];
            for (const [relative, captured] of captures) {
              const absolute = path.join(request.source.root, relative);
              const bytes = yield* fs.readFile(absolute);
              const stat = yield* fs.stat(absolute);
              if (
                stat.mode % 0o1000 !== captured.mode ||
                bytes.length !== captured.content.length ||
                bytes.some((byte, index) => byte !== captured.content[index])
              ) {
                changed.push(relative);
              }
            }
            if (
              (yield* encodeJson(yield* shadcn.loadRegistry(options))) !==
              (yield* encodeJson(sourceRegistry))
            ) {
              changed.push("registry.json");
            }
            for (const [file, content] of acquired.observed) {
              if ((yield* fs.readFileString(file)) !== content) {
                changed.push(file);
              }
            }
            const currentInventory = observedInventory(
              yield* inventory.list(request.source.root)
            );
            const capturedInventory = observedInventory(sourceFiles);
            if (
              currentInventory.length !== capturedInventory.length ||
              currentInventory.some(
                (file, index) => file !== capturedInventory[index]
              )
            ) {
              const before = new Set(capturedInventory);
              const after = new Set(currentInventory);
              changed.push(
                ...currentInventory.filter((file) => !before.has(file)),
                ...capturedInventory.filter((file) => !after.has(file))
              );
            }
            if (changed.length) {
              return yield* new SourceChanged({ paths: changed });
            }
            const output: PreparedWorkspace["files"][number][] = [];
            for (const file of files) {
              const claimed = targets.get(file.target);
              if (!claimed) {
                return yield* new InvalidComposition({
                  message: `Unplanned output target: ${file.target}`,
                });
              }
              output.push({ ...file, ...claimed });
            }
            return {
              files: output,
              inputs: {
                excluded: [...governed],
                files: [
                  ...captures.keys(),
                  ...[...acquired.observed.keys()].map((file) =>
                    path
                      .relative(request.source.root, file)
                      .split(path.sep)
                      .join("/")
                  ),
                ],
                packagePatterns: catalog.patterns,
                packages: packageDirectories,
              },
              instructions: registryInstructions(artifacts),
            };
          })
        ).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        );
      });
      return Composition.of({ prepare });
    })
  );
}
