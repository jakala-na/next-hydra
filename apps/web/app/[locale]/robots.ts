import type { MetadataRoute } from "next";

import { env } from "@/env";
import { productionUrl } from "@/lib/production-url";

const url = productionUrl(
  env.VERCEL_PROJECT_PRODUCTION_URL ?? env.NEXT_PUBLIC_WEB_URL
);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      userAgent: "*",
    },
    sitemap: new URL("/sitemap.xml", url.href).href,
  };
}
