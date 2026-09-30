import type {
  InstallContentSearchAppOptions,
  InstalledContentSearchApp,
} from "@repo/search/content-search-app";
import { ConfigProvider, Effect, Redacted } from "effect";
import type { Effect as EffectType } from "effect";

import { AlgoliaProvisioningError } from "./provisioning/model";

/** Freshly provisioned CMS credentials take precedence over operator input. */
export const contentSearchAppConfigProvider = (
  credentials: {
    readonly ALGOLIA_APPLICATION_ID: string;
    readonly ALGOLIA_CONTENT_INDEX_NAME?: string;
    readonly ALGOLIA_CONTENT_WRITE_API_KEY: Redacted.Redacted;
  },
  fallback: ConfigProvider.ConfigProvider
) =>
  ConfigProvider.orElse(
    ConfigProvider.fromUnknown({
      ...credentials,
      ALGOLIA_CONTENT_WRITE_API_KEY: Redacted.value(
        credentials.ALGOLIA_CONTENT_WRITE_API_KEY
      ),
    }),
    fallback
  );

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
