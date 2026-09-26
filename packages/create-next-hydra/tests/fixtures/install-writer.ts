import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const [script, role] = process.argv.slice(1);
if (!script) {
  throw new Error("Missing writer script");
}
mkdirSync("node_modules", { recursive: true });
if (role === "child") {
  writeFileSync("node_modules/child-ready", String(process.pid));
  let writes = 0;
  setInterval(() => {
    writes += 1;
    writeFileSync("node_modules/writing", String(writes));
  }, 10);
} else {
  // Like a lifecycle command, the descendant inherits its parent's process group.
  spawn(process.execPath, [script, "child"], { stdio: "ignore" });
  process.on("SIGTERM", () => {
    // Require forced termination of the leader.
  });
  setInterval(() => undefined, 1000);
}
