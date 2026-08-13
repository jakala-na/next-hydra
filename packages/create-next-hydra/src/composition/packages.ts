import { readFile } from "node:fs/promises";
import { z } from "zod";

import { CompositionValidationError } from "./errors.js";
import { formatZodError } from "./schema.js";
import type {
  DependencySection,
  PackageRequirement,
  SelectionDefinition,
} from "./types.js";

const dependencyEntriesSchema = z.record(z.string());
const packageJsonSchema = z
  .object({
    dependencies: dependencyEntriesSchema.optional(),
    devDependencies: dependencyEntriesSchema.optional(),
    optionalDependencies: dependencyEntriesSchema.optional(),
  })
  .passthrough();

export type PackageJson = Partial<
  Record<DependencySection, Record<string, string>>
> & {
  [key: string]: unknown;
};

function decodePackageJson(value: unknown, label: string): PackageJson {
  const result = packageJsonSchema.safeParse(value);
  if (!result.success) {
    throw new CompositionValidationError(
      `${label} is not a valid package.json file.`,
      formatZodError(result.error)
    );
  }
  // Zod reconstructs objects in schema order, so return the validated input
  // to preserve the manifest's existing key positions.
  return value as PackageJson;
}

export function parsePackageJson(source: string, label: string): PackageJson {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: CompositionValidationError forwards these ErrorOptions to Error.
    throw new CompositionValidationError(
      `${label} is not a valid package.json file.`,
      [error instanceof Error ? error.message : "JSON parsing failed"],
      { cause: error }
    );
  }
  return decodePackageJson(value, label);
}

export async function readPackageJson(
  filePath: string,
  label = filePath
): Promise<PackageJson> {
  return parsePackageJson(await readFile(filePath, "utf8"), label);
}

export function mergePackageRequirements(
  selections: Pick<SelectionDefinition, "packages">[]
): PackageRequirement[] {
  const requirements = new Map<string, PackageRequirement>();
  const issues: string[] = [];

  for (const selection of selections) {
    for (const requirement of selection.packages) {
      const key = `${requirement.cwd}\0${requirement.section}\0${requirement.name}`;
      const existing = requirements.get(key);
      if (existing && existing.specifier !== requirement.specifier) {
        issues.push(
          `${requirement.cwd}/${requirement.section}.${requirement.name} is requested as both ${existing.specifier} and ${requirement.specifier}`
        );
      } else {
        requirements.set(key, requirement);
      }
    }
  }

  if (issues.length > 0) {
    throw new CompositionValidationError(
      "Package requirements conflict.",
      [...new Set(issues)].sort((left, right) => left.localeCompare(right))
    );
  }

  return [...requirements.values()].sort((left, right) =>
    `${left.cwd}/${left.section}/${left.name}`.localeCompare(
      `${right.cwd}/${right.section}/${right.name}`
    )
  );
}
