import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional()
);

const editorOrigin = z
  .string()
  .url()
  .regex(/^https?:\/\/[a-z0-9.-]+(?::[0-9]+)?\/?$/iu);

export function keys() {
  return createEnv({
    client: {},
    // Canvas distinguishes an empty editor allowlist from an unset override.
    // Optional endpoint schemas handle their own empty values instead.
    runtimeEnv: {
      CANVAS_EDITOR_ORIGINS: process.env.CANVAS_EDITOR_ORIGINS,
      CANVAS_JSONAPI_PREFIX: process.env.CANVAS_JSONAPI_PREFIX,
      CANVAS_SITE_URL: process.env.CANVAS_SITE_URL,
      DRUPAL_AUTH_URI: process.env.DRUPAL_AUTH_URI,
      DRUPAL_BASE_URL: process.env.DRUPAL_BASE_URL,
      DRUPAL_GRAPHQL_URI: process.env.DRUPAL_GRAPHQL_URI,
      DRUPAL_PREVIEWER_CLIENT_ID: process.env.DRUPAL_PREVIEWER_CLIENT_ID,
      DRUPAL_PREVIEWER_CLIENT_SECRET:
        process.env.DRUPAL_PREVIEWER_CLIENT_SECRET,
      DRUPAL_VIEWER_CLIENT_ID: process.env.DRUPAL_VIEWER_CLIENT_ID,
      DRUPAL_VIEWER_CLIENT_SECRET: process.env.DRUPAL_VIEWER_CLIENT_SECRET,
    },
    server: {
      CANVAS_EDITOR_ORIGINS: z
        .string()
        .refine(
          (value) =>
            value
              .split(/[\s,]+/u)
              .filter(Boolean)
              .every((origin) => editorOrigin.safeParse(origin).success),
          "CANVAS_EDITOR_ORIGINS must contain exact HTTP(S) origins without paths or wildcards"
        )
        .optional(),
      CANVAS_JSONAPI_PREFIX: z
        .string()
        .regex(
          /^\/?(?:[a-z0-9_-]+\/)*[a-z0-9_-]*\/?$/iu,
          "CANVAS_JSONAPI_PREFIX must be a relative API path, such as jsonapi or /api/jsonapi"
        )
        .optional(),
      CANVAS_SITE_URL: optionalUrl,
      DRUPAL_AUTH_URI: optionalUrl,
      DRUPAL_BASE_URL: z.string().url(),
      DRUPAL_GRAPHQL_URI: optionalUrl,
      DRUPAL_PREVIEWER_CLIENT_ID: z.string().min(1),
      DRUPAL_PREVIEWER_CLIENT_SECRET: z.string().min(1),
      DRUPAL_VIEWER_CLIENT_ID: z.string().min(1),
      DRUPAL_VIEWER_CLIENT_SECRET: z.string().min(1),
    },
  });
}

export type DrupalKeys = ReturnType<typeof keys>;

export function getDrupalAuthUri(config: DrupalKeys): string {
  return (
    config.DRUPAL_AUTH_URI ??
    new URL("/oauth/token", config.DRUPAL_BASE_URL).toString()
  );
}

export function getDrupalGraphqlUri(config: DrupalKeys): string {
  return (
    config.DRUPAL_GRAPHQL_URI ??
    new URL("/graphql", config.DRUPAL_BASE_URL).toString()
  );
}
