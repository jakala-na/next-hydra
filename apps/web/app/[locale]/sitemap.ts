import type { MetadataRoute } from "next";

import { env } from "@/env";
import { productionUrl } from "@/lib/production-url";

const url = productionUrl(
  env.VERCEL_PROJECT_PRODUCTION_URL ?? env.NEXT_PUBLIC_WEB_URL
);

const sitemap = (): MetadataRoute.Sitemap => [
  {
    lastModified: new Date(),
    url: new URL("/", url).href,
  },
];

export default sitemap;
