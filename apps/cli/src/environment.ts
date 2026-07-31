import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const DEFAULT_ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));

export const resolveEnvironmentFile = (envFile?: string): string =>
  envFile === undefined ? DEFAULT_ENV_FILE : resolve(process.cwd(), envFile);

export const environmentFileFromArguments = (
  arguments_: readonly string[]
): string | undefined => {
  for (const [index, argument] of arguments_.entries()) {
    if (argument.startsWith("--env-file=")) {
      const envFile = argument.slice("--env-file=".length);
      if (!envFile) {
        throw new Error("--env-file requires a path");
      }
      return envFile;
    }
    if (argument === "--env-file") {
      const envFile = arguments_[index + 1];
      if (!envFile) {
        throw new Error("--env-file requires a path");
      }
      return envFile;
    }
  }

  return undefined;
};

export const loadEnvironmentFile = (envFile?: string): void => {
  const path = resolveEnvironmentFile(envFile);
  if (envFile === undefined && !existsSync(path)) {
    return;
  }

  const result = loadDotenv({
    path,
    override: envFile !== undefined,
    quiet: true,
  });

  if (result.error) {
    throw result.error;
  }
};
