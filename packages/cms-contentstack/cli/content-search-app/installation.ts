import contentstack from "@contentstack/marketplace-sdk";
import type {
  ContentstackClient,
  ContentstackConfig,
  Region,
} from "@contentstack/marketplace-sdk";
import type {
  ContentSearchAppStatus,
  InstalledContentSearchApp,
} from "@repo/search/content-search-app";
import {
  Config,
  ConfigProvider,
  Context,
  Effect,
  Layer,
  Redacted,
  Schema,
} from "effect";

import { ContentSearchAppInstallationError } from "./model";

/** Marketplace UID of the Contentstack Algolia content search app. */
export const ALGOLIA_CONTENTSTACK_APP_UID = "61c0805c1ecff10018907bf6";

const CONTENTSTACK_CDN_BASE_URL_DEFAULT = "https://cdn.contentstack.io";

/** Matches the exported installation's `configuration` payload. */
export interface ContentSearchAppInstallationConfigurationOptions {
  readonly branch: string;
  readonly environment: string;
}

export const contentSearchAppInstallationConfiguration = ({
  branch,
  environment,
}: ContentSearchAppInstallationConfigurationOptions) => ({
  additionalSettings: false,
  checkValue: false,
  custom_config: {} as const,
  defaultEnv: { label: environment, value: environment },
  envs: [environment],
  includeAssets: false,
  scopedMappings: [
    {
      branches: [branch],
      ct_uid: "landing_page",
      environments: [environment],
      fields: ["display_title", "url"],
    },
  ],
});

export type ContentSearchAppConfiguration = ReturnType<
  typeof contentSearchAppInstallationConfiguration
>;

export interface ContentSearchAppDeliveryToken {
  readonly baseUrl: string;
  readonly env: string;
  readonly name: string;
  readonly token: string;
  readonly uid: string;
}

/** Matches the exported installation's per-environment `server_configuration`. */
export interface ContentSearchAppServerConfigurationOptions {
  readonly apiKey: string;
  readonly applicationId: string;
  readonly branch: string;
  readonly deliveryToken: ContentSearchAppDeliveryToken;
  readonly environment: string;
  readonly indexName: string;
}

export const contentSearchAppServerConfiguration = ({
  apiKey,
  applicationId,
  branch,
  deliveryToken,
  environment,
  indexName,
}: ContentSearchAppServerConfigurationOptions) => ({
  [environment]: {
    apiKey,
    applicationId,
    branches: [branch],
    deliveryToken: {
      baseUrl: deliveryToken.baseUrl,
      branches: [branch],
      env: deliveryToken.env,
      name: deliveryToken.name,
      token: deliveryToken.token,
      uid: deliveryToken.uid,
    },
    indexName,
  },
});

export type ContentSearchAppServerConfiguration = ReturnType<
  typeof contentSearchAppServerConfiguration
>;

const MarketplaceInstallItem = Schema.Struct({
  app_uid: Schema.optional(Schema.String),
  installation_uid: Schema.optional(Schema.String),
  manifest_uid: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  uid: Schema.optional(Schema.String),
});

export type MarketplaceInstallItem = typeof MarketplaceInstallItem.Type;

const MarketplaceInstallCollection = Schema.Struct({
  items: Schema.Array(MarketplaceInstallItem),
});

const InstalledContentAppResponse = Schema.Struct({
  installation_uid: Schema.optional(Schema.String),
  uid: Schema.optional(Schema.String),
});

export interface InstalledContentApp {
  readonly installationUid: string;
}

const installationUidOf = (item: {
  readonly installation_uid?: string | undefined;
  readonly uid?: string | undefined;
}): string | undefined => item.uid ?? item.installation_uid;

/** Matches the installed Algolia content search app in a stack installation listing. */
export const isAlgoliaContentSearchAppInstall = (
  item: MarketplaceInstallItem
): boolean => {
  const uid = item.app_uid ?? item.manifest_uid;
  if (uid !== undefined) {
    return uid === ALGOLIA_CONTENTSTACK_APP_UID;
  }
  // The installation list view omits the app UID on some stacks.
  return item.name?.toLowerCase().includes("algolia") === true;
};

