import { z } from "zod";

export const MINIMUM_CMS_REVALIDATION_SECRET_LENGTH = 32;

export const webCmsServerEnvFields = {
  CMS_HOMEPAGE_SLUG: z.string().trim().min(1).default("/"),
  CMS_REVALIDATION_SECRET: z
    .string()
    .min(MINIMUM_CMS_REVALIDATION_SECRET_LENGTH)
    .optional(),
};

export const webCmsServerEnvSchema = z.object(webCmsServerEnvFields);

export const webClientEnvFields = {};

export const webClientEnvSchema = z.object(webClientEnvFields);
