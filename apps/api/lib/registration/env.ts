import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

import { apiServerEnvFields } from "../../env-schema";

// Registration owns these URLs and email settings. Provider credentials are
// validated by their Effect layers when the capability is initialized.
export const env = createEnv({
  client: { NEXT_PUBLIC_WEB_URL: z.string().url() },
  runtimeEnv: {
    ADMIN_URL: process.env.ADMIN_URL,
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    REGISTRATION_APPROVER_EMAIL: process.env.REGISTRATION_APPROVER_EMAIL,
  },
  server: apiServerEnvFields,
});
