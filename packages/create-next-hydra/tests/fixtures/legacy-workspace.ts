import { mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  hashWorkspaceContent,
  WORKSPACE_STATE,
} from "../../src/workspace-update.js";
import type { WorkspaceFile } from "../../src/workspace-update.js";

/** Persist the retired v2 linked format without retaining a production link writer. */
export async function seedLinkedWorkspace(options: {
  sourceRoot: string;
  targetRoot: string;
  files: (WorkspaceFile | { target: string; owner: string; source: string })[];
}): Promise<void> {
  const entries = await Promise.all(
    options.files.map(async (file) => {
      const target = path.join(options.targetRoot, file.target);
      await mkdir(path.dirname(target), { recursive: true });
      const fingerprint =
        "source" in file
          ? { kind: "link", source: file.source }
          : {
              hash: hashWorkspaceContent(file.content),
              kind: "file",
              mode: file.mode,
            };
      await ("source" in file
        ? symlink(file.source, target)
        : writeFile(target, file.content, { mode: file.mode }));
      return {
        applied: fingerprint,
        desired: fingerprint,
        owner: file.owner,
        target: file.target,
      };
    })
  );
  await writeFile(
    path.join(options.targetRoot, WORKSPACE_STATE),
    JSON.stringify({
      dependencyHash: "dependencies-v1",
      files: entries,
      sourceRoot: options.sourceRoot,
      version: 2,
    })
  );
}
