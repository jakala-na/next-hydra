import { Layer } from "effect";

import { Composition } from "../../src/composition.ts";
import { Shadcn } from "../../src/shadcn.ts";
import { SourceChanges } from "../../src/source-changes.ts";
import { SourceInventory } from "../../src/source-inventory.ts";
import { WorkspaceDependencies } from "../../src/workspace-dependencies.ts";
import { WorkspaceFiles } from "../../src/workspace-files.ts";
import { WorkspaceSnapshots } from "../../src/workspace-snapshots.ts";
import { WorkspaceSources } from "../../src/workspace-sources.ts";
import { WorkspaceState } from "../../src/workspace-state.ts";
import { Workspaces } from "../../src/workspaces.ts";

export const liveWorkspace = Workspaces.layer.pipe(
  Layer.provide([
    Shadcn.layer(new URL("../../src/shadcn-worker.ts", import.meta.url)),
    WorkspaceState.layer,
    SourceChanges.layer,
    WorkspaceDependencies.layer,
    WorkspaceFiles.layer,
    WorkspaceSnapshots.layer,
    Composition.layer.pipe(
      Layer.provide(
        Shadcn.layer(new URL("../../src/shadcn-worker.ts", import.meta.url))
      )
    ),
    WorkspaceSources.layer,
  ]),
  Layer.provide(SourceInventory.layer)
);
