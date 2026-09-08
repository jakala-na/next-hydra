import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export function keys() {
  return createEnv({
    client: {},
    emptyStringAsUndefined: true,
    runtimeEnv: {
      CONTENTFUL_DELIVERY_TOKEN: process.env.CONTENTFUL_DELIVERY_TOKEN,
      CONTENTFUL_ENVIRONMENT: process.env.CONTENTFUL_ENVIRONMENT,
      CONTENTFUL_PREVIEW_SECRET: process.env.CONTENTFUL_PREVIEW_SECRET,
      CONTENTFUL_PREVIEW_TOKEN: process.env.CONTENTFUL_PREVIEW_TOKEN,
      CONTENTFUL_SPACE_ID: process.env.CONTENTFUL_SPACE_ID,
    },
    server: {
      CONTENTFUL_DELIVERY_TOKEN: z.string().min(1),
      CONTENTFUL_ENVIRONMENT: z.string().min(1),
      CONTENTFUL_PREVIEW_SECRET: z.string().min(1),
      CONTENTFUL_PREVIEW_TOKEN: z.string().min(1),
      CONTENTFUL_SPACE_ID: z.string().min(1),
    },
  });
}
