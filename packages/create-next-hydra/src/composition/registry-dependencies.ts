import type { RegistryItem } from "shadcn/schema";

import { CompositionValidationError } from "./errors.js";
import type { PackageJson } from "./packages.js";

export type RegistryPackageDependency = {
  name: string;
  section: "dependencies" | "devDependencies";
  specifier?: string;
};

/** Standard ShadCN fields belong to the installation root; package-local entries use nextHydra.packages. */
export function planRegistryDependencies(
  items: readonly RegistryItem[]
): RegistryPackageDependency[] {
  const dependencies = new Map<string, RegistryPackageDependency>();
  for (const item of items) {
    for (const section of ["dependencies", "devDependencies"] as const) {
      for (const dependency of item[section] ?? []) {
        const match =
          /^(?<name>(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*)(?:@(?<specifier>\S+))?$/iu.exec(
            dependency
          );
        const name = match?.groups?.name;
        const specifier = match?.groups?.specifier;
        if (!name) {
          throw new CompositionValidationError(
            "Registry dependencies require explicit package names.",
            [
              `${item.name}.${section}: ${dependency}. Use name@specifier (including named npm aliases or URLs), or meta.nextHydra.packages. Unnamed URLs and paths cannot be materialized without installing them.`,
            ]
          );
        }
        const previous = dependencies.get(name);
        if (
          previous?.specifier &&
          specifier &&
          previous.specifier !== specifier
        ) {
          throw new CompositionValidationError(
            "Registry package dependencies conflict.",
            [
              `${name} is requested as both ${previous.specifier} and ${specifier} (${item.name}).`,
            ]
          );
        }
        dependencies.set(name, {
          name,
          section:
            previous?.section === "dependencies" ? "dependencies" : section,
          specifier: previous?.specifier ?? specifier,
        });
      }
    }
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- Sort only a fresh array; the CLI targets ES2022.
  return [...dependencies.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

/** Record requirements without running a package manager; both creation paths install afterward. */
export function applyRegistryDependencies(
  manifest: PackageJson,
  dependencies: readonly RegistryPackageDependency[]
): void {
  for (const { name, section, specifier } of dependencies) {
    const existing = (
      [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ] as const
    ).some((key) => Object.hasOwn(manifest[key] ?? {}, name));
    // Like ShadCN, a bare name reuses an existing dependency rather than upgrading it.
    if (!specifier && existing) {
      continue;
    }
    const otherSection =
      section === "dependencies" ? "devDependencies" : "dependencies";
    const destination =
      section === "devDependencies" && manifest.dependencies?.[name]
        ? "dependencies"
        : section;
    (manifest[destination] ??= {})[name] = specifier ?? "latest";
    if (destination === section) {
      delete manifest[otherSection]?.[name];
    }
  }
}
