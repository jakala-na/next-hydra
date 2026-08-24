import { makeAuthCommand } from "@repo/auth-contract/cli";
import type { ConfigProvider, Effect } from "effect";

import { createWorkosAuthProvisioningLayer } from "./provisioning";

export const createAuthCommand = <E, R>(
  configProvider: Effect.Effect<ConfigProvider.ConfigProvider, E, R>
) => makeAuthCommand(createWorkosAuthProvisioningLayer(configProvider));
