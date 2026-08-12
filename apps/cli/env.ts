import { serverKeys as commerce } from "@repo/commerce-provider/keys";
import { createEnv } from "@t3-oss/env-nextjs";

export const env = () =>
  createEnv({
    client: {},
    extends: [commerce()],
    runtimeEnv: {},
    server: {},
  });
