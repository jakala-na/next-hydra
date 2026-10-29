import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Redacted, Schema } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, beforeEach, vi } from "vitest";

import { CommercetoolsProjectAdministration } from "./administration";
import {
  projectAdministrationLayer,
  runtimeClientCreationError,
} from "./administration-live";
import { BootstrapCommercetoolsConfig } from "./bootstrap-config";
import {
  ApiClientId,
  CommercetoolsRegion,
  ProjectKey,
  ProjectAdministrationError,
  RuntimeClientCreationOutcomeUnknown,
} from "./model";

const readProject = vi.fn<() => Response>();
const SearchIndexingUpdate = Schema.Struct({
  actions: Schema.Array(
    Schema.Struct({
      action: Schema.Literal("changeProductSearchIndexingEnabled"),
      enabled: Schema.Boolean,
      mode: Schema.Literal("ProductsSearch"),
    })
  ),
  version: Schema.Int,
});
type SearchIndexingUpdate = typeof SearchIndexingUpdate.Type;
const updateProject = vi.fn<(body: SearchIndexingUpdate) => Response>();
const bootstrapLayer = Layer.succeed(
  BootstrapCommercetoolsConfig,
  BootstrapCommercetoolsConfig.of({
    apiUrl: "https://api.example.test",
    authUrl: "https://auth.example.test",
    clientId: ApiClientId.make("bootstrap-client"),
    clientSecret: Redacted.make("bootstrap-secret"),
    projectKey: ProjectKey.make("project-key"),
    region: CommercetoolsRegion.make("us-central1.gcp"),
    scopes: ["manage_project_settings:project-key"],
  })
);

const prepareProject = CommercetoolsProjectAdministration.pipe(
  Effect.flatMap((service) => service.prepareProject),
  Effect.provide(projectAdministrationLayer.pipe(Layer.provide(bootstrapLayer)))
);

const activatedProject = () =>
  Response.json({
    searchIndexing: { productsSearch: { status: "Activated" } },
    version: 8,
  });

const indexingProject = () =>
  Response.json({
    searchIndexing: {
      products: { status: "Activated" },
      productsSearch: { status: "Indexing" },
    },
    version: 7,
  });

describe("Product Search project preparation", () => {
  beforeEach(() => {
    readProject.mockReset();
    updateProject.mockReset().mockImplementation(activatedProject);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => {
        const request = new Request(input, init);
        const { url, method } = request;
        if (url === "https://auth.example.test/oauth/token") {
          return Response.json({
            access_token: "test-token",
            expires_in: 3600,
            token_type: "Bearer",
          });
        }
        if (url === "https://api.example.test/project-key") {
          if (method === "POST") {
            return updateProject(
              Schema.decodeSync(Schema.fromJsonString(SearchIndexingUpdate))(
                await request.text()
              )
            );
          }
          return readProject();
        }
        throw new Error(`Unexpected administration request: ${url}`);
      })
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    { version: 7 },
    { searchIndexing: { products: { status: "Activated" } }, version: 7 },
    {
      searchIndexing: { productsSearch: { status: "Deactivated" } },
      version: 7,
    },
  ])("activates the new index from project state %j", async (project) => {
    readProject
      .mockReturnValueOnce(Response.json(project))
      .mockImplementation(activatedProject);
    const result = await prepareProject.pipe(Effect.runPromise);
    expect(result).toMatchObject({
      projectKey: "project-key",
      searchIndexingStatus: "Activated",
    });
    expect(updateProject).toHaveBeenCalledExactlyOnceWith({
      actions: [
        {
          action: "changeProductSearchIndexingEnabled",
          enabled: true,
          mode: "ProductsSearch",
        },
      ],
      version: 7,
    });
  });

  it.effect("reuses an already active Product Search index", () =>
    Effect.gen(function* () {
      readProject.mockImplementation(activatedProject);
      const result = yield* prepareProject;
      expect(result.searchIndexingStatus).toBe("Activated");
      expect(updateProject).not.toHaveBeenCalled();
    })
  );

  it.effect("waits for indexing to finish without restarting activation", () =>
    Effect.gen(function* () {
      readProject
        .mockImplementationOnce(indexingProject)
        .mockImplementationOnce(indexingProject)
        .mockImplementation(activatedProject);
      const fiber = yield* prepareProject.pipe(Effect.forkChild);
      yield* TestClock.adjust("2 seconds");
      const result = yield* Fiber.join(fiber);
      expect(result.searchIndexingStatus).toBe("Activated");
      expect(updateProject).not.toHaveBeenCalled();
    })
  );

  it.effect("reports the new index status when activation times out", () =>
    Effect.gen(function* () {
      readProject.mockImplementation(indexingProject);
      const fiber = yield* prepareProject.pipe(Effect.flip, Effect.forkChild);
      yield* TestClock.adjust("2 minutes");
      const error = yield* Fiber.join(fiber);
      expect(error).toMatchObject({
        _tag: "ProductSearchTimeout",
        lastStatus: "Indexing",
        message: "Product Search did not activate in time",
      });
      expect(updateProject).not.toHaveBeenCalled();
    })
  );

  it.effect(
    "preserves a project version conflict as an activation failure",
    () =>
      Effect.gen(function* () {
        readProject.mockReturnValue(Response.json({ version: 7 }));
        updateProject.mockReturnValue(
          Response.json(
            {
              errors: [{ code: "ConcurrentModification", currentVersion: 8 }],
              message: "Project version changed",
              statusCode: 409,
            },
            { status: 409 }
          )
        );
        const error = yield* prepareProject.pipe(Effect.flip);
        expect(error).toMatchObject({
          _tag: "ProjectAdministrationError",
          cause: { statusCode: 409 },
          operation: "enableProductSearch",
        });
      })
  );
});

describe(runtimeClientCreationError, () => {
  it("treats a provider rejection as a confirmed creation failure", () => {
    const cause = Object.assign(new Error("insufficient scope"), {
      code: "insufficient_scope",
      statusCode: 403,
    });

    const error = runtimeClientCreationError(cause, "Runtime");

    expect(error).toBeInstanceOf(ProjectAdministrationError);
    expect(error).toMatchObject({
      cause,
      message: 'Commercetools rejected runtime API Client "Runtime"',
      operation: "createRuntimeClient",
    });
  });

  it("preserves the warning when the provider outcome is unknown", () => {
    const cause = new Error("fetch failed");

    const error = runtimeClientCreationError(cause, "Runtime");

    expect(error).toBeInstanceOf(RuntimeClientCreationOutcomeUnknown);
    expect(error).toMatchObject({
      cause,
      clientName: "Runtime",
      message: "The runtime API Client creation outcome could not be confirmed",
    });
  });
});
