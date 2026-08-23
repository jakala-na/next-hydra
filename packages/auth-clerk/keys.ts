import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    client: {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
      NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z
        .string()
        .startsWith("/"),
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().startsWith("/"),
      NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z
        .string()
        .startsWith("/")
        .optional(),
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().startsWith("/").optional(),
    },
    runtimeEnv: {
      CLERK_AUTHORIZED_PARTIES: process.env.CLERK_AUTHORIZED_PARTIES,
      CLERK_JWT_KEY: process.env.CLERK_JWT_KEY,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
        process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
      NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
        process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    },
    server: {
      CLERK_AUTHORIZED_PARTIES: z
        .string()
        .refine(
          (value) =>
            value
              .split(",")
              .some((authorizedParty) => authorizedParty.trim().length > 0),
          "CLERK_AUTHORIZED_PARTIES must contain at least one application origin"
        ),
      CLERK_JWT_KEY: z.string().optional(),
      CLERK_SECRET_KEY: z.string().startsWith("sk_"),
    },
  });

export const webhookKeys = () =>
  createEnv({
    client: {},
    runtimeEnv: {
      CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
    },
    server: {
      CLERK_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
    },
  });
