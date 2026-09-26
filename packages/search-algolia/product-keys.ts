import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    emptyStringAsUndefined: true,
    runtimeEnv: {
      ALGOLIA_PRICE_CUSTOMER_GROUP_IDS:
        process.env.ALGOLIA_PRICE_CUSTOMER_GROUP_IDS,
    },
    server: { ALGOLIA_PRICE_CUSTOMER_GROUP_IDS: z.string().trim().optional() },
  });
