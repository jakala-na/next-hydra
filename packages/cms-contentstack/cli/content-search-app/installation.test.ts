import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  ALGOLIA_CONTENTSTACK_APP_UID,
  ContentSearchAppInstallation,
  contentSearchAppInstallationConfiguration,
  contentSearchAppServerConfiguration,
  installOrUpdateContentSearchApp,
  isAlgoliaContentSearchAppInstall,
} from "./installation";
import type {
  ContentSearchAppMarketplace,
  InstallContentSearchAppOptions,
} from "./installation";
import { ContentSearchAppInstallationError } from "./model";

const configuration = contentSearchAppInstallationConfiguration({
  branch: "main",
  environment: "production",
});

const serverConfiguration = contentSearchAppServerConfiguration({
  apiKey: "content-write-key",
  applicationId: "application-id",
  branch: "main",
  deliveryToken: {
    baseUrl: "https://cdn.contentstack.io",
    env: "production",
    name: "Production",
    token: "delivery-token",
    uid: "delivery-token-uid",
  },
  environment: "production",
  indexName: "acceptance--content",
});

interface RecordedMarketplaceCalls {
  readonly installInputs: {
    readonly appUid: string;
    readonly stackApiKey: string;
  }[];
  readonly setConfigurationInputs: (typeof configuration)[];
  readonly setServerConfigInputs: (typeof serverConfiguration)[];
}

type MarketplaceInstallItemInput = Parameters<
  typeof isAlgoliaContentSearchAppInstall
>[0];

const recordedMarketplace = (
  items: readonly MarketplaceInstallItemInput[],
  installedUid = "installation-id"
) => {
  const calls: RecordedMarketplaceCalls = {
    installInputs: [],
    setConfigurationInputs: [],
    setServerConfigInputs: [],
  };
  const marketplace: ContentSearchAppMarketplace = {
    installApp: (input) => {
      calls.installInputs.push(input);
      return Effect.succeed({ installationUid: installedUid });
    },
    installation: () => ({
      setConfiguration: (input) => {
        calls.setConfigurationInputs.push(input);
        return Effect.void;
      },
      setServerConfig: (input) => {
        calls.setServerConfigInputs.push(input);
        return Effect.void;
      },
    }),
    listInstallations: () => Effect.succeed(items),
  };
  return { calls, marketplace };
};

const baseOptions = (
  marketplace: ContentSearchAppMarketplace
): InstallContentSearchAppOptions => ({
  configuration,
  environment: "production",
  indexName: "acceptance--content",
  marketplace,
  serverConfiguration,
  stackApiKey: "stack-api-key",
});

describe(contentSearchAppInstallationConfiguration, () => {
  // The literal below is the Contentstack provider contract, mirrored from the
  // exported Algolia app installation (app 61c0805c1ecff10018907bf6).
  it("matches the exported installation configuration shape", () => {
    expect(configuration).toEqual({
      additionalSettings: false,
      checkValue: false,
      custom_config: {},
      defaultEnv: { label: "production", value: "production" },
      envs: ["production"],
      includeAssets: false,
      scopedMappings: [
        {
          branches: ["main"],
          ct_uid: "landing_page",
          environments: ["production"],
          fields: ["display_title", "url"],
        },
      ],
    });
  });
});

describe(contentSearchAppServerConfiguration, () => {
  // The literal below is the Contentstack provider contract, mirrored from the
  // exported per-environment server configuration.
  it("matches the exported per-environment server configuration shape", () => {
    expect(serverConfiguration).toEqual({
      production: {
        apiKey: "content-write-key",
        applicationId: "application-id",
        branches: ["main"],
        deliveryToken: {
          baseUrl: "https://cdn.contentstack.io",
          branches: ["main"],
          env: "production",
          name: "Production",
          token: "delivery-token",
          uid: "delivery-token-uid",
        },
        indexName: "acceptance--content",
      },
    });
  });
});

