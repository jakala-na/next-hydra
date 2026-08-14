import { HttpRouter } from "effect/unstable/http";
import { HttpApiScalar } from "effect/unstable/httpapi";
import { ApplicationHttpApi } from "./openapi";

export const { handler: applicationApiDocsHandler } = HttpRouter.toWebHandler(
  HttpApiScalar.layer(ApplicationHttpApi, {
    path: "/docs",
    scalar: {
      showOperationId: true,
    },
  }),
  { disableLogger: true }
);
