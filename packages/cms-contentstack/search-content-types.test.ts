import { ConfigProvider, Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  contentSearchAppInstallationConfiguration,
  contentSearchAppServerConfiguration,
  installOrUpdateContentSearchApp,
} from "./cli/content-search-app/installation";
import { landingPageSearchType } from "./recipe/search/landing-page";
import { resolveSearchContentTypes } from "./recipe/search/types";
import type { SearchContentType } from "./recipe/search/types";
import { createContentstackSearch } from "./search-provider";

const product: SearchContentType = {
  uid: "product_editorial",
  label: "Product editorial",
  searchTextRoot: "product_editorials",
  mappingFields: ["name", "description"],
  instructions: [],
};
const contentTypes = resolveSearchContentTypes([
  landingPageSearchType,
  product,
]);

describe("recipe-owned searchable content", () => {
  it("uses a contributed type for CLI index settings, runtime restrictions, app mappings and instructions", async () => {
    const search = createContentstackSearch(contentTypes);
    const projection = await search
      .loadContentSearchProjection(
        "preview--content",
        Effect.succeed(
          ConfigProvider.fromUnknown({
            CONTENTSTACK_BRANCH: "catalog",
            CONTENTSTACK_ENVIRONMENT: "preview",
          })
        )
      )
      .pipe(Effect.runPromise);
    expect(projection.searchableAttributes(["fr-CA"])).toContainEqual({
      attribute: "product_editorials.catalog.fr-CA",
      ordered: true,
    });
    expect(
      projection.restrictSearchableAttributes?.({ locale: "fr-CA" })
    ).toContain("product_editorials.catalog.fr-CA");
    const configuration = contentSearchAppInstallationConfiguration({
      branch: "catalog",
      environment: "preview",
      contentTypes,
    });
    expect(configuration.scopedMappings).toContainEqual({
      ct_uid: "product_editorial",
      fields: ["name", "description"],
      branches: ["catalog"],
      environments: ["preview"],
    });
    const tasks = search.createContentIndexingHandoff("preview--content").tasks;
    expect(
      tasks.find(
        ({ id }) => id === "cms.contentstack.mapping.product_editorial"
      )
    ).toMatchObject({
      title: "Configure content mappings: Product editorial",
      detail: expect.stringContaining("product_editorials"),
    });
    expect(
      tasks.filter(({ id }) => id === "cms.contentstack.initial-sync")
    ).toHaveLength(1);
    expect(
      tasks.find(({ id }) => id === "cms.contentstack.verify-records")?.detail
    ).toContain("Product editorial (product_editorial)");
  });

  it("retains an unapplied type's mapping task when the app receipt covers only another type", async () => {
    const configuration = contentSearchAppInstallationConfiguration({
      branch: "main",
      environment: "production",
      contentTypes: [landingPageSearchType],
    });
    const receipt = await installOrUpdateContentSearchApp({
      configuration,
      environment: "production",
      indexName: "content",
      stackApiKey: "test-stack",
      serverConfiguration: contentSearchAppServerConfiguration({
        apiKey: "test-key",
        applicationId: "test-app",
        branch: "main",
        deliveryToken: {
          baseUrl: "https://cdn.example.test",
          env: "production",
          name: "Test",
          token: "test-token",
          uid: "test-token-id",
        },
        environment: "production",
        indexName: "content",
      }),
      marketplace: {
        listInstallations: () => Effect.succeed([]),
        installApp: () => Effect.succeed({ installationUid: "test-install" }),
        installation: () => ({
          setConfiguration: () => Effect.void,
          setServerConfig: () => Effect.void,
        }),
      },
    }).pipe(Effect.runPromise);
    const tasks = createContentstackSearch(
      contentTypes
    ).createContentIndexingHandoff("content", {
      appInstalled: true,
      configuredMappings: receipt.configuredMappings,
    }).tasks;
    const ids = tasks.map(({ id }) => id);
    expect(ids).not.toContain("cms.contentstack.mapping.landing_page");
    expect(ids).toContain("cms.contentstack.mapping.product_editorial");
    expect(ids).toContain("cms.contentstack.verify-records");
    expect(
      ids.filter((id) => id === "cms.contentstack.initial-sync")
    ).toHaveLength(1);
  });

  it("does not accept partial field coverage as a completed mapping", () => {
    const tasks = createContentstackSearch([
      product,
    ]).createContentIndexingHandoff("content", {
      appInstalled: true,
      configuredMappings: [{ contentTypeUid: product.uid, fields: ["name"] }],
    }).tasks;
    expect(tasks.map(({ id }) => id)).toContain(
      "cms.contentstack.mapping.product_editorial"
    );
  });

  it("rejects duplicate type definitions and orphaned recipe extensions", () => {
    expect(() => resolveSearchContentTypes([product, product])).toThrow(
      /Duplicate/
    );
    expect(() =>
      resolveSearchContentTypes([
        { extend: "missing", instructions: ["Publish"] },
      ])
    ).toThrow(/missing content type/);
  });
});
