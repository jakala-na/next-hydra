import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import nodePath from "node:path";

import { Schema } from "effect";

const dependencyEntries = Schema.Record(Schema.String, Schema.String);
const PackageManifest = Schema.Struct({
  dependencies: Schema.optional(dependencyEntries),
  devDependencies: Schema.optional(dependencyEntries),
  exports: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  optionalDependencies: Schema.optional(dependencyEntries),
  peerDependencies: Schema.optional(dependencyEntries),
});
type PackageManifest = typeof PackageManifest.Type;
const decodeManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(PackageManifest)
);

const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const sourceExtensionPattern = /(?:\.[cm]?[jt]sx?)$/u;
const providerTransportVocabularyPattern =
  /commercetools|gql\.tada|@urql|wonka/iu;
const providerFieldKindPattern =
  /["'](?:text|ltext|number|boolean|enum|lenum|money|date|time|datetime|reference|set)["']/u;
const providerPackage = "@repo/commerce-commercetools";
const corePackage = "@repo/commerce";
const providerCategoryVocabularyPattern = /\bcommercetoolsCategory\w*\b/iu;

const forbiddenCoreDependencies = new Set([
  "@commercetools/platform-sdk",
  "@commercetools/ts-client",
  "@gql.tada/cli-utils",
  "@repo/commerce-commercetools",
  "@repo/versioned-store",
  "@t3-oss/env-nextjs",
  "@urql/core",
  "chalk",
  "commander",
  "dotenv",
  "gql.tada",
  "ora",
  "urql",
  "wonka",
]);

const forbiddenCorePathPrefixes = [
  "cli/",
  "gql/",
  "graphql.ts",
  "keys.ts",
  "lib/client/",
  "lib/custom-fields/",
  "lib/infra/commercetools/",
  "lib/product/",
  "lib/shared/",
  "migrations/",
  "schema/",
] as const;

const allowedProviderDependencies = new Set([
  "apps/api/package.json",
  "apps/cli/package.json",
  "apps/web/package.json",
]);

const posixPath = (path: string) => path.split(nodePath.sep).join("/");

const extension = (path: string) => {
  const match = sourceExtensionPattern.exec(path);
  return match?.[0] ?? "";
};

const readJson = (path: string): PackageManifest =>
  decodeManifest(readFileSync(path, "utf-8"));

const runtimeDirectories = new Set([
  "node_modules",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
]);

// Inspect the actual composition, including source-linked files in ignored
// workspaces. Git's tracked-file inventory is empty for those workspaces.
export const repositoryFiles = (repoRoot: string): readonly string[] => {
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith(".") || runtimeDirectories.has(entry.name)) {
        return [];
      }
      const filename = nodePath.resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return walk(filename);
      }
      return entry.isFile() ||
        (entry.isSymbolicLink() && statSync(filename).isFile())
        ? [filename]
        : [];
    });
  return ["apps", "packages"].flatMap((directory) =>
    walk(nodePath.resolve(repoRoot, directory))
  );
};

export const extractImportSpecifiers = (source: string): readonly string[] => {
  const specifiers = new Set<string>();
  const patterns = [
    /\bfrom\s*["'](?<specifier>[^"']+)["']/gu,
    /\bimport\s*["'](?<specifier>[^"']+)["']/gu,
    /\bimport\s*\(\s*["'](?<specifier>[^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["'](?<specifier>[^"']+)["']\s*\)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match.groups?.specifier;
      if (specifier !== undefined) {
        specifiers.add(specifier);
      }
    }
  }

  return [...specifiers];
};

const dependencyNames = (manifest: PackageManifest) =>
  new Set(
    [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.optionalDependencies,
      manifest.peerDependencies,
    ].flatMap((dependencies) => Object.keys(dependencies ?? {}))
  );

const packageSubpath = (specifier: string, packageName: string) =>
  specifier === packageName ? "." : `.${specifier.slice(packageName.length)}`;

const checkExplicitExports = (
  manifest: PackageManifest,
  packageName: string
): readonly string[] => {
  const { exports } = manifest;
  if (exports === undefined) {
    return [`${packageName} must declare explicit package exports`];
  }

  return Object.entries(exports).flatMap(([subpath, target]) => {
    if (!Schema.is(Schema.String)(target)) {
      return [
        `${packageName} export ${subpath} must declare an explicit file path`,
      ];
    }
    const violations: string[] = [];
    if (subpath.includes("*") || target.includes("*")) {
      violations.push(
        `${packageName} export ${subpath} must not use a wildcard`
      );
    }
    if (!(subpath === "." || subpath.startsWith("./"))) {
      violations.push(
        `${packageName} export ${subpath} is not a package subpath`
      );
    }
    if (!target.startsWith("./")) {
      violations.push(`${packageName} export ${subpath} leaves its package`);
    }
    return violations;
  });
};

const checkImportedSubpaths = (
  files: readonly string[],
  manifest: PackageManifest,
  packageName: string,
  repoRoot: string
): readonly string[] => {
  const exports = new Set(Object.keys(manifest.exports ?? {}));
  const violations: string[] = [];

  for (const file of files) {
    const imports = extractImportSpecifiers(readFileSync(file, "utf-8"));
    for (const specifier of imports) {
      if (
        (specifier === packageName ||
          specifier.startsWith(`${packageName}/`)) &&
        !exports.has(packageSubpath(specifier, packageName))
      ) {
        violations.push(
          `${posixPath(nodePath.relative(repoRoot, file))} imports unsupported ${specifier}`
        );
      }
    }
  }

  return violations;
};