export interface ContentSearchAppMarketplace {
  readonly installApp: (options: {
    readonly appUid: string;
    readonly stackApiKey: string;
  }) => Effect.Effect<InstalledContentApp, ContentSearchAppInstallationError>;
  readonly installation: (installationUid: string) => {
    readonly setConfiguration: (
      configuration: ContentSearchAppConfiguration
    ) => Effect.Effect<void, ContentSearchAppInstallationError>;
    readonly setServerConfig: (
      configuration: ContentSearchAppServerConfiguration
    ) => Effect.Effect<void, ContentSearchAppInstallationError>;
  };
  readonly listInstallations: (options: {
    readonly stackApiKey: string;
  }) => Effect.Effect<
    readonly MarketplaceInstallItem[],
    ContentSearchAppInstallationError
  >;
}

export interface InstallContentSearchAppOptions {
  readonly configuration: ContentSearchAppConfiguration;
  readonly environment: string;
  readonly indexName: string;
  readonly marketplace: ContentSearchAppMarketplace;
  readonly serverConfiguration: ContentSearchAppServerConfiguration;
  readonly stackApiKey: string;
}

const contentAppError = (
  message: string,
  cause: unknown
): ContentSearchAppInstallationError =>
  new ContentSearchAppInstallationError({
    cause,
    message,
    operation: "content search app installation",
  });

export const installOrUpdateContentSearchApp = Effect.fn(
  "ContentSearchAppInstallation.installOrUpdate"
)(function* (options: InstallContentSearchAppOptions) {
  const items = yield* options.marketplace.listInstallations({
    stackApiKey: options.stackApiKey,
  });
  const existing = items.find(isAlgoliaContentSearchAppInstall);

  let installationUid: string | undefined;
  let status: ContentSearchAppStatus;
  if (existing === undefined) {
    const { installationUid: installedUid } =
      yield* options.marketplace.installApp({
        appUid: ALGOLIA_CONTENTSTACK_APP_UID,
        stackApiKey: options.stackApiKey,
      });
    installationUid = installedUid;
    status = "installed";
  } else {
    installationUid = installationUidOf(existing);
    status = "updated";
  }
  if (installationUid === undefined || installationUid.length === 0) {
    return yield* contentAppError(
      "The Contentstack Algolia content search app installation has no installation UID",
      new Error("Missing installation UID")
    );
  }

  const installation = options.marketplace.installation(installationUid);
  yield* installation.setConfiguration(options.configuration);
  yield* installation.setServerConfig(options.serverConfiguration);

  return {
    environment: options.environment,
    indexName: options.indexName,
    installationUid,
    status,
  } satisfies InstalledContentSearchApp;
});

interface ContentSearchAppInstallationValue {
  readonly installOrUpdate: (
    options: InstallContentSearchAppOptions
  ) => Effect.Effect<
    InstalledContentSearchApp,
    ContentSearchAppInstallationError
  >;
}

export class ContentSearchAppInstallation extends Context.Service<
  ContentSearchAppInstallation,
  ContentSearchAppInstallationValue
>()("@repo/cms-contentstack/ContentSearchAppInstallation") {
  static readonly layerFrom = (value: ContentSearchAppInstallationValue) =>
    Layer.succeed(
      ContentSearchAppInstallation,
      ContentSearchAppInstallation.of(value)
    );
}

const marketplaceRegion = (input: string): Region | null | undefined => {
  switch (input.trim().toUpperCase()) {
    case "NA": {
      return undefined;
    }
    case "EU": {
      return contentstack.Region.EU;
    }
    case "AZURE_NA": {
      return contentstack.Region.AZURE_NA;
    }
    case "AZURE_EU": {
      return contentstack.Region.AZURE_EU;
    }
    case "GCP_NA": {
      return contentstack.Region.GCP_NA;
    }
    default: {
      return null;
    }
  }
};

