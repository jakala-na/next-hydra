import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { applyEdits, modify, parse, printParseErrorCode } from "jsonc-parser";
import type { ParseError } from "jsonc-parser";
import { z } from "zod";

import { pathExists } from "../fs-utils.js";
import { CompositionValidationError } from "./errors.js";
import type { CompositionPlan, TypeScriptPathAlias } from "./types.js";

const typeScriptConfigSchema = z
  .object({
    compilerOptions: z
      .object({
        paths: z.record(z.string(), z.array(z.string())).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type TypeScriptPathUpdate = {
  alias: string;
  expected: string[];
};

type TypeScriptPathPlan = Pick<
  CompositionPlan,
  "catalogTypeScriptPathAliases" | "typeScriptPathAliases"
>;

type TypeScriptConfigPlan = {
  config: string;
  desired: TypeScriptPathAlias[];
  governed: string[];
};

const formattingOptions = {
  eol: "\n",
  insertFinalNewline: true,
  insertSpaces: true,
  tabSize: 2,
};

const parseTypeScriptConfig = (
  source: string,
  label: string
): z.infer<typeof typeScriptConfigSchema> => {
  const errors: ParseError[] = [];
  // SAFETY: jsonc-parser types its decoded JSON value as any; Zod validates it
  // immediately below before it enters the composition domain.
  const value = parse(source, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as unknown;
  if (errors.length > 0) {
    throw new CompositionValidationError(`${label} is not valid JSONC.`, [
      ...new Set(errors.map((error) => printParseErrorCode(error.error))),
    ]);
  }
  const result = typeScriptConfigSchema.safeParse(value);
  if (!result.success) {
    throw new CompositionValidationError(
      `${label} is not a valid tsconfig.json file.`,
      result.error.issues.map((issue) => issue.message)
    );
  }
  return result.data;
};

const toPosixRelative = (from: string, to: string): string => {
  const relative = path.relative(from, to).split(path.sep).join(path.posix.sep);
  return relative.startsWith(".") ? relative : `./${relative}`;
};

const expectedPaths = (
  workspaceRoot: string,
  requirement: TypeScriptPathAlias
): TypeScriptPathUpdate[] => {
  const consumerRoot = path.join(workspaceRoot, requirement.cwd);
  const targetRoot = path.join(workspaceRoot, requirement.sourcePath);
  const relativeTarget = toPosixRelative(consumerRoot, targetRoot);

  return [
    { alias: requirement.alias, expected: [relativeTarget] },
    {
      alias: `${requirement.alias}/*`,
      expected: [`${relativeTarget}/*`],
    },
  ];
};

const insertBeforeWorkspaceWildcard = (properties: string[]): number => {
  const wildcardIndex = properties.indexOf("@repo/*");
  return wildcardIndex === -1 ? properties.length : wildcardIndex;
};

const samePath = (actual: string[] | undefined, expected: string[]): boolean =>
  actual !== undefined &&
  actual.length === expected.length &&
  actual.every((value, index) => value === expected[index]);

const typeScriptConfigPath = (cwd: string): string =>
  path.posix.join(cwd, "tsconfig.json");

const typeScriptConfigPlans = (
  plan: TypeScriptPathPlan
): TypeScriptConfigPlan[] => {
  const byConfig = new Map<
    string,
    { desired: TypeScriptPathAlias[]; governed: Set<string> }
  >();

  for (const target of plan.catalogTypeScriptPathAliases) {
    const config = typeScriptConfigPath(target.cwd);
    const entry = byConfig.get(config) ?? {
      desired: [],
      governed: new Set<string>(),
    };
    entry.governed.add(target.alias);
    byConfig.set(config, entry);
  }
  for (const alias of plan.typeScriptPathAliases) {
    const config = typeScriptConfigPath(alias.cwd);
    const entry = byConfig.get(config) ?? {
      desired: [],
      governed: new Set<string>(),
    };
    entry.desired.push(alias);
    entry.governed.add(alias.alias);
    byConfig.set(config, entry);
  }

  const configs = [...byConfig].map(([config, entry]) => ({
    config,
    desired: entry.desired,
    governed: [...entry.governed],
  }));
  // eslint-disable-next-line unicorn/no-array-sort -- The newly-created array is safe to sort in place.
  return configs.sort((left, right) => left.config.localeCompare(right.config));
};

const governedPathAliases = (alias: string): string[] => [alias, `${alias}/*`];

export const applyTypeScriptPathAliases = async (
  workspaceRoot: string,
  plan: TypeScriptPathPlan
): Promise<void> => {
  await Promise.all(
    typeScriptConfigPlans(plan).map(async ({ config, desired, governed }) => {
      const absoluteConfigPath = path.join(workspaceRoot, config);
      if (desired.length === 0 && !(await pathExists(absoluteConfigPath))) {
        return;
      }
      let source = await readFile(absoluteConfigPath, "utf-8");
      const configValue = parseTypeScriptConfig(source, config);
      const paths = configValue.compilerOptions?.paths ?? {};
      const updates = desired.flatMap((entry) =>
        expectedPaths(workspaceRoot, entry)
      );
      const desiredAliases = new Set(desired.map((entry) => entry.alias));
      const removals = governed
        .filter((alias) => !desiredAliases.has(alias))
        .flatMap(governedPathAliases)
        .filter((alias) => paths[alias] !== undefined);
      if (
        removals.length === 0 &&
        updates.every(({ alias, expected }) =>
          samePath(paths[alias], expected)
        )
      ) {
        return;
      }

      for (const alias of removals) {
        source = applyEdits(
          source,
          modify(source, ["compilerOptions", "paths", alias], undefined, {
            formattingOptions,
          })
        );
      }
      for (const { alias, expected } of updates) {
        source = applyEdits(
          source,
          modify(source, ["compilerOptions", "paths", alias], expected, {
            formattingOptions,
            getInsertionIndex: insertBeforeWorkspaceWildcard,
          })
        );
      }
      await writeFile(absoluteConfigPath, source, "utf-8");
    })
  );
};

export const checkTypeScriptPathAliases = async (
  workspaceRoot: string,
  plan: TypeScriptPathPlan
): Promise<string[]> => {
  const issues = await Promise.all(
    typeScriptConfigPlans(plan).map(async ({ config, desired, governed }) => {
      const absoluteConfigPath = path.join(workspaceRoot, config);
      if (!(await pathExists(absoluteConfigPath))) {
        return desired.length === 0 ? [] : [`${config}: file is missing`];
      }
      const source = await readFile(absoluteConfigPath, "utf-8");
      const configValue = parseTypeScriptConfig(source, config);
      const paths = configValue.compilerOptions?.paths ?? {};
      const desiredAliases = new Set(desired.map((entry) => entry.alias));
      const pathIssues = desired
        .flatMap((entry) => expectedPaths(workspaceRoot, entry))
        .filter(({ alias, expected }) => !samePath(paths[alias], expected))
        .map(
          ({ alias, expected }) =>
            `${config}: expected compilerOptions.paths.${alias} to be ${JSON.stringify(expected)}`
        );
      const stalePathIssues = governed
        .filter((alias) => !desiredAliases.has(alias))
        .flatMap(governedPathAliases)
        .flatMap((alias) => {
          const actual = paths[alias];
          return actual === undefined
            ? []
            : [
                `${config}: expected compilerOptions.paths.${alias} to be absent, found ${JSON.stringify(actual)}`,
              ];
        });
      return [...pathIssues, ...stalePathIssues];
    })
  );
  return issues.flat();
};
