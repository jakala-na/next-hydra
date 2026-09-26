import { createHash } from "node:crypto";

import {
  Array as EffectArray,
  Effect,
  FileSystem,
  Order,
  Path,
  Redacted,
  Schema,
} from "effect";

import { InvalidComposition } from "./errors.ts";
import { relativeFile, writeFile } from "./files.ts";
import { ManifestJson, registryDependencies } from "./packages.ts";
import type { PackageRequirement } from "./packages.ts";
import { acquireRegistry, registryInstructions } from "./registry.ts";
import { providerAliases, registryIndex } from "./selection.ts";
import { Shadcn } from "./shadcn.ts";
import { withRegistryInstallation } from "./staging.ts";
import { WorkspaceDependencies } from "./workspace-dependencies.ts";

export class AdditionChanged extends Schema.TaggedError<AdditionChanged>()(
  "AdditionChanged",
  {}
) {
  readonly message =
    "The registry or project changed after inspection. Inspect the addition again before applying it. No installation was started.";
}
export class AdditionConflict extends Schema.TaggedError<AdditionConflict>()(
  "AdditionConflict",
  { paths: Schema.Array(Schema.String) }
) {
  get message() {
    return `Adding this item would replace local work: ${this.paths.join(", ")}. Explicit replacement permission is required.`;
  }
}
export class AdditionFailed extends Schema.TaggedError<AdditionFailed>()(
  "AdditionFailed",
  {
    diagnostic: Schema.Redacted(Schema.String),
    directory: Schema.String,
    phase: Schema.Literals(["registry", "packages"]),
  }
) {
  get message() {
    return `Addition failed during ${this.phase} installation in ${this.directory}. Project changes may remain; inspect them before retrying. No rollback was attempted.`;
  }
}
export interface AddRequest {
  readonly reference: string;
  readonly overwrite: boolean;
  readonly expected?: string;
}
export interface AddInspection {
  readonly assumptions: readonly string[];
  readonly environment: readonly string[];
  readonly files: readonly {
    readonly target: string;
    readonly status: "create" | "identical" | "changed";
  }[];
  readonly packages: readonly (Omit<PackageRequirement, "specifier"> & {
    readonly status: "create" | "identical" | "changed";
  })[];
  readonly precondition: string;
}

const json = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const digest = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");

function fileStatus(
  actual: string | null,
  expected: string
): AddInspection["files"][number]["status"] {
  if (actual === null) {
    return "create";
  }
  return actual === digest(expected) ? "identical" : "changed";
}

type RegistryIndex = Effect.Success<ReturnType<typeof registryIndex>>;

// Published selection identities are also recognizable in projects that do not
// keep a composition receipt. Custom providers are described by the acquired graph.
const knownProviders = new Map([
  [
    "next-hydra/auth/clerk",
    { alias: "@repo/auth", package: "@repo/auth-clerk" },
  ],
  [
    "next-hydra/auth/workos",
    { alias: "@repo/auth", package: "@repo/auth-workos" },
  ],
  [
    "next-hydra/cms/contentstack",
    { alias: "@repo/cms", package: "@repo/cms-contentstack" },
  ],
  [
    "next-hydra/cms/drupal",
    { alias: "@repo/cms", package: "@repo/cms-drupal" },
  ],
  [
    "next-hydra/commerce/commercetools",
    {
      alias: "@repo/commerce-provider",
      package: "@repo/commerce-commercetools",
    },
  ],
]);

const validateAddition = Effect.fn("ExistingWorkspace.validateAddition")(
  function* (index: RegistryIndex, reference: string) {
    if (
      index.metadataByName.get(index.references.get(reference) ?? "")?.kind ===
      "provider"
    ) {
      return yield* new InvalidComposition({
        message:
          "Add does not switch providers. Select providers when composing an application.",
      });
    }
    for (const item of index.items.values()) {
      const metadata = index.metadataByName.get(item.name);
      if (
        item.meta?.composition !== undefined ||
        metadata?.kind === "preset" ||
        metadata?.kind === "recipe" ||
        (metadata?.conditionalDependencies?.length ?? 0) > 0 ||
        (metadata?.assets?.length ?? 0) > 0 ||
        (metadata?.pnpmPatches?.length ?? 0) > 0
      ) {
        return yield* new InvalidComposition({
          message:
            "Add installs files into an existing project; select templates, presets and composition recipes when composing the application.",
        });
      }
      if (
        item.css ||
        item.cssVars ||
        item.tailwind ||
        ("fonts" in item &&
          Array.isArray(item.fonts) &&
          item.fonts.length > 0) ||
        "config" in item
      ) {
        return yield* new InvalidComposition({
          message:
            "This registry item needs a configured package-local ShadCN installation; root addition cannot apply its configuration changes.",
        });
      }
    }
  }
);

