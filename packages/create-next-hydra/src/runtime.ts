import { NodeServices } from "@effect/platform-node";
import { Layer } from "effect";

import { Composition } from "./composition.ts";
import { Shadcn } from "./shadcn.ts";
import { SourceChanges } from "./source-changes.ts";
import { SourceInventory } from "./source-inventory.ts";
import { WorkspaceDependencies } from "./workspace-dependencies.ts";
import { WorkspaceFiles } from "./workspace-files.ts";
import { WorkspaceSnapshots } from "./workspace-snapshots.ts";
import { WorkspaceSources } from "./workspace-sources.ts";
import { WorkspaceState } from "./workspace-state.ts";
import { Workspaces } from "./workspaces.ts";

const platform = NodeServices.layer;
const registry = Shadcn.layer();
const composition = Composition.layer.pipe(
  Layer.provide(registry),
  Layer.provide(SourceInventory.layer),
  Layer.provide(platform)
);
export const runtime = Workspaces.layer.pipe(
  Layer.provide([
    WorkspaceState.layer,
    SourceChanges.layer,
    WorkspaceSnapshots.layer,
    WorkspaceFiles.layer,
    WorkspaceDependencies.layer,
  ]),
  Layer.provideMerge(registry),
  Layer.provideMerge(composition),
  Layer.provideMerge(WorkspaceSources.layer),
  Layer.provideMerge(SourceInventory.layer),
  Layer.provideMerge(platform)
);
