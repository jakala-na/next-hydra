import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const frameOrigin = z
  .string()
  .url()
  .regex(
    /^https?:\/\/[a-z0-9.-]+(?::[0-9]+)?\/?$/iu,
    "FRAME_ANCESTORS must contain exact HTTP(S) origins without paths or wildcards"
  )
  .transform((value) => new URL(value).origin);

export const keys = () =>
  createEnv({
    runtimeEnv: {
      ARCJET_KEY: process.env.ARCJET_KEY,
      FRAME_ANCESTORS: process.env.FRAME_ANCESTORS,
    },
    server: {
      ARCJET_KEY: z.string().startsWith("ajkey_").optional(),
      FRAME_ANCESTORS: z
        .string()
        .default("")
        .transform((value) => value.split(/[\s,]+/u).filter(Boolean))
        .pipe(z.array(frameOrigin)),
    },
  });
