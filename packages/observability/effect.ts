import * as Sentry from "@sentry/effect/server";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Tracer from "effect/Tracer";

export const sentryEffectTelemetryLayer = Layer.mergeAll(
  Layer.succeed(Tracer.Tracer, Sentry.SentryEffectTracer),
  Logger.layer([Sentry.SentryEffectLogger]),
  Sentry.SentryEffectMetricsLayer
);
