import "server-only";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RegistrationRemoteClient } from "@repo/registration/orpc/types";
import { env } from "@/env";

const TRAILING_SLASH_PATTERN = /\/$/;

const apiBaseUrl = (env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002").replace(
  TRAILING_SLASH_PATTERN,
  ""
);

export const adminRegistrationClient: RegistrationRemoteClient =
  createORPCClient(
    new RPCLink({
      url: `${apiBaseUrl}/rpc`,
      headers: () => {
        if (!env.REGISTRATION_APPROVAL_SECRET) {
          throw new Error(
            "REGISTRATION_APPROVAL_SECRET must be configured in apps/web to use the admin registration dashboard."
          );
        }

        return {
          "x-registration-approval-secret": env.REGISTRATION_APPROVAL_SECRET,
        };
      },
    }),
    {
      path: ["registration"],
    }
  );
