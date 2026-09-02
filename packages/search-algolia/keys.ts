import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    runtimeEnv: {
      ALGOLIA_APPLICATION_ID: process.env.ALGOLIA_APPLICATION_ID,
      ALGOLIA_PRODUCTS_INDEX_NAME: process.env.ALGOLIA_PRODUCTS_INDEX_NAME,
      ALGOLIA_PRODUCTS_PRICE_ASC_INDEX_NAME:
        process.env.ALGOLIA_PRODUCTS_PRICE_ASC_INDEX_NAME,
      ALGOLIA_PRODUCTS_PRICE_DESC_INDEX_NAME:
        process.env.ALGOLIA_PRODUCTS_PRICE_DESC_INDEX_NAME,
      ALGOLIA_QUERY_SUGGESTIONS_INDEX_NAME:
        process.env.ALGOLIA_QUERY_SUGGESTIONS_INDEX_NAME,
      ALGOLIA_RESOURCES_INDEX_NAME: process.env.ALGOLIA_RESOURCES_INDEX_NAME,
      ALGOLIA_SEARCH_API_KEY: process.env.ALGOLIA_SEARCH_API_KEY,
    },
    server: {
      ALGOLIA_APPLICATION_ID: z.string().trim().min(1),
      ALGOLIA_PRODUCTS_INDEX_NAME: z.string().trim().min(1).default("products"),
      ALGOLIA_PRODUCTS_PRICE_ASC_INDEX_NAME: z
        .string()
        .trim()
        .min(1)
        .default("products_price_asc"),
      ALGOLIA_PRODUCTS_PRICE_DESC_INDEX_NAME: z
        .string()
        .trim()
        .min(1)
        .default("products_price_desc"),
      ALGOLIA_QUERY_SUGGESTIONS_INDEX_NAME: z
        .string()
        .trim()
        .min(1)
        .default("query_suggestions"),
      ALGOLIA_RESOURCES_INDEX_NAME: z
        .string()
        .trim()
        .min(1)
        .default("resources"),
      ALGOLIA_SEARCH_API_KEY: z.string().trim().min(1),
    },
  });
