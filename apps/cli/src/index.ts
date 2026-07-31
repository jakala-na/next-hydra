#!/usr/bin/env jiti

import {
  environmentFileFromArguments,
  loadEnvironmentFile,
} from "./environment";

loadEnvironmentFile(environmentFileFromArguments(process.argv));

const [{ env }, { createProgram }] = await Promise.all([
  import("../env"),
  import("./program"),
]);
const program = createProgram(env);
await program.parseAsync();
