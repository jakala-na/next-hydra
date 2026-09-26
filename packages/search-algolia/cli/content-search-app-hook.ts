import type {
  InstallContentSearchAppOptions,
  InstalledContentSearchApp,
} from "@repo/search/content-search-app";
import { Effect } from "effect";
import type { ConfigProvider, Effect as EffectType } from "effect";

import { AlgoliaProvisioningError } from "./provisioning/model";

export type ContentSearchAppHook<ContentError> = (
  options: InstallContentSearchAppOptions,
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider>
) => EffectType.Effect<InstalledContentSearchApp, ContentError>;

/**
 * Resolves the composed CMS provider's content search app hook. Providers
 * without a search app (Drupal) omit the hook, in which case callers report
 * their manual indexing steps instead of attempting an installation.
 */
export const requireContentSearchAppHook = <ContentError>(
  installHook: ContentSearchAppHook<ContentError> | undefined
): Effect.Effect<
  ContentSearchAppHook<ContentError>,
  AlgoliaProvisioningError
> =>
  installHook === undefined
    ? Effect.fail(
        new AlgoliaProvisioningError({
          cause: new Error(
            "The composed CMS provider does not supply a content search app installation"
          ),
          message:
            "Content search app installation is not supported for the selected CMS provider. Complete content indexing manually.",
          operation: "content search app installation",
        })
      )
    : Effect.succeed(installHook);
