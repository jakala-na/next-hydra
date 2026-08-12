import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");
const manifests = [
  {
    item: "auth-workos",
    manifest: "packages/auth-workos/registry.json",
    sourceRoot: "packages/auth-workos",
  },
  {
    item: "cms-contentstack",
    manifest: "packages/cms-contentstack/registry.json",
    sourceRoot: "packages/cms-contentstack",
  },
  {
    item: "cms-drupal",
    manifest: "packages/cms-drupal/registry.json",
    sourceRoot: "packages/cms-drupal",
  },
  {
    item: "commerce-commercetools",
    manifest: "packages/commerce-commercetools/registry.json",
    sourceRoot: "packages/commerce-commercetools",
  },
  {
    item: "drupal-hydra",
    manifest: "apps/drupal-hydra/registry.json",
    sourceRoot: "apps/drupal-hydra",
  },
];

const binaryExtensions = new Set([
  ".avif",
  ".eot",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
]);

const declaredAssetSources = new Set(
  manifests.flatMap(({ manifest }) => {
    const registry = JSON.parse(
      readFileSync(path.join(workspaceRoot, manifest), "utf8")
    );
    return registry.items.flatMap(
      (item) => item.meta?.nextHydra?.assets?.map((asset) => asset.source) ?? []
    );
  })
);

function sourceFiles(sourceRoot) {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", sourceRoot],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
    }
  )
    .split("\n")
    .filter(Boolean)
    .filter((file) => path.posix.basename(file) !== "registry.json");

  for (const file of files) {
    if (
      binaryExtensions.has(path.posix.extname(file).toLowerCase()) &&
      !declaredAssetSources.has(file)
    ) {
      throw new Error(
        `${file} is binary and must be declared in meta.nextHydra.assets.`
      );
    }
  }

  return files
    .filter((file) => !declaredAssetSources.has(file))
    .sort((left, right) => left.localeCompare(right));
}

let hasDrift = false;

for (const definition of manifests) {
  const manifestPath = path.join(workspaceRoot, definition.manifest);
  const registry = JSON.parse(readFileSync(manifestPath, "utf8"));
  const item = registry.items.find(
    (candidate) => candidate.name === definition.item
  );
  if (!item) {
    throw new Error(
      `${definition.manifest} does not define ${definition.item}.`
    );
  }

  item.files = sourceFiles(definition.sourceRoot).map((repoPath) => {
    const relativePath = path.posix.relative(definition.sourceRoot, repoPath);
    return {
      path: relativePath,
      target: `~/${relativePath}`,
      type: "registry:file",
    };
  });

  const expected = `${JSON.stringify(registry, null, 2)}\n`;
  const current = readFileSync(manifestPath, "utf8");

  if (current === expected) {
    continue;
  }

  if (checkOnly) {
    hasDrift = true;
    process.stderr.write(
      `${definition.manifest} does not list the current tracked files. Run pnpm registry:sync.\n`
    );
  } else {
    writeFileSync(manifestPath, expected, "utf8");
    process.stdout.write(`Updated ${definition.manifest}.\n`);
  }
}

if (hasDrift) {
  process.exitCode = 1;
}
