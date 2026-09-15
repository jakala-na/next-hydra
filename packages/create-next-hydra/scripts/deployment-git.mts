import { execFileSync } from "node:child_process";

/** Bounded Git access for the deployment baseline, not a changed-file matcher. */
export function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf-8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  });
}
