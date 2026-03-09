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
  ".git",
  "apps/docs",
  "pnpm-lock.yaml",
] as const;
