"use server";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createSubmitRegistrationAction } from "@repo/registration/actions/create-submit-registration-action";
import type { RegistrationRemoteClient } from "@repo/registration/orpc/types";
import { env } from "@/env";

const TRAILING_SLASH_PATTERN = /\/$/;

const apiBaseUrl = (env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002").replace(
  TRAILING_SLASH_PATTERN,
  ""
);

const client: RegistrationRemoteClient = createORPCClient(
  new RPCLink({
    url: `${apiBaseUrl}/rpc`,
  }),
  {
    path: ["registration"],
  }
);

export const submitRegistrationAction = createSubmitRegistrationAction(
  async (input) => client.submit(input)
);
