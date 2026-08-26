import type { StarterDefinition } from "./types.js";

export const CLI_NAME = "create-next-hydra";
export const DEFAULT_REPO_URL = "https://github.com/jakala-na/next-hydra.git";
export const DEFAULT_COMMIT_MESSAGE = "Initial commit";
export const DEFAULT_PACKAGE_MANAGER = "pnpm";

export const DEFAULT_STARTER: StarterDefinition = {
  id: "default",
  repoUrl: DEFAULT_REPO_URL,
};

export const SANITIZE_REMOVE_PATHS = [
  ".changeset",
  ".git",
  ".github/workflows/release-create-next-hydra.yml",
  ".scratch",
  "RELEASING.md",
  "apps/docs",
  "next-hydra.json",
  "packages/create-next-hydra",
  "scripts/release-create-next-hydra.mjs",
  "scripts/sync-registry-files.ts",
] as const;

export const SANITIZE_REMOVE_SCRIPTS = [
  "changeset",
  "changeset:status",
  "publish:cli",
  "registry:check",
  "registry:sync",
  "release:create-next-hydra",
  "release:create-next-hydra:dry-run",
  "version:cli",
] as const;

export const SANITIZE_REMOVE_ROOT_DEPENDENCIES = [
  "@clack/prompts",
  "commander",
] as const;

export const SANITIZE_REMOVE_ROOT_DEV_DEPENDENCIES = [
  "@changesets/cli",
] as const;