export const checkGeneratedProductAttributesSource = (
  source: string,
  artifactPath: string,
  commerceRoot: string
): readonly string[] => {
  const violations: string[] = [];

  for (const specifier of extractImportSpecifiers(source)) {
    if (specifier === "effect") {
      continue;
    }

    if (specifier.startsWith(".")) {
      const importedPath = nodePath.resolve(
        nodePath.dirname(artifactPath),
        specifier
      );
      if (
        importedPath === commerceRoot ||
        importedPath.startsWith(`${commerceRoot}${nodePath.sep}`)
      ) {
        continue;
      }
    }

    violations.push(
      `product/generated/attributes.ts imports non-core module ${specifier}`
    );
  }

  if (providerTransportVocabularyPattern.test(source)) {
    violations.push(
      "product/generated/attributes.ts contains provider transport vocabulary"
    );
  }

  if (providerFieldKindPattern.test(source)) {
    violations.push(
      "product/generated/attributes.ts contains raw provider field-kind vocabulary"
    );
  }

  return violations;
};

const checkGeneratedProductAttributes = (
  commerceRoot: string
): readonly string[] => {
  const artifactPath = nodePath.resolve(
    commerceRoot,
    "product/generated/attributes.ts"
  );
  return checkGeneratedProductAttributesSource(
    readFileSync(artifactPath, "utf-8"),
    artifactPath,
    commerceRoot
  );
};

export const checkApplicationRuntimeBindingSource = (
  source: string,
  sourcePath: string
): readonly string[] => {
  const imports = extractImportSpecifiers(source);

  return imports.includes("@repo/commerce/runtime")
    ? []
    : [
        `${sourcePath} must import the application-selected @repo/commerce/runtime binding`,
      ];
};

export const checkCommerceBoundaries = (
  repoRoot: string
): readonly string[] => {
  const commerceRoot = nodePath.resolve(repoRoot, "packages/commerce");
  const providerRoot = nodePath.resolve(
    repoRoot,
    "packages/commerce-commercetools"
  );
  const cmsRoots = [
    nodePath.resolve(repoRoot, "packages/cms-contentstack"),
    nodePath.resolve(repoRoot, "packages/cms-drupal"),
  ];
  const commerceManifest = readJson(
    nodePath.resolve(commerceRoot, "package.json")
  );
  const providerManifest = readJson(
    nodePath.resolve(providerRoot, "package.json")
  );
  const allRepositoryFiles = repositoryFiles(repoRoot);
  const commerceFiles = allRepositoryFiles.filter((file) =>
    file.startsWith(`${commerceRoot}${nodePath.sep}`)
  );
  const cmsSourceFiles = allRepositoryFiles.filter(
    (file) =>
      cmsRoots.some((cmsRoot) =>
        file.startsWith(`${cmsRoot}${nodePath.sep}`)
      ) && sourceExtensions.has(extension(file))
  );
  const allSourceFiles = allRepositoryFiles.filter((path) =>
    sourceExtensions.has(extension(path))
  );
  const violations: string[] = [];

  for (const dependency of dependencyNames(commerceManifest)) {
    if (forbiddenCoreDependencies.has(dependency)) {
      violations.push(
        `@repo/commerce declares forbidden dependency ${dependency}`
      );
    }
  }

  for (const file of commerceFiles) {
    const corePath = posixPath(nodePath.relative(commerceRoot, file));
    if (
      forbiddenCorePathPrefixes.some(
        (prefix) => corePath === prefix || corePath.startsWith(prefix)
      )
    ) {
      violations.push(
        `@repo/commerce contains provider-owned path ${corePath}`
      );
    }
  }

  for (const file of cmsSourceFiles) {
    const source = readFileSync(file, "utf-8");
    if (providerCategoryVocabularyPattern.test(source)) {
      violations.push(
        `${posixPath(nodePath.relative(repoRoot, file))} names a provider Category representation`
      );
    }
  }

  for (const directory of ["apps", "packages"] as const) {
    const root = nodePath.resolve(repoRoot, directory);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const manifestPath = nodePath.resolve(root, entry.name, "package.json");
      if (!existsSync(manifestPath)) {
        continue;
      }
      const manifest = readJson(manifestPath);
      const manifestRepoPath = posixPath(
        nodePath.relative(repoRoot, manifestPath)
      );
      if (
        dependencyNames(manifest).has(providerPackage) &&
        !allowedProviderDependencies.has(manifestRepoPath) &&
        manifestRepoPath !== "packages/commerce-commercetools/package.json"
      ) {
        violations.push(
          `${manifestRepoPath} must not depend on ${providerPackage}`
        );
      }
    }
  }

  violations.push(
    ...checkExplicitExports(commerceManifest, corePackage),
    ...checkExplicitExports(providerManifest, providerPackage),
    ...checkImportedSubpaths(
      allSourceFiles,
      commerceManifest,
      corePackage,
      repoRoot
    ),
    ...checkImportedSubpaths(
      allSourceFiles,
      providerManifest,
      providerPackage,
      repoRoot
    ),
    ...checkGeneratedProductAttributes(commerceRoot),
    ...checkApplicationRuntimeBindingSource(
      readFileSync(
        nodePath.resolve(commerceRoot, "customer-account/actions.ts"),
        "utf-8"
      ),
      "packages/commerce/customer-account/actions.ts"
    )
  );

  return violations;
};
