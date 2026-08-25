import { fileURLToPath } from "node:url";

import { ConfigProvider, Effect, FileSystem, Path } from "effect";

const DEFAULT_ENV_FILE = fileURLToPath(new URL("../.env", import.meta.url));

export const loadCliConfigProvider = (envFile?: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const inherited = ConfigProvider.fromEnv();
    const environmentFile =
      envFile === undefined
        ? DEFAULT_ENV_FILE
        : path.resolve(process.cwd(), envFile);

    if (envFile === undefined && !(yield* fileSystem.exists(environmentFile))) {
      return inherited;
    }

    const file = yield* ConfigProvider.fromDotEnv({ path: environmentFile });

    return envFile === undefined
      ? ConfigProvider.orElse(inherited, file)
      : ConfigProvider.orElse(file, inherited);
  });
