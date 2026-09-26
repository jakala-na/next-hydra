import { Array as EffectArray, Effect, Order, Schema } from "effect";
import type { PlatformError } from "effect";
import type { RegistryItem } from "shadcn/schema";

import { InvalidComposition } from "./errors.ts";
import { eligiblePackageFile } from "./file-policy.ts";

const Dependencies = Schema.Record(Schema.String, Schema.String);
const Manifest = Schema.StructWithRest(
  Schema.Struct({
    dependencies: Schema.optionalKey(Dependencies),
    devDependencies: Schema.optionalKey(Dependencies),
    name: Schema.optionalKey(Schema.String),
    optionalDependencies: Schema.optionalKey(Dependencies),
    peerDependencies: Schema.optionalKey(Dependencies),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);
export const ManifestJson = Schema.fromJsonString(Manifest, { space: 2 });

export const DependencySection = Schema.Literals([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
]);
export interface PackageRequirement {
  readonly target: string;
  readonly section: typeof DependencySection.Type;
  readonly name: string;
  readonly specifier: string;
}
export type PackageRequirementTarget = Omit<PackageRequirement, "specifier">;

type RegistryRequirements = Pick<
  RegistryItem,
  "name" | "dependencies" | "devDependencies"
>;
interface RootRequirement {
  readonly name: string;
  readonly section: "dependencies" | "devDependencies";
  readonly specifier: string | undefined;
}

export const registryDependencies = Effect.fn(
  "Composition.registryDependencies"
)(function* (items: readonly RegistryRequirements[]) {
  const requirements = new Map<string, RootRequirement>();
  for (const item of items) {
    for (const section of ["dependencies", "devDependencies"] as const) {
      for (const request of item[section] ?? []) {
        const match =
          /^(?<name>(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*)(?:@(?<specifier>\S+))?$/iu.exec(
            request
          );
        const name = match?.groups?.name;
        const specifier = match?.groups?.specifier;
        if (!name) {
          return yield* new InvalidComposition({
            message: `${item.name}.${section} requires explicit package names: use name or name@specifier, not unnamed URLs or paths`,
          });
        }
        const previous = requirements.get(name);
        if (
          previous?.specifier &&
          specifier &&
          previous.specifier !== specifier
        ) {
          return yield* new InvalidComposition({
            message: `Conflicting registry dependency: ${name} (${item.name})`,
          });
        }
        requirements.set(name, {
          name,
          section:
            previous?.section === "dependencies" ? "dependencies" : section,
          specifier: previous?.specifier ?? specifier,
        });
      }
    }
  }
  return EffectArray.sortWith(
    [...requirements.values()],
    (requirement) => requirement.name,
    Order.String
  );
});

function applyRegistryDependencies(
  manifest: typeof Manifest.Type,
  requirements: readonly RootRequirement[]
): typeof Manifest.Type {
  const output = { ...manifest };
  for (const { name, section, specifier } of requirements) {
    if (
      !specifier &&
      [
        output.dependencies,
        output.devDependencies,
        output.optionalDependencies,
        output.peerDependencies,
      ].some((entries) => Object.hasOwn(entries ?? {}, name))
    ) {
      continue;
    }
    const destination =
      section === "devDependencies" &&
      Object.hasOwn(output.dependencies ?? {}, name)
        ? "dependencies"
        : section;
    output[destination] = {
      ...output[destination],
      [name]: specifier ?? "latest",
    };
    const other =
      destination === "dependencies" ? "devDependencies" : "dependencies";
    if (output[other]) {
      output[other] = Object.fromEntries(
        Object.entries(output[other]).filter(([key]) => key !== name)
      );
    }
  }
  return output;
}

interface CapturedFile {
  readonly content: Uint8Array;
  readonly mode: number;
}
type Capture = (
  file: string
) => Effect.Effect<
  CapturedFile,
  PlatformError.PlatformError | InvalidComposition
>;

function internalDependencies(manifest: typeof Manifest.Type): string[] {
  return [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ].flatMap((section) =>
    Object.entries(section ?? {}).flatMap(([name, specifier]) => {
      if (!specifier.startsWith("workspace:")) {
        return [];
      }
      return [
        specifier.startsWith("workspace:@")
          ? specifier.slice(10, specifier.lastIndexOf("@"))
          : name,
      ];
    })
  );
}

interface PackageInputs {
  readonly files: readonly string[];
  readonly packageManifests: readonly string[];
  readonly selectedManifests: ReadonlyMap<string, CapturedFile>;
  readonly governed: ReadonlySet<string>;
  readonly capture: Capture;
  readonly requirements: readonly PackageRequirement[];
  readonly ownedRequirements: readonly PackageRequirementTarget[];
  readonly registryItems: readonly RegistryRequirements[];
}

export const completePackages = Effect.fn("Composition.completePackages")(
  function* ({
    files,
    packageManifests,
    selectedManifests,
    governed,
    capture,
    requirements,
    ownedRequirements,
    registryItems,
  }: PackageInputs) {
    const rootRequirements = yield* registryDependencies(registryItems);
    const unique = new Map<string, PackageRequirement>();
    for (const requirement of requirements) {
      const rootRequirement =
        requirement.target === "package.json"
          ? rootRequirements.find((entry) => entry.name === requirement.name)
          : undefined;
      if (
        rootRequirement?.specifier &&
        rootRequirement.specifier !== requirement.specifier
      ) {
        return yield* new InvalidComposition({
          message: `Conflicting root dependency declarations: ${requirement.name}`,
        });
      }
      const key = `${requirement.target}\0${requirement.section}\0${requirement.name}`;
      const previous = unique.get(key);
      if (previous && previous.specifier !== requirement.specifier) {
        return yield* new InvalidComposition({
          message: `Conflicting package requirements: ${requirement.target} ${requirement.section}.${requirement.name} (${previous.specifier}, ${requirement.specifier})`,
        });
      }
      unique.set(key, requirement);
    }
    const outputManifests = new Map<string, CapturedFile>();
    const reconcile = Effect.fn("Composition.reconcileManifest")(function* (
      target: string,
      file: CapturedFile
    ) {
      const decoded = yield* Schema.decodeEffect(ManifestJson)(
        new TextDecoder().decode(file.content)
      );
      let manifest = { ...decoded };
      for (const entry of ownedRequirements.filter(
        (requirement) => requirement.target === target
      )) {
        const section = manifest[entry.section];
        if (section && Object.hasOwn(section, entry.name)) {
          manifest[entry.section] = Object.fromEntries(
            Object.entries(section).filter(([name]) => name !== entry.name)
          );
        }
      }
      for (const requirement of unique.values()) {
        if (requirement.target === target) {
          manifest[requirement.section] = {
            ...manifest[requirement.section],
            [requirement.name]: requirement.specifier,
          };
        }
      }
      if (target === "package.json") {
        manifest = applyRegistryDependencies(manifest, rootRequirements);
      }
      outputManifests.set(target, {
        ...file,
        content: new TextEncoder().encode(
          `${yield* Schema.encodeEffect(ManifestJson)(manifest)}\n`
        ),
      });
      return manifest;
    });
    const byName = new Map<string, string>();
    const manifests = new Map<string, typeof Manifest.Type>();
    const packageRoots = packageManifests.map((file) =>
      file.slice(0, -"package.json".length)
    );
    for (const file of packageManifests) {
      const content = yield* capture(file);
      const manifest = yield* Schema.decodeEffect(ManifestJson)(
        new TextDecoder().decode(content.content)
      );
      if (!manifest.name) {
        return yield* new InvalidComposition({
          message: `Missing package name: ${file}`,
        });
      }
      if (byName.has(manifest.name)) {
        return yield* new InvalidComposition({
          message: `Duplicate package name: ${manifest.name}`,
        });
      }
      byName.set(manifest.name, file);
      manifests.set(file, manifest);
    }
    const pending: string[] = [];
    for (const [target, file] of selectedManifests) {
      const manifest = yield* reconcile(target, file);
      if (manifest.name) {
        byName.set(manifest.name, target);
      }
      manifests.set(target, manifest);
      pending.push(...internalDependencies(manifest));
    }
    const selected = new Set<string>();
    const baseline = new Set<string>();
    const directories = new Set<string>();
    while (pending.length) {
      const name = pending.pop();
      if (name === undefined) {
        break;
      }
      if (selected.has(name)) {
        continue;
      }
      selected.add(name);
      const manifestPath = byName.get(name);
      if (!manifestPath) {
        return yield* new InvalidComposition({
          message: `Missing internal package: ${name}`,
        });
      }
      if (!selectedManifests.has(manifestPath)) {
        if (governed.has(manifestPath)) {
          return yield* new InvalidComposition({
            message: `${name} requires its registry item to be selected`,
          });
        }
        const directory = manifestPath.slice(0, -"package.json".length);
        directories.add(directory.slice(0, -1));
        manifests.set(
          manifestPath,
          yield* reconcile(manifestPath, yield* capture(manifestPath))
        );
        for (const file of files.filter(
          (candidate) =>
            candidate.startsWith(directory) &&
            !packageRoots.some(
              (other) =>
                other !== directory &&
                other.startsWith(directory) &&
                candidate.startsWith(other)
            ) &&
            eligiblePackageFile(candidate) &&
            !governed.has(candidate)
        )) {
          yield* capture(file);
          baseline.add(file);
        }
      }
      const manifest = manifests.get(manifestPath);
      if (!manifest) {
        return yield* new InvalidComposition({
          message: `Missing manifest for ${name}`,
        });
      }
      pending.push(...internalDependencies(manifest));
    }
    for (const requirement of requirements) {
      if (!outputManifests.has(requirement.target)) {
        return yield* new InvalidComposition({
          message: `Missing package requirement target: ${requirement.target}`,
        });
      }
    }
    return {
      baseline,
      directories: [...directories],
      manifests: outputManifests,
    };
  }
);
