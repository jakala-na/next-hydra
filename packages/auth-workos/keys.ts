import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const MIN_COOKIE_PASSWORD_LENGTH = 32;

export const keys = () =>
  createEnv({
    client: {
      NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.string().url(),
    },
    runtimeEnv: {
      NEXT_PUBLIC_WORKOS_REDIRECT_URI:
        process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
      WORKOS_API_KEY: process.env.WORKOS_API_KEY,
      WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID,
      WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD,
    },
    server: {
      WORKOS_API_KEY: z.string().startsWith("sk_"),
      WORKOS_CLIENT_ID: z.string().startsWith("client_"),
      WORKOS_COOKIE_PASSWORD: z.string().min(MIN_COOKIE_PASSWORD_LENGTH),
    },
  });

export const webhookKeys = () =>
  createEnv({
    client: {},
    runtimeEnv: {
      WORKOS_WEBHOOK_SECRET: process.env.WORKOS_WEBHOOK_SECRET,
    },
    server: {
      WORKOS_WEBHOOK_SECRET: z.string().min(1),
    },
  });
