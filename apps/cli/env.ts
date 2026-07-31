import { serverKeys as commerce } from "@repo/commerce/keys";
import { createEnv } from "@t3-oss/env-nextjs";

export const env = () =>
  createEnv({
    extends: [commerce()],
    server: {},
    client: {},
    runtimeEnv: {},
  });
