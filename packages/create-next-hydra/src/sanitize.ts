import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  SANITIZE_REMOVE_PATHS,
  SANITIZE_REMOVE_ROOT_DEPENDENCIES,
  SANITIZE_REMOVE_ROOT_DEV_DEPENDENCIES,
  SANITIZE_REMOVE_SCRIPTS,
} from "./constants.js";
import {
  normalizePackageName,
  pathExists,
  readJsonFile,
  removePath,
  writeJsonFile,
} from "./fs-utils.js";

const MAINTAINER_PORTLESS_PROJECT = "next-hydra";
const MAX_DNS_LABEL_LENGTH = 63;
const PORTLESS_PROJECT_HASH_LENGTH = 6;
const PORTLESS_PROJECT_FILES = [
  ".vscode/launch.json",
  "apps/admin/.env.example",
  "apps/api/.env.example",
  "apps/storybook/README.md",
  "apps/web/.env.example",
  "packages/cms-contentstack/README.md",
  "packages/cms-contentstack/cli/index.ts",
  "packages/cms-contentstack/cli/provisioning/provision.test.ts",
  "packages/cms-contentstack/cli/provisioning/recipe-live.test.ts",
] as const;

type PortlessApplicationConfig = { name?: string };
type PortlessPackageJson = {
  portless?: PortlessApplicationConfig;
};

const portlessApplicationName = (
  applicationName: string,
  projectName: string
): string => {
  const [service] = applicationName.split(".");

  return `${service}.${projectName}`;
};

type SanitizeStarterOptions = {
  targetPath: string;
  targetName: string;
  registryAuthoringPaths?: string[];
};

type RootPackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const portlessProjectName = (packageName: string): string => {
  const sanitized = packageName
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/gu, "-")
    .replaceAll(/-{2,}/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");

  if (sanitized.length <= MAX_DNS_LABEL_LENGTH) {
    return sanitized;
  }

  const hash = createHash("sha256")
    .update(sanitized)
    .digest("hex")
    .slice(0, PORTLESS_PROJECT_HASH_LENGTH);
  const prefix = sanitized
    .slice(0, MAX_DNS_LABEL_LENGTH - PORTLESS_PROJECT_HASH_LENGTH - 1)
    .replaceAll(/-+$/gu, "");

  return `${prefix}-${hash}`;
};

const rewritePackagePortlessProject = async (
  packageJsonPath: string,
  projectName: string
): Promise<void> => {
  if (!(await pathExists(packageJsonPath))) {
    return;
  }

  const packageJson = await readJsonFile<PortlessPackageJson>(packageJsonPath);
  const config = packageJson.portless;

  if (!config?.name) {
    return;
  }

  config.name = portlessApplicationName(config.name, projectName);
  await writeJsonFile(packageJsonPath, packageJson);
};

const rewriteApplicationPortlessConfigs = async (
  targetPath: string,
  projectName: string
): Promise<void> => {
  const applicationsPath = path.join(targetPath, "apps");

  if (!(await pathExists(applicationsPath))) {
    return;
  }

  const applicationEntries = await readdir(applicationsPath, {
    withFileTypes: true,
  });
  const applicationDirectories = applicationEntries.filter((entry) =>
    entry.isDirectory()
  );

  await Promise.all(
    applicationDirectories.map(async ({ name }) => {
      await rewritePackagePortlessProject(
        path.join(applicationsPath, name, "package.json"),
        projectName
      );
    })
  );
};

const rewritePortlessProject = async (
  targetPath: string,
  packageName: string
): Promise<void> => {
  const projectName = portlessProjectName(packageName);

  await rewriteApplicationPortlessConfigs(targetPath, projectName);

  const maintainerHostname = `.${MAINTAINER_PORTLESS_PROJECT}.localhost`;
  const projectHostname = `.${projectName}.localhost`;

  await Promise.all(
    PORTLESS_PROJECT_FILES.map(async (relativePath) => {
      const filePath = path.join(targetPath, relativePath);

      if (!(await pathExists(filePath))) {
        return;
      }

      const source = await readFile(filePath, "utf-8");
      const rewritten = source.replaceAll(maintainerHostname, projectHostname);

      if (rewritten !== source) {
        await writeFile(filePath, rewritten, "utf-8");
      }
    })
  );
};

export async function sanitizeStarter({
  targetPath,
  targetName,
  registryAuthoringPaths = [],
}: SanitizeStarterOptions): Promise<{ packageName: string }> {
  await Promise.all(
    [...SANITIZE_REMOVE_PATHS, ...registryAuthoringPaths].map(
      async (relativePath) => {
        await removePath(path.join(targetPath, relativePath));
      }
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
  for (const dependency of SANITIZE_REMOVE_ROOT_DEV_DEPENDENCIES) {
    delete packageJson.devDependencies?.[dependency];
  }

  await Promise.all([
    writeJsonFile(packageJsonPath, packageJson),
    rewritePortlessProject(targetPath, packageName),
  ]);

  return { packageName };
}
