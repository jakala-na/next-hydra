import {
  SentryEffectLogger,
  SentryEffectMetricsLayer,
  SentryEffectTracer,
} from "@sentry/effect/server";
import { mergeAll, succeed } from "effect/Layer";
import {
  formatSimple,
  layer as loggerLayer,
  withLeveledConsole,
} from "effect/Logger";
import { Tracer } from "effect/Tracer";

export const sentryEffectTelemetryLayer = mergeAll(
  succeed(Tracer, SentryEffectTracer),
  loggerLayer([withLeveledConsole(formatSimple), SentryEffectLogger]),
  SentryEffectMetricsLayer
);