function packageStatus(
  actual: string | undefined,
  expected: string | undefined
): AddInspection["packages"][number]["status"] {
  if (actual === undefined) {
    return "create";
  }
  return expected === undefined || actual === expected
    ? "identical"
    : "changed";
}

const installedRequirements = Effect.fn(
  "ExistingWorkspace.installedRequirements"
)(function* (index: RegistryIndex, manifest: typeof ManifestJson.Type) {
  const selections = new Map(
    [...index.metadataByName.values()].map((metadata) => [
      metadata.id,
      metadata,
    ])
  );
  const assumptions: string[] = [];
  const packages: {
    readonly cwd: string;
    readonly section: PackageRequirement["section"];
    readonly name: string;
    readonly specifier: string;
  }[] = [];
  const matches = (id: string): boolean | undefined => {
    const selection = selections.get(id);
    if (
      selection?.kind !== "provider" ||
      !selection.slot ||
      !selection.binding
    ) {
      const known = knownProviders.get(id);
      if (!known) {
        return undefined;
      }
      const actual = manifest.dependencies?.[known.alias];
      return (
        actual === known.package ||
        actual?.startsWith(`workspace:${known.package}@`) === true ||
        actual?.startsWith(`npm:${known.package}@`) === true
      );
    }
    return (
      manifest.dependencies?.[providerAliases[selection.slot]] ===
      selection.binding.specifier
    );
  };
  for (const metadata of selections.values()) {
    for (const slot of ["auth", "cms", "commerce"] as const) {
      const requirement = metadata.providerSlots?.[slot];
      const present =
        manifest.dependencies?.[providerAliases[slot]] !== undefined;
      if (
        (requirement === "required" && !present) ||
        (requirement === "forbidden" && present)
      ) {
        return yield* new InvalidComposition({
          message: `${metadata.id} ${requirement === "required" ? "requires" : "forbids"} an installed ${slot} provider.`,
        });
      }
    }
    if (metadata.kind === "provider" && matches(metadata.id) !== true) {
      return yield* new InvalidComposition({
        message:
          "The requested registry graph requires a different installed provider. Add cannot switch providers.",
      });
    }
    for (const required of metadata.compatibility?.requires ?? []) {
      const match = matches(required);
      if (match === false) {
        return yield* new InvalidComposition({
          message: "An add-on requires a different installed provider.",
        });
      }
      if (match === undefined && selections.get(required)?.kind !== "add-on") {
        assumptions.push(
          "A registry requirement cannot be verified: this project has no authoritative selection record."
        );
      }
    }
    for (const conflict of metadata.compatibility?.conflicts ?? []) {
      const match = matches(conflict);
      if (match === true || selections.get(conflict)?.kind === "add-on") {
        return yield* new InvalidComposition({
          message:
            "The requested registry graph conflicts with an installed provider or selected add-on.",
        });
      }
      if (match === undefined) {
        assumptions.push(
          "A registry conflict cannot be ruled out: this project has no authoritative selection record."
        );
      }
    }
    packages.push(...(metadata.packages ?? []));
    for (const requirement of metadata.providerDependencies ?? []) {
      const name = providerAliases[requirement.slot];
      const specifier = manifest.dependencies?.[name];
      if (!specifier) {
        return yield* new InvalidComposition({
          message: `The installed application has no ${requirement.slot} provider binding.`,
        });
      }
      packages.push({
        cwd: requirement.cwd,
        name,
        section: requirement.section,
        specifier,
      });
    }
  }
  return { assumptions, packages };
});

