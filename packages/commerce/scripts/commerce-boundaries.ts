import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

type PackageManifest = {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly exports?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
};

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
const sourceExtensionPattern = /(?:\.[cm]?[jt]sx?)$/;
const providerTransportVocabularyPattern =
  /commercetools|gql\.tada|@urql|wonka/i;
const providerFieldKindPattern =
  /["'](?:text|ltext|number|boolean|enum|lenum|money|date|time|datetime|reference|set)["']/;
const providerPackage = "@repo/commerce-commercetools";
const corePackage = "@repo/commerce";
const providerCategoryVocabularyPattern = /\bcommercetoolsCategory\w*\b/i;

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

const posixPath = (path: string) => path.split(sep).join("/");

const extension = (path: string) => {
  const match = sourceExtensionPattern.exec(path);
  return match?.[0] ?? "";
};

const readJson = (path: string): PackageManifest =>
  JSON.parse(readFileSync(path, "utf8")) as PackageManifest;

const repositoryFiles = (repoRoot: string): readonly string[] =>
  execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "apps",
      "packages",
    ],
    { cwd: repoRoot, encoding: "utf8" }
  )
    .split("\n")
    .filter((path) => path.length > 0)
    .map((path) => resolve(repoRoot, path))
    .filter(existsSync);

const runBiomeImportBoundaries = (repoRoot: string) => {
  execFileSync(
    "pnpm",
    [
      "exec",
      "biome",
      "lint",
      "--only=style/noRestrictedImports",
      "apps",
      "packages",
    ],
    { cwd: repoRoot, stdio: "inherit" }
  );
};

export const extractImportSpecifiers = (source: string): readonly string[] => {
  const specifiers = new Set<string>();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
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
  const exports = manifest.exports;
  if (exports === undefined) {
    return [`${packageName} must declare explicit package exports`];
  }

  return Object.entries(exports).flatMap(([subpath, target]) => {
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
    const imports = extractImportSpecifiers(readFileSync(file, "utf8"));
    for (const specifier of imports) {
      if (
        (specifier === packageName ||
          specifier.startsWith(`${packageName}/`)) &&
        !exports.has(packageSubpath(specifier, packageName))
      ) {
        violations.push(
          `${posixPath(relative(repoRoot, file))} imports unsupported ${specifier}`
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
      const importedPath = resolve(dirname(artifactPath), specifier);
      if (
        importedPath === commerceRoot ||
        importedPath.startsWith(`${commerceRoot}${sep}`)
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
  const artifactPath = resolve(commerceRoot, "product/generated/attributes.ts");
  return checkGeneratedProductAttributesSource(
    readFileSync(artifactPath, "utf8"),
    artifactPath,
    commerceRoot
  );
};

export const checkCommerceBoundaries = (
  repoRoot: string
): readonly string[] => {
  const commerceRoot = resolve(repoRoot, "packages/commerce");
  const providerRoot = resolve(repoRoot, "packages/commerce-commercetools");
  const cmsRoots = [
    resolve(repoRoot, "packages/cms-contentstack"),
    resolve(repoRoot, "packages/cms-drupal"),
  ];
  const commerceManifest = readJson(resolve(commerceRoot, "package.json"));
  const providerManifest = readJson(resolve(providerRoot, "package.json"));
  const allRepositoryFiles = repositoryFiles(repoRoot);
  const commerceFiles = allRepositoryFiles.filter((file) =>
    file.startsWith(`${commerceRoot}${sep}`)
  );
  const cmsSourceFiles = allRepositoryFiles.filter(
    (file) =>
      cmsRoots.some((cmsRoot) => file.startsWith(`${cmsRoot}${sep}`)) &&
      sourceExtensions.has(extension(file))
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
    const corePath = posixPath(relative(commerceRoot, file));
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
    const source = readFileSync(file, "utf8");
    if (providerCategoryVocabularyPattern.test(source)) {
      violations.push(
        `${posixPath(relative(repoRoot, file))} names a provider Category representation`
      );
    }
  }

  for (const directory of ["apps", "packages"] as const) {
    const root = resolve(repoRoot, directory);
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const manifestPath = resolve(root, entry.name, "package.json");
      if (!existsSync(manifestPath)) {
        continue;
      }
      const manifest = readJson(manifestPath);
      const manifestRepoPath = posixPath(relative(repoRoot, manifestPath));
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
    ...checkGeneratedProductAttributes(commerceRoot)
  );

  return violations;
};

const scriptPath = process.argv[1];
if (
  scriptPath !== undefined &&
  resolve(scriptPath) === fileURLToPath(import.meta.url)
) {
  const commerceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = resolve(commerceRoot, "../..");
  runBiomeImportBoundaries(repoRoot);
  const violations = checkCommerceBoundaries(repoRoot);

  if (violations.length > 0) {
    process.stderr.write(
      `${violations.map((violation) => `- ${violation}`).join("\n")}\n`
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("Commerce provider boundaries are valid\n");
  }
}
