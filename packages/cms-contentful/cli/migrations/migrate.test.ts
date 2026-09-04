import { ConfigProvider, Effect, Option, Redacted } from "effect";
import { describe, expect, it } from "vitest";

import { createStarterContentModel } from "../../migrations/starter-content-model";
import {
  ContentfulMigrationRunner,
  migrateContentfulStarterModel,
  resolveContentfulMigrationTarget,
} from "./migrate";
import { ContentfulMigrationTarget } from "./model";

describe(resolveContentfulMigrationTarget, () => {
  it("reads space, environment, and management token from config", async () => {
    const target = await resolveContentfulMigrationTarget({
      environmentId: Option.none(),
      managementToken: Option.none(),
      spaceId: Option.none(),
    }).pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            CONTENTFUL_ENVIRONMENT: "preview",
            CONTENTFUL_MANAGEMENT_TOKEN: "management-token",
            CONTENTFUL_SPACE_ID: "space-id",
          })
        )
      ),
      Effect.runPromise
    );

    expect(target.spaceId).toBe("space-id");
    expect(target.environmentId).toBe("preview");
    expect(Redacted.value(target.accessToken)).toBe("management-token");
  });

  it("defaults the environment to master when it is unset", async () => {
    const target = await resolveContentfulMigrationTarget({
      environmentId: Option.none(),
      managementToken: Option.none(),
      spaceId: Option.none(),
    }).pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            CONTENTFUL_MANAGEMENT_TOKEN: "management-token",
            CONTENTFUL_SPACE_ID: "space-id",
          })
        )
      ),
      Effect.runPromise
    );

    expect(target.environmentId).toBe("master");
  });

  it("prefers explicit flags over environment variables", async () => {
    const target = await resolveContentfulMigrationTarget({
      environmentId: Option.some("flag-env"),
      managementToken: Option.some("flag-token"),
      spaceId: Option.some("flag-space"),
    }).pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            CONTENTFUL_ENVIRONMENT: "preview",
            CONTENTFUL_MANAGEMENT_TOKEN: "management-token",
            CONTENTFUL_SPACE_ID: "space-id",
          })
        )
      ),
      Effect.runPromise
    );

    expect(target.spaceId).toBe("flag-space");
    expect(target.environmentId).toBe("flag-env");
    expect(Redacted.value(target.accessToken)).toBe("flag-token");
  });
});

describe(migrateContentfulStarterModel, () => {
  it("runs the starter migration without calling Contentful", async () => {
    const runs: {
      readonly accessToken?: string;
      readonly environmentId?: string;
      readonly migrationFunction?: typeof createStarterContentModel;
      readonly spaceId?: string;
      readonly yes?: boolean;
    }[] = [];

    await migrateContentfulStarterModel(
      new ContentfulMigrationTarget({
        accessToken: Redacted.make("management-token"),
        environmentId: "master",
        spaceId: "space-id",
      })
    ).pipe(
      Effect.provide(
        ContentfulMigrationRunner.layerFrom(async (config) => {
          runs.push({
            accessToken: config.accessToken,
            environmentId: config.environmentId,
            migrationFunction:
              "migrationFunction" in config
                ? config.migrationFunction
                : undefined,
            spaceId: config.spaceId,
            yes: config.yes,
          });
          await Promise.resolve();
        })
      ),
      Effect.runPromise
    );

    expect(runs).toEqual([
      {
        accessToken: "management-token",
        environmentId: "master",
        migrationFunction: createStarterContentModel,
        spaceId: "space-id",
        yes: true,
      },
    ]);
  });
});
