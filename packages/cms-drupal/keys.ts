import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export function keys() {
  return createEnv({
    client: {},
    emptyStringAsUndefined: true,
    runtimeEnv: {
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
      CANVAS_SITE_URL: z.string().url().optional(),
      DRUPAL_AUTH_URI: z.string().url().optional(),
      DRUPAL_BASE_URL: z.string().url(),
      DRUPAL_GRAPHQL_URI: z.string().url().optional(),
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
