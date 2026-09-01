import "server-only";
import { ActionClient } from "@repo/actions";

import { AppRuntime } from "./app-runtime";

export const Actions = ActionClient.make(AppRuntime);