interface ContentSearchAppInstallationConfigValue {
  readonly applicationId: string;
  readonly authtoken: Redacted.Redacted;
  readonly branch: string;
  readonly cdnBaseUrl: string;
  readonly contentWriteApiKey: Redacted.Redacted;
  readonly deliveryToken: Redacted.Redacted;
  readonly deliveryTokenName: string;
  readonly deliveryTokenUid: string;
  readonly environment: string;
  readonly orgUid: string;
  readonly region: Region | undefined;
  readonly stackApiKey: string;
}

export class ContentSearchAppInstallationConfig extends Context.Service<
  ContentSearchAppInstallationConfig,
  ContentSearchAppInstallationConfigValue
>()("@repo/cms-contentstack/ContentSearchAppInstallationConfig") {
  static readonly layer = Layer.effect(
    ContentSearchAppInstallationConfig,
    Effect.gen(function* () {
      const regionInput = yield* Config.String("CONTENTSTACK_REGION").pipe(
        Config.withDefault("NA")
      );
      const region = marketplaceRegion(regionInput);
      if (region === null) {
        return yield* contentAppError(
          "CONTENTSTACK_REGION must be one of NA, EU, AZURE_NA, AZURE_EU, or GCP_NA",
          new Error(`Unsupported CONTENTSTACK_REGION ${regionInput}`)
        );
      }
      const environment = yield* Config.NonEmptyString(
        "CONTENTSTACK_ENVIRONMENT"
      );
      const deliveryTokenName = yield* Config.String(
        "CONTENTSTACK_DELIVERY_TOKEN_NAME"
      ).pipe(Config.withDefault(environment));

      return ContentSearchAppInstallationConfig.of({
        applicationId: yield* Config.NonEmptyString("ALGOLIA_APPLICATION_ID"),
        authtoken: yield* Config.Redacted("CONTENTSTACK_AUTHTOKEN"),
        branch: yield* Config.String("CONTENTSTACK_BRANCH").pipe(
          Config.withDefault("main")
        ),
        cdnBaseUrl: yield* Config.String("CONTENTSTACK_CDN_BASE_URL").pipe(
          Config.withDefault(CONTENTSTACK_CDN_BASE_URL_DEFAULT)
        ),
        contentWriteApiKey: yield* Config.Redacted(
          "ALGOLIA_CONTENT_WRITE_API_KEY"
        ),
        deliveryToken: yield* Config.Redacted("CONTENTSTACK_DELIVERY_TOKEN"),
        deliveryTokenName,
        deliveryTokenUid: yield* Config.NonEmptyString(
          "CONTENTSTACK_DELIVERY_TOKEN_UID"
        ),
        environment,
        orgUid: yield* Config.NonEmptyString("CONTENTSTACK_ORG_UID"),
        region,
        stackApiKey: yield* Config.NonEmptyString("CONTENTSTACK_STACK_API_KEY"),
      });
    })
  );
}

type SdkMarketplace = ReturnType<ContentstackClient["marketplace"]>;

