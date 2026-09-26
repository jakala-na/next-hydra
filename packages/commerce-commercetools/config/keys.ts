import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

import {
  missingRuntimeScopes,
  runtimeScopeValidationMessage,
} from "./runtime-scopes";

const commerceEnvironmentFields = {
  COMMERCETOOLS_CLIENT_ID: z.string().min(1),
  COMMERCETOOLS_CLIENT_SECRET: z.string().min(1),
  COMMERCETOOLS_PROJECT_KEY: z.string().min(1),
  COMMERCETOOLS_REGION: z.string().min(1),
  COMMERCETOOLS_SCOPE: z.string().min(1),
};

export const serverKeys = () =>
  createEnv({
    createFinalSchema: (environmentFields, isServer) =>
      z.object(environmentFields).superRefine((environment, context) => {
        if (!isServer) {
          return;
        }

        const missingScopes = missingRuntimeScopes(
          environment.COMMERCETOOLS_PROJECT_KEY,
          environment.COMMERCETOOLS_SCOPE
        );
        if (missingScopes.length > 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: runtimeScopeValidationMessage(
              environment.COMMERCETOOLS_PROJECT_KEY,
              missingScopes
            ),
            path: ["COMMERCETOOLS_SCOPE"],
          });
        }
      }),
    runtimeEnv: {
      COMMERCETOOLS_CLIENT_ID: process.env.COMMERCETOOLS_CLIENT_ID,
      COMMERCETOOLS_CLIENT_SECRET: process.env.COMMERCETOOLS_CLIENT_SECRET,
      COMMERCETOOLS_PROJECT_KEY: process.env.COMMERCETOOLS_PROJECT_KEY,
      COMMERCETOOLS_REGION: process.env.COMMERCETOOLS_REGION,
      COMMERCETOOLS_SCOPE: process.env.COMMERCETOOLS_SCOPE,
    },
    server: commerceEnvironmentFields,
  });

export const keys = serverKeys;
