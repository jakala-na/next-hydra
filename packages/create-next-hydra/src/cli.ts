#!/usr/bin/env node
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";

import { cliProgram } from "./index.ts";
import { runtime } from "./runtime.ts";

NodeRuntime.runMain(cliProgram().pipe(Effect.provide(runtime)));
