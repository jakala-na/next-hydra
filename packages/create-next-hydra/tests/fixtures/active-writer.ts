import { readFileSync, writeFileSync } from "node:fs";

import { Schema } from "effect";

import { RequestJson } from "../../src/shadcn-protocol.ts";

const [requestPath] = process.argv.slice(2);
if (!requestPath) {
  throw new Error("Missing fixture request path");
}
const request = Schema.decodeSync(RequestJson)(
  readFileSync(requestPath, "utf-8")
);
process.on("SIGTERM", () => {
  // Deliberately exercise forced termination.
});
writeFileSync(`${request.application}/active`, "started");
setInterval(() => {
  writeFileSync(`${request.application}/active`, "writing");
}, 10);
