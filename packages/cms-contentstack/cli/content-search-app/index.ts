import type { InstallContentSearchAppOptions } from "@repo/search/content-search-app";
import { Effect } from "effect";
import type { ConfigProvider } from "effect";

import {
  createContentSearchAppInstallationLayer,
  provisionContentSearchAppInstallation,
} from "./installation";

/**
 * `installContentSearchApp` composition hook for the search CLI. Receives the
 * resolved ConfigProvider like the content projection hook, so no CLI command
 * requirements leak into the hook. Drupal compositions omit the hook, in
 * which case the search CLI reports manual indexing steps instead.
 */
export const installContentSearchApp = <E, R>(
  options: InstallContentSearchAppOptions,
  configProvider: Effect.Effect<ConfigProvider.ConfigProvider, E, R>
) =>
  provisionContentSearchAppInstallation(options).pipe(
    Effect.provide(createContentSearchAppInstallationLayer(configProvider))
  );
