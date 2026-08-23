import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { PrivateDotEnvFileError } from "@repo/cli-core/private-dotenv";
import { Effect, FileSystem, Layer, Path, Redacted, Schema } from "effect";

import { ContentstackApiKey, ContentstackRuntimeCredentials } from "./model";
import { ContentstackRuntimeCredentialHandoff } from "./runtime-credentials";
import { contentstackRuntimeCredentialHandoffLayer } from "./runtime-credentials-live";

const credentials = new ContentstackRuntimeCredentials({
  apiKey: ContentstackApiKey.make("blt-api-key"),
  deliveryToken: Redacted.make("cs-delivery"),
  environment: "development",
  graphqlHost: "graphql.contentstack.com",
  graphqlPreviewHost: "graphql-preview.contentstack.com",
  previewToken: Redacted.make("cs-preview"),
  region: "NA",
  webhookSecret: Redacted.make("webhook-secret"),
});

const TestLayer = contentstackRuntimeCredentialHandoffLayer.pipe(
  Layer.provideMerge(NodeServices.layer)
);

describe("Contentstack runtime credential handoff", () => {
  it.effect(
    "writes private runtime credentials without management access",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem.FileSystem;
          const handoff = yield* ContentstackRuntimeCredentialHandoff;
          const path = yield* Path.Path;
          const directory = yield* fileSystem.makeTempDirectoryScoped({
            prefix: "next-hydra-contentstack-credentials-",
          });
          const destination = path.join(directory, "runtime.env");

          const receipt = yield* handoff.save(credentials, destination);
          const contents = yield* fileSystem.readFileString(destination);
          const info = yield* fileSystem.stat(destination);

          expect({
            apiKey: contents.includes('CONTENTSTACK_API_KEY="blt-api-key"'),
            hosts: contents.includes(
              'CONTENTSTACK_GRAPHQL_HOST_NAME="graphql.contentstack.com"'
            ),
            managementAccess: contents.includes("MANAGEMENT"),
            region: contents.includes('CONTENTSTACK_REGION="NA"'),
            tokens:
              /CONTENTSTACK_DELIVERY_TOKEN="cs-delivery"[\s\S]*CONTENTSTACK_PREVIEW_TOKEN="cs-preview"/u.test(
                contents
              ),
            webhook: contents.includes(
              'CONTENTSTACK_WEBHOOK_SECRET="webhook-secret"'
            ),
          }).toStrictEqual({
            apiKey: true,
            hosts: true,
            managementAccess: false,
            region: true,
            tokens: true,
            webhook: true,
          });
          expect(info.mode % 0o1000).toBe(0o600);
          expect(receipt).toMatchObject({ mode: 0o600, path: destination });
        }).pipe(Effect.provide(TestLayer))
      )
  );

  it.effect("refuses to overwrite an existing file", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const handoff = yield* ContentstackRuntimeCredentialHandoff;
        const path = yield* Path.Path;
        const directory = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "next-hydra-contentstack-credentials-",
        });
        const destination = path.join(directory, "runtime.env");
        yield* fileSystem.writeFileString(destination, "keep-me");

        const error = yield* handoff
          .save(credentials, destination)
          .pipe(Effect.flip);

        expect(Schema.is(PrivateDotEnvFileError)(error)).toBeTruthy();
        expect(error.cause).toBeDefined();
        expect(yield* fileSystem.readFileString(destination)).toBe("keep-me");
      }).pipe(Effect.provide(TestLayer))
    )
  );
});
