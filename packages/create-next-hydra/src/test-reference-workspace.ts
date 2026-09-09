import { findMaintainerWorkspaceRoot } from "./maintainer-workspace.js";
import { testReferenceWorkspace } from "./reference-workspace.js";

await testReferenceWorkspace(
  await findMaintainerWorkspaceRoot(import.meta.dirname)
);