const liveMarketplace = (sdk: SdkMarketplace): ContentSearchAppMarketplace => ({
  installApp: ({ appUid, stackApiKey }) =>
    Effect.tryPromise({
      catch: (cause) =>
        contentAppError(
          "Could not install the Contentstack Algolia content search app",
          cause
        ),
      try: async () =>
        await sdk
          .app(appUid)
          .install({ targetType: "stack", targetUid: stackApiKey }),
    }).pipe(
      Effect.flatMap((installed) =>
        Schema.decodeEffect(InstalledContentAppResponse)(installed)
      ),
      Effect.flatMap((decoded) => {
        const installationUid = installationUidOf(decoded);
        return installationUid === undefined || installationUid.length === 0
          ? Effect.fail(
              contentAppError(
                "The Contentstack Algolia content search app installation returned no installation UID",
                new Error("Missing installation UID")
              )
            )
          : Effect.succeed({ installationUid });
      }),
      Effect.mapError((cause) =>
        Schema.is(ContentSearchAppInstallationError)(cause)
          ? cause
          : contentAppError(
              "The Contentstack Algolia content search app installation response is invalid",
              cause
            )
      )
    ),
  installation: (installationUid) => {
    const sdkInstallation = sdk.installation(installationUid);
    return {
      setConfiguration: (configuration) =>
        Effect.tryPromise({
          catch: (cause) =>
            contentAppError(
              "Could not configure the Contentstack Algolia content search app",
              cause
            ),
          try: async () => {
            await sdkInstallation.setConfiguration(configuration);
          },
        }),
      setServerConfig: (configuration) =>
        Effect.tryPromise({
          catch: (cause) =>
            contentAppError(
              "Could not configure the Contentstack Algolia content search app server configuration",
              cause
            ),
          try: async () => {
            await sdkInstallation.setServerConfig(configuration);
          },
        }),
    };
  },
  listInstallations: ({ stackApiKey }) =>
    Effect.tryPromise({
      catch: (cause) =>
        contentAppError(
          "Could not list Contentstack Marketplace installations",
          cause
        ),
      try: async () =>
        await sdk.installation().fetchAll({ stack_api_key: stackApiKey }),
    }).pipe(
      Effect.flatMap((collection) =>
        Schema.decodeEffect(MarketplaceInstallCollection)(collection)
      ),
      Effect.map((collection) => collection.items),
      Effect.mapError((cause) =>
        Schema.is(ContentSearchAppInstallationError)(cause)
          ? cause
          : contentAppError(
              "A Contentstack Marketplace installation listing is invalid",
              cause
            )
      )
    ),
});

const createMarketplaceClient = (
  config: ContentSearchAppInstallationConfigValue
): ContentSearchAppMarketplace => {
  const clientConfig: ContentstackConfig = {
    authtoken: Redacted.value(config.authtoken),
  };
  if (config.region !== undefined) {
    clientConfig.region = config.region;
  }
  return liveMarketplace(
    contentstack.client(clientConfig).marketplace(config.orgUid)
  );
};

/** Installs or updates the Contentstack Algolia content search app for a Content index. */
export const provisionContentSearchAppInstallation = Effect.fn(
  "ContentSearchAppInstallation.provision"
)(function* (options: ProvisionContentSearchAppOptions) {
  const installer = yield* ContentSearchAppInstallation;
  const config = yield* ContentSearchAppInstallationConfig;

  return yield* installer.installOrUpdate({
    configuration: contentSearchAppInstallationConfiguration({
      branch: config.branch,
      environment: config.environment,
    }),
    environment: config.environment,
    indexName: options.indexName,
    marketplace: createMarketplaceClient(config),
    serverConfiguration: contentSearchAppServerConfiguration({
      apiKey: Redacted.value(config.contentWriteApiKey),
      applicationId: config.applicationId,
      branch: config.branch,
      deliveryToken: {
        baseUrl: config.cdnBaseUrl,
        env: config.environment,
        name: config.deliveryTokenName,
        token: Redacted.value(config.deliveryToken),
        uid: config.deliveryTokenUid,
      },
      environment: config.environment,
      indexName: options.indexName,
    }),
    stackApiKey: config.stackApiKey,
  });
});

export interface ProvisionContentSearchAppOptions {
  readonly indexName: string;
}

export const createContentSearchAppInstallationLayer = <E, R>(
  configProvider: Effect.Effect<ConfigProvider.ConfigProvider, E, R>
) => {
  const configLayer = ContentSearchAppInstallationConfig.layer.pipe(
    Layer.provide(ConfigProvider.layer(configProvider))
  );
  const installationLayer = Layer.effect(
    ContentSearchAppInstallation,
    Effect.succeed(
      ContentSearchAppInstallation.of({
        installOrUpdate: (options) => installOrUpdateContentSearchApp(options),
      })
    )
  );

  return Layer.mergeAll(configLayer, installationLayer);
};