describe(isAlgoliaContentSearchAppInstall, () => {
  it("matches by app UID or manifest UID", () => {
    expect(
      isAlgoliaContentSearchAppInstall({
        app_uid: ALGOLIA_CONTENTSTACK_APP_UID,
      })
    ).toBeTruthy();
    expect(
      isAlgoliaContentSearchAppInstall({
        manifest_uid: ALGOLIA_CONTENTSTACK_APP_UID,
      })
    ).toBeTruthy();
    expect(
      isAlgoliaContentSearchAppInstall({ app_uid: "other-app" })
    ).toBeFalsy();
  });

  it("falls back to the install name when the listing omits the app UID", () => {
    expect(
      isAlgoliaContentSearchAppInstall({
        installation_uid: "installation-id",
        name: "Algolia",
      })
    ).toBeTruthy();
    expect(
      isAlgoliaContentSearchAppInstall({
        installation_uid: "installation-id",
        name: "Other",
      })
    ).toBeFalsy();
  });
});

describe(installOrUpdateContentSearchApp, () => {
  it("installs and configures the app when no install exists", async () => {
    const { calls, marketplace } = recordedMarketplace([]);

    const result = await installOrUpdateContentSearchApp(
      baseOptions(marketplace)
    ).pipe(Effect.runPromise);

    expect(result).toEqual({
      environment: "production",
      indexName: "acceptance--content",
      installationUid: "installation-id",
      status: "installed",
    });
    expect(calls.installInputs).toEqual([
      { appUid: ALGOLIA_CONTENTSTACK_APP_UID, stackApiKey: "stack-api-key" },
    ]);
    expect(calls.setConfigurationInputs).toEqual([configuration]);
    expect(calls.setServerConfigInputs).toEqual([serverConfiguration]);
  });

  it("updates the existing install without reinstalling", async () => {
    const { calls, marketplace } = recordedMarketplace([
      { name: "Other", uid: "other-installation-id" },
      { installation_uid: "installation-id", name: "Algolia" },
    ]);

    const result = await installOrUpdateContentSearchApp(
      baseOptions(marketplace)
    ).pipe(Effect.runPromise);

    expect(result).toEqual({
      environment: "production",
      indexName: "acceptance--content",
      installationUid: "installation-id",
      status: "updated",
    });
    expect(calls.installInputs).toEqual([]);
    expect(calls.setConfigurationInputs).toEqual([configuration]);
    expect(calls.setServerConfigInputs).toEqual([serverConfiguration]);
  });

  it("fails when the install response carries no installation UID", async () => {
    const { marketplace } = recordedMarketplace([], "");

    const failure = await installOrUpdateContentSearchApp(
      baseOptions(marketplace)
    ).pipe(Effect.flip, Effect.runPromise);

    expect(failure).toBeInstanceOf(ContentSearchAppInstallationError);
    expect(failure.operation).toBe("content search app installation");
  });

  it("maps listing failures to a provisioning error", async () => {
    const marketplace: ContentSearchAppMarketplace = {
      installApp: () => Effect.succeed({ installationUid: "installation-id" }),
      installation: () => ({
        setConfiguration: () => Effect.void,
        setServerConfig: () => Effect.void,
      }),
      listInstallations: () =>
        Effect.fail(
          new ContentSearchAppInstallationError({
            cause: new Error("Marketplace is down"),
            message: "Could not list Contentstack Marketplace installations",
            operation: "content search app installation",
          })
        ),
    };

    const failure = await installOrUpdateContentSearchApp(
      baseOptions(marketplace)
    ).pipe(Effect.flip, Effect.runPromise);

    expect(failure).toBeInstanceOf(ContentSearchAppInstallationError);
    expect(failure.operation).toBe("content search app installation");
  });

  it("runs the real orchestration through the service layer", async () => {
    const { calls, marketplace } = recordedMarketplace([]);

    const result = await Effect.gen(function* () {
      const installation = yield* ContentSearchAppInstallation;
      return yield* installation.installOrUpdate(baseOptions(marketplace));
    }).pipe(
      Effect.provide(
        ContentSearchAppInstallation.layerFrom({
          installOrUpdate: (options) =>
            installOrUpdateContentSearchApp(options),
        })
      ),
      Effect.runPromise
    );

    expect(result).toEqual({
      environment: "production",
      indexName: "acceptance--content",
      installationUid: "installation-id",
      status: "installed",
    });
    expect(calls.installInputs).toEqual([
      { appUid: ALGOLIA_CONTENTSTACK_APP_UID, stackApiKey: "stack-api-key" },
    ]);
    expect(calls.setConfigurationInputs).toEqual([configuration]);
    expect(calls.setServerConfigInputs).toEqual([serverConfiguration]);
  });
});
