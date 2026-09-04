import { withCMS } from "@repo/cms/next-config";
import { withI18n } from "@repo/i18n/next-config";
import type { NextConfig } from "next";

const config: NextConfig = {
  cacheComponents: true,
  experimental: {
    useTypeScriptCli: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  typedRoutes: true,
};

export default withCMS(withI18n(config));
