import path from "node:path";
import {
  SANITIZE_REMOVE_PATHS,
  SANITIZE_REMOVE_ROOT_DEPENDENCIES,
  SANITIZE_REMOVE_SCRIPTS,
} from "./constants.js";
import {
  normalizePackageName,
  readJsonFile,
  removePath,
  writeJsonFile,
} from "./fs-utils.js";

type SanitizeStarterOptions = {
  targetPath: string;
  targetName: string;
  registryAuthoringPaths?: string[];
};

type RootPackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
};

export async function sanitizeStarter({
  targetPath,
  targetName,
  registryAuthoringPaths = [],
}: SanitizeStarterOptions): Promise<{ packageName: string }> {
  await Promise.all(
    [...SANITIZE_REMOVE_PATHS, ...registryAuthoringPaths].map((relativePath) =>
      removePath(path.join(targetPath, relativePath))
    )
  );

  const packageJsonPath = path.join(targetPath, "package.json");
  const packageJson = await readJsonFile<RootPackageJson>(packageJsonPath);
  const packageName = normalizePackageName(targetName);

  packageJson.name = packageName;

  for (const script of SANITIZE_REMOVE_SCRIPTS) {
    delete packageJson.scripts?.[script];
  }
  for (const dependency of SANITIZE_REMOVE_ROOT_DEPENDENCIES) {
    delete packageJson.dependencies?.[dependency];
  }

  await writeJsonFile(packageJsonPath, packageJson);

  return { packageName };
}
