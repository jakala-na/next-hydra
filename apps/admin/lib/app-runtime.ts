import "server-only";
import { sentryEffectTelemetryLayer } from "@repo/observability/effect";
import { Layer, ManagedRuntime } from "effect";

import { currentAuthLayer } from "./current-auth";
import { nextServerLayer } from "./next-server";

const appLayer = Layer.mergeAll(
  currentAuthLayer,
  nextServerLayer,
  sentryEffectTelemetryLayer
);

export const AppRuntime = ManagedRuntime.make(appLayer);
