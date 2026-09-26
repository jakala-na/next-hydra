import path from "node:path";

import { isCanonicalSource } from "./file-policy.ts";

function normalizePackagePatterns(
  patterns: readonly string[]
): readonly string[] {
  return patterns.map((input) => {
    const excluded = input.startsWith("!");
    let pattern = excluded ? input.slice(1) : input;
    while (pattern.startsWith("./")) {
      pattern = pattern.slice(2);
    }
    while (pattern.endsWith("/")) {
      pattern = pattern.slice(0, -1);
    }
    return excluded ? `!${pattern}` : pattern;
  });
}

// pnpm declarations describe discovery, not selection. Registry ownership still
// determines which discovered packages may enter a particular composition.
// Effect Path has no glob matcher; Node's pure POSIX matcher needs no filesystem access.
export function packageManifestMatcher(
  sourcePatterns: readonly string[]
): (file: string) => boolean {
  const patterns = normalizePackagePatterns(sourcePatterns);
  const included = patterns.filter((pattern) => !pattern.startsWith("!"));
  const excluded = patterns
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => pattern.slice(1));
  return (file) => {
    if (!file.endsWith("/package.json") || !isCanonicalSource(file)) {
      return false;
    }
    const directory = file.slice(0, -"/package.json".length);
    return (
      included.some((pattern) => path.posix.matchesGlob(directory, pattern)) &&
      !excluded.some((pattern) => path.posix.matchesGlob(directory, pattern))
    );
  };
}

export function applicationPackagePatterns(
  sourcePatterns: readonly string[],
  targets: ReadonlySet<string>
): readonly string[] {
  const patterns = [
    "apps/*",
    "packages/*",
    ...(targets.has("tests/e2e/package.json") ? ["tests/*"] : []),
  ];
  const directories = [...targets]
    .filter((target) => target.endsWith("/package.json"))
    .map((target) => target.slice(0, -"/package.json".length));
  // Keep customary locations open for new application code, and retain source
  // declarations needed by selected packages in other or nested locations.
  for (const pattern of normalizePackagePatterns(sourcePatterns)) {
    if (
      pattern.startsWith("!") ||
      directories.some(
        (directory) =>
          !patterns.some((existing) =>
            path.posix.matchesGlob(directory, existing)
          ) && path.posix.matchesGlob(directory, pattern)
      )
    ) {
      patterns.push(pattern);
    }
  }
  return patterns;
}

export function packageCatalog(
  files: readonly string[],
  sourcePatterns: readonly string[]
) {
  const patterns = normalizePackagePatterns(sourcePatterns);
  const matchesManifest = packageManifestMatcher(patterns);
  return {
    manifests: files.filter(matchesManifest),
    matchesManifest,
    patterns,
  };
}
