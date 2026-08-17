import { Effect, Layer } from "effect";
import { HttpApiMiddleware } from "effect/unstable/httpapi";

import { definePublicError } from "./index";

const UnexpectedDefinition = definePublicError({
  category: "unexpected",
  code: "unexpected",
  fields: {},
  recovery: "none",
  status: 500,
  tag: "Unexpected",
});

/** Safe HTTP-only projection for defects that escape an endpoint program. */
export const Unexpected = UnexpectedDefinition.schema;
export type Unexpected = typeof Unexpected.Type;

export const makeUnexpected = () =>
  UnexpectedDefinition.make({
    message: "Something went wrong.",
  });

/**
 * Declares the terminal defect boundary once on an HttpApi graph. Expected
 * failures remain in E and therefore pass through this middleware unchanged.
 */
export class UnexpectedHttpErrors extends HttpApiMiddleware.Service<UnexpectedHttpErrors>()(
  "@repo/errors/http/UnexpectedHttpErrors",
  { error: Unexpected }
) {}

export const unexpectedHttpErrorsLayer = Layer.succeed(
  UnexpectedHttpErrors,
  UnexpectedHttpErrors.of((httpEffect, { endpoint, group }) =>
    httpEffect.pipe(
      Effect.catchDefect((defect) =>
        Effect.logError("Unexpected HTTP API defect", defect).pipe(
          Effect.annotateLogs({
            "http.api.group": group.identifier,
            "http.api.operation": endpoint.name,
            "http.error.tag": "Unexpected",
          }),
          Effect.andThen(Effect.fail(makeUnexpected()))
        )
      )
    )
  )
);