export const existingWorkspace = Effect.fn("Workspaces.existing")(function* (
  root: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const shadcn = yield* Shadcn;
  const dependencies = yield* WorkspaceDependencies;
  const directory = path.resolve(root);
  const observe = (target: string) =>
    fs.readFile(path.join(directory, target)).pipe(
      Effect.map(digest),
      Effect.catchIf(
        (error) => error.reason._tag === "NotFound",
        () => Effect.succeed(null)
      )
    );
  const inspect = Effect.fn("ExistingWorkspace.inspect")(function* (
    reference: string
  ) {
    const graph = yield* acquireRegistry(directory, { reference }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(Shadcn, shadcn)
    );
    const index = yield* registryIndex(graph.registry, graph.references);
    yield* validateAddition(index, reference);
    // A project manifest is required, but its contents never appear in inspection.
    yield* fs.access(path.join(directory, "package.json"));
    const web = yield* fs
      .readFileString(path.join(directory, "apps/web/package.json"))
      .pipe(
        Effect.flatMap(Schema.decodeEffect(ManifestJson)),
        Effect.catchIf(
          (error) =>
            error._tag === "PlatformError" && error.reason._tag === "NotFound",
          () => Effect.succeed({})
        )
      );
    const installed = yield* installedRequirements(index, web);
    const environment = EffectArray.sort(
      new Set(
        graph.registry.items.flatMap((item) => Object.keys(item.envVars ?? {}))
      ),
      Order.String
    );
    const facts = new Map<string, string | null>();
    const files: AddInspection["files"][number][] = [];
    const packages: PackageRequirement[] = [];
    const requirements = new Map<string, string>();
    const manifests = new Map<string, string>();
    for (const requirement of installed.packages) {
      const target =
        requirement.cwd === "."
          ? "package.json"
          : `${yield* relativeFile(requirement.cwd)}/package.json`;
      const key = `${target}:${requirement.section}:${requirement.name}`;
      const existing = requirements.get(key);
      if (existing !== undefined && existing !== requirement.specifier) {
        return yield* new InvalidComposition({
          message: `Conflicting package requirements for ${key}`,
        });
      }
      if (existing === undefined) {
        packages.push({ ...requirement, target });
      }
      requirements.set(key, requirement.specifier);
      facts.set(target, yield* observe(target));
    }
    for (const item of graph.registry.items) {
      for (const file of item.files ?? []) {
        if (
          !file.target?.startsWith("~/") ||
          file.content === undefined ||
          !["registry:file", "registry:item"].includes(file.type)
        ) {
          return yield* new InvalidComposition({
            message:
              "Add requires hydrated exact-copy files with explicit workspace-root targets.",
          });
        }
        const target = yield* relativeFile(file.target);
        if (files.some((existing) => existing.target === target)) {
          return yield* new InvalidComposition({
            message: `Multiple registry files claim ${target}`,
          });
        }
        const current = yield* observe(target);
        facts.set(target, current);
        files.push({ status: fileStatus(current, file.content), target });
        if (target === "package.json" || target.endsWith("/package.json")) {
          manifests.set(target, file.content);
        }
      }
    }
    const packageChanges: AddInspection["packages"][number][] = [];
    const rootRequirements = yield* registryDependencies(graph.registry.items);
    for (const requirement of packages) {
      const native = rootRequirements.find(
        (entry) => entry.name === requirement.name
      );
      if (
        requirement.target === "package.json" &&
        native?.specifier !== undefined &&
        native.specifier !== requirement.specifier
      ) {
        return yield* new InvalidComposition({
          message: `Conflicting root dependency requirements for ${requirement.name}`,
        });
      }
    }
    const rootManifest = yield* Schema.decodeEffect(ManifestJson)(
      manifests.get("package.json") ??
        (yield* fs.readFileString(path.join(directory, "package.json")))
    );
    for (const requirement of rootRequirements) {
      const actual =
        rootManifest.dependencies?.[requirement.name] ??
        rootManifest.devDependencies?.[requirement.name] ??
        rootManifest.optionalDependencies?.[requirement.name] ??
        rootManifest.peerDependencies?.[requirement.name];
      packageChanges.push({
        name: requirement.name,
        section: requirement.section,
        status: packageStatus(actual, requirement.specifier),
        target: "package.json",
      });
    }
    for (const requirement of packages) {
      const manifest = yield* Schema.decodeEffect(ManifestJson)(
        manifests.get(requirement.target) ??
          (yield* fs.readFileString(path.join(directory, requirement.target)))
      );
      const actual = manifest[requirement.section]?.[requirement.name];
      packageChanges.push({
        name: requirement.name,
        section: requirement.section,
        status: packageStatus(actual, requirement.specifier),
        target: requirement.target,
      });
    }
    for (const target of [
      "package.json",
      "components.json",
      "apps/web/package.json",
      // These are the native adapter's possible environment targets. Bind their
      // presence and content to inspection without putting values in the report.
      ...(environment.length
        ? [".env.local", ".env", ".env.development.local", ".env.development"]
        : []),
    ]) {
      facts.set(target, yield* observe(target));
    }
    const precondition = digest(
      yield* json({
        artifacts: graph.registry.items,
        directory,
        facts: [...facts],
        reference,
      })
    );
    return {
      facts,
      graph,
      inspection: {
        assumptions: installed.assumptions,
        environment,
        files,
        packages: packageChanges,
        precondition,
      } satisfies AddInspection,
      needsInstall:
        packages.length > 0 ||
        rootRequirements.length > 0 ||
        manifests.size > 0 ||
        files.some(({ target }) =>
          [
            "pnpm-workspace.yaml",
            "pnpm-lock.yaml",
            ".npmrc",
            ".pnpmfile.cjs",
          ].includes(target)
        ),
      packages,
    };
  });
  const inspectAdd = Effect.fn("ExistingWorkspace.inspectAdd")(
    function* (request: { readonly reference: string }) {
      return (yield* inspect(request.reference)).inspection;
    }
  );
  const add = Effect.fn("ExistingWorkspace.add")(function* (
    request: AddRequest
  ) {
    const checked = yield* inspect(request.reference);
    if (
      request.expected !== undefined &&
      request.expected !== checked.inspection.precondition
    ) {
      return yield* new AdditionChanged();
    }
    const conflicts = [
      ...checked.inspection.files,
      ...checked.inspection.packages,
    ]
      .filter((file) => file.status === "changed")
      .map((file) => file.target);
    if (!request.overwrite && conflicts.length) {
      return yield* new AdditionConflict({ paths: conflicts });
    }
    yield* withRegistryInstallation(directory, (installation) =>
      Effect.gen(function* () {
        const artifacts = new Map(
          checked.graph.registry.items.map((item, ordinal) => [
            item.name,
            path.join(installation.registry, `${ordinal}.json`),
          ])
        );
        for (const [ordinal, item] of checked.graph.registry.items.entries()) {
          const registryReferences: string[] = [];
          for (const reference of item.registryDependencies ?? []) {
            const dependency = artifacts.get(
              checked.graph.references.get(reference) ?? reference
            );
            if (!dependency) {
              return yield* new InvalidComposition({
                message: "Registry dependency was not acquired.",
              });
            }
            registryReferences.push(dependency);
          }
          yield* writeFile(installation.registry, {
            content: new TextEncoder().encode(
              yield* json({
                ...item,
                docs: undefined,
                registryDependencies: registryReferences,
              })
            ),
            mode: 0o600,
            target: `${ordinal}.json`,
          });
        }
        for (const [target, value] of checked.facts) {
          if ((yield* observe(target)) !== value) {
            return yield* new AdditionChanged();
          }
        }
        yield* shadcn
          .install(installation, [...artifacts.values()], request.overwrite)
          .pipe(
            Effect.mapError(
              (error) =>
                new AdditionFailed({
                  diagnostic: Redacted.make(String(error)),
                  directory,
                  phase: "registry",
                })
            )
          );
      })
    ).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path)
    );
    yield* Effect.gen(function* () {
      // Read after native installation so its manifest edits are retained.
      for (const requirement of checked.packages) {
        const target = path.join(directory, requirement.target);
        const manifest = yield* Schema.decodeEffect(ManifestJson)(
          yield* fs.readFileString(target)
        );
        const actual = manifest[requirement.section]?.[requirement.name];
        if (
          actual !== undefined &&
          actual !== requirement.specifier &&
          !request.overwrite
        ) {
          return yield* new AdditionConflict({ paths: [requirement.target] });
        }
        const updated = {
          ...manifest,
          [requirement.section]: {
            ...manifest[requirement.section],
            [requirement.name]: requirement.specifier,
          },
        };
        yield* fs
          .writeFileString(
            target,
            `${yield* Schema.encodeEffect(ManifestJson)(updated)}\n`
          )
          .pipe(Effect.uninterruptible);
      }
    }).pipe(
      Effect.mapError(
        (error) =>
          new AdditionFailed({
            diagnostic: Redacted.make(String(error)),
            directory,
            phase: "packages",
          })
      )
    );
    if (checked.needsInstall) {
      yield* dependencies.install(directory);
    }
    return {
      directory,
      files: checked.inspection.files,
      instructions: registryInstructions(checked.graph.registry.items),
    };
  });
  return { add, inspectAdd };
});

export type ExistingWorkspace = Effect.Success<
  ReturnType<typeof existingWorkspace>
>;
