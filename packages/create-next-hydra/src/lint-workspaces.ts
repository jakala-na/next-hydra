import path from "node:path";

import { lintCompositions } from "./composition-lint.js";
import { runGit } from "./git.js";
import { findMaintainerWorkspaceRoot } from "./maintainer-workspace.js";

const sourceRoot = await findMaintainerWorkspaceRoot(import.meta.dirname);
const args = process.argv.slice(2);
const staged = args.includes("--staged");
const stagedDiff = staged
  ? await runGit(
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
      { cwd: sourceRoot }
    )
  : undefined;
const files = staged
  ? (stagedDiff?.stdout ?? "").split("\0").filter(Boolean)
  : args.map((file) => path.relative(sourceRoot, path.resolve(file)));
await lintCompositions(sourceRoot, staged || files.length ? files : undefined);
