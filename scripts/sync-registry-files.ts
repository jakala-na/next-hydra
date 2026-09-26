import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { format } from "oxfmt";

import oxfmtConfig from "../oxfmt.config.ts";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");
const managedSourceDirectory = "registry";
const manifests = [
  {
    item: "workspace-e2e",
    manifest: "tests/e2e/registry.json",
    sourceRoot: "tests/e2e",
  },
  {
    item: "commerce-admin",
    manifest: "apps/admin/registry.json",
    sourceRoot: "apps/admin",
  },
  {
    item: "workspace-cli",
    manifest: "apps/cli/registry.json",
    sourceRoot: "apps/cli",
  },
  {
    item: "commerce",
    manifest: "packages/commerce/registry.json",
    sourceRoot: "packages/commerce",
  },
  {
    item: "commerce-api",
    manifest: "apps/api/registry.json",
    sourceRoot: "apps/api",
  },
  {
    item: "auth-clerk",
    manifest: "packages/auth-clerk/registry.json",
    sourceRoot: "packages/auth-clerk",
  },
  {
    item: "auth-contract",
    manifest: "packages/auth-contract/registry.json",
    sourceRoot: "packages/auth-contract",
  },
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
    item: "drupal",
    manifest: "apps/drupal/registry.json",
    sourceRoot: "apps/drupal",
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

type SourceRegistry = {
  items: {
    files?: { path: string; target?: string; type: string }[];
    meta?: {
      nextHydra?: {
        assets?: { source: string }[];
      };
      composition?: {
        templates?: { source: string; target: string }[];
      };
    };
    name: string;
  }[];
};

// eslint-disable-next-line arrow-body-style -- The block keeps the safety proof adjacent to the assertion.
const readSourceRegistry = (manifest: string): SourceRegistry => {
  // SAFETY: registry files are validated against source-registry.json in the
  // composition tests and registry build before this maintenance script runs.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(
    readFileSync(path.join(workspaceRoot, manifest), "utf-8")
  ) as SourceRegistry;
};

const declaredAssetSources = new Set(
  manifests.flatMap(({ manifest }) => {
    const registry = readSourceRegistry(manifest);
    return registry.items.flatMap(
      (item) => item.meta?.nextHydra?.assets?.map((asset) => asset.source) ?? []
    );
  })
);

// Registry overlays own their materialized app and test files.
// Do not also claim their source-checkout counterparts as baseline files.
const managedSourceCopies = new Set(
  manifests.flatMap(({ manifest, sourceRoot }) =>
    readSourceRegistry(manifest).items.flatMap((item) =>
      (item.files ?? []).flatMap((file) => {
        const target = file.target?.replace(/^~\//u, "");
        return (target?.startsWith("apps/") || target?.startsWith("tests/")) &&
          target !== path.posix.join(sourceRoot, file.path)
          ? [target]
          : [];
      })
    )
  )
);

function sourceFiles(
  sourceRoot: string,
  registry: SourceRegistry,
  baseItemName: string
) {
  const compositionAuthoringSources = new Set(
    registry.items.flatMap(
      (item) =>
        item.meta?.composition?.templates?.map((template) => template.source) ??
        []
    )
  );
  const renderedTargets = new Set(
    registry.items.flatMap(
      (item) =>
        item.meta?.composition?.templates?.map((template) => template.target) ??
        []
    )
  );
  const secondaryItemSources = new Set(
    registry.items
      .filter((item) => item.name !== baseItemName)
      .flatMap((item) =>
        (item.files ?? []).map((file) => path.posix.join(sourceRoot, file.path))
      )
  );
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", sourceRoot],
    {
      cwd: workspaceRoot,
      encoding: "utf-8",
    }
  )
    .split("\n")
    .filter(Boolean)
    .filter((file) => existsSync(path.join(workspaceRoot, file)))
    .filter((file) => path.posix.basename(file) !== "registry.json")
    .filter((file) => !managedSourceCopies.has(file))
    // Prototypes are maintainer references, not generated workspace source.
    .filter((file) => !file.startsWith(`${sourceRoot}/prototypes/`))
    // Composition authoring inputs produce ordinary targets; they are not
    // themselves installed into customer workspaces.
    .filter((file) => !compositionAuthoringSources.has(file))
    .filter((file) => !renderedTargets.has(file))
    // A colocated manifest may assign exact source files to secondary items.
    .filter((file) => !secondaryItemSources.has(file));

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

  const installableFiles = files.filter(
    (file) => !declaredAssetSources.has(file)
  );
  // eslint-disable-next-line unicorn/no-array-sort -- filter returns a fresh array.
  return installableFiles.sort((left, right) => left.localeCompare(right));
}

const formatRegistryJson = async (
  manifest: string,
  registryJson: string
): Promise<string> => {
  const result = await format(manifest, registryJson, oxfmtConfig);

  if (result.errors.length > 0) {
    throw new Error(
      `Could not format ${manifest}: ${result.errors
        .map((error) => error.message)
        .join("; ")}`
    );
  }

  return result.code;
};

let hasDrift = false;

const generatedManifests = await Promise.all(
  manifests.map(async (definition) => {
    const manifestPath = path.join(workspaceRoot, definition.manifest);
    const registry = readSourceRegistry(definition.manifest);
    const item = registry.items.find(
      (candidate) => candidate.name === definition.item
    );
    if (item === undefined) {
      throw new Error(
        `${definition.manifest} does not define ${definition.item}.`
      );
    }

    item.files = sourceFiles(
      definition.sourceRoot,
      registry,
      definition.item
    ).map((repoPath) => {
      const relativePath = path.posix.relative(definition.sourceRoot, repoPath);
      const managedPrefix = `${managedSourceDirectory}/`;
      const target = relativePath.startsWith(managedPrefix)
        ? relativePath.slice(managedPrefix.length)
        : repoPath;
      return {
        path: relativePath,
        target: `~/${target}`,
        type: "registry:file",
      };
    });

    return {
      current: readFileSync(manifestPath, "utf-8"),
      definition,
      expected: await formatRegistryJson(
        definition.manifest,
        JSON.stringify(registry)
      ),
      manifestPath,
    };
  })
);

for (const {
  current,
  definition,
  expected,
  manifestPath,
} of generatedManifests) {
  if (current === expected) {
    continue;
  }

  if (checkOnly) {
    hasDrift = true;
    process.stderr.write(
      `${definition.manifest} does not list the current tracked files. Run pnpm registry:sync.\n`
    );
  } else {
    writeFileSync(manifestPath, expected, "utf-8");
    process.stdout.write(`Updated ${definition.manifest}.\n`);
  }
}

if (hasDrift) {
  process.exitCode = 1;
}
