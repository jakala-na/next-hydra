import path from "node:path";
import { SANITIZE_REMOVE_PATHS } from "./constants.js";
import {
  normalizePackageName,
  readJsonFile,
  removePath,
  writeJsonFile,
} from "./fs-utils.js";

type SanitizeStarterOptions = {
  targetPath: string;
  targetName: string;
};

type RootPackageJson = {
  name?: string;
  [key: string]: unknown;
};

export async function sanitizeStarter({
  targetPath,
  targetName,
}: SanitizeStarterOptions): Promise<{ packageName: string }> {
  for (const relativePath of SANITIZE_REMOVE_PATHS) {
    await removePath(path.join(targetPath, relativePath));
  }

  const packageJsonPath = path.join(targetPath, "package.json");
  const packageJson = await readJsonFile<RootPackageJson>(packageJsonPath);
  const packageName = normalizePackageName(targetName);

  packageJson.name = packageName;

  await writeJsonFile(packageJsonPath, packageJson);

  return { packageName };
}
