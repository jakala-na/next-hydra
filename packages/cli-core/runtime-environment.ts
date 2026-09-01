import { Effect, Layer } from "effect";

import { localRuntimeEnvironmentStoreLayer } from "./runtime-environment-local";
import {
  LocalRuntimeEnvironmentStore,
  RuntimeEnvironmentPublisher,
  VercelRuntimeEnvironmentStore,
} from "./runtime-environment-model";
import { validateRuntimeEnvironmentManifest } from "./runtime-environment-support";
import { vercelRuntimeEnvironmentStoreLayer } from "./runtime-environment-vercel";

export * from "./runtime-environment-model";

export const runtimeEnvironmentPublisherLayer = Layer.effect(
  RuntimeEnvironmentPublisher,
  Effect.gen(function* () {
    const local = yield* LocalRuntimeEnvironmentStore;
    const vercel = yield* VercelRuntimeEnvironmentStore;
    const publish: RuntimeEnvironmentPublisher["Service"]["publish"] =
      Effect.fn("RuntimeEnvironmentPublisher.publish")(
        function* (prepared, values) {
          if (prepared.destination === "local") {
            return yield* local.publish(prepared, values);
          }
          return yield* vercel.publish(prepared, values);
        }
      );

    return RuntimeEnvironmentPublisher.of({
      prepare: Effect.fn("RuntimeEnvironmentPublisher.prepare")(function* ({
        destination,
        manifest,
      }) {
        yield* validateRuntimeEnvironmentManifest(
          manifest,
          destination.destination
        );
        return destination.destination === "local"
          ? yield* local.prepare(destination, manifest)
          : yield* vercel.prepare(destination, manifest);
      }),
      publish,
    });
  })
).pipe(
  Layer.provideMerge(localRuntimeEnvironmentStoreLayer),
  Layer.provideMerge(vercelRuntimeEnvironmentStoreLayer)
);
