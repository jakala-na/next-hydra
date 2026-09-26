import { isDeepStrictEqual } from "node:util";

import { Effect, FileSystem, Path } from "effect";
import type { RegistryItem } from "shadcn/schema";

import { InvalidComposition } from "./errors.ts";
import type { RegistryInstruction, SelectionRequest } from "./model.ts";
import {
  registryIndex,
  resolveSelection,
  selectedConditionalDependencies,
} from "./selection.ts";
import { Shadcn } from "./shadcn.ts";
import type { RegistryCatalog } from "./shadcn.ts";

export function registryInstructions(
  items: readonly RegistryItem[]
): readonly RegistryInstruction[] {
  return items.flatMap((item) =>
    item.docs?.trim() ? [{ item: item.name, text: item.docs }] : []
  );
}

const emptyRegistry: RegistryCatalog = {
  homepage: "",
  items: [],
  name: "installation",
};

// Keep the acquired artifacts, not just their URLs. Inspection and installation
// must agree even when a remote registry changes during the operation.
export const acquireRegistry = Effect.fn("Registry.acquire")(function* (
  cwd: string,
  request:
    | { readonly reference: string }
    | {
        readonly registry: RegistryCatalog;
        readonly selection: SelectionRequest;
      }
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const shadcn = yield* Shadcn;
  const initial = "registry" in request ? request.registry : emptyRegistry;
  const registry = { ...initial, items: [...initial.items] };
  const references = new Map<string, string>();
  const external = new Set<string>();
  const observed = new Map<string, string>();
  const repository =
    /^https:\/\/github\.com\/(?<repository>[^/]+\/[^/]+?)(?:\.git)?\/?$/u.exec(
      initial.homepage ?? ""
    )?.groups?.repository;
  const acquire = (reference: string) =>
    Effect.gen(function* () {
      let index = yield* registryIndex(registry, references);
      let name = index.references.get(reference);
      if (!name) {
        const local = path.resolve(cwd, reference);
        const isLocal = yield* fs.exists(local);
        let resolved = reference;
        if (isLocal) {
          resolved = local;
        } else if (
          repository &&
          !reference.includes("/") &&
          !reference.includes("#")
        ) {
          resolved = `${repository}/${reference}`;
        }
        if (isLocal) {
          observed.set(local, yield* fs.readFileString(local));
        }
        const fetched = yield* shadcn.getRegistryItems([resolved], cwd);
        const [item] = fetched;
        if (!item || fetched.length !== 1) {
          return yield* new InvalidComposition({
            message: "The registry did not return the requested artifact.",
          });
        }
        const existing = registry.items.find(
          (candidate) => candidate.name === item.name
        );
        const replacesSource =
          repository !== undefined &&
          reference.includes("#") &&
          reference.split("#", 1)[0] === `${repository}/${item.name}` &&
          !external.has(item.name);
        if (existing && !isDeepStrictEqual(existing, item) && !replacesSource) {
          return yield* new InvalidComposition({
            message: `Registry artifact name collision: ${item.name}`,
          });
        }
        if (existing) {
          registry.items[registry.items.indexOf(existing)] = item;
        } else {
          registry.items.push(item);
        }
        ({ name } = item);
        references.set(reference, name);
        references.set(resolved, name);
        external.add(name);
        index = yield* registryIndex(registry, references);
        const metadata = index.metadataByName.get(name);
        if ((metadata?.assets?.length ?? 0) > 0) {
          return yield* new InvalidComposition({
            message:
              "Published artifacts cannot refer to source-only binary assets.",
          });
        }
      }
      return { index, name };
    });
  if ("selection" in request && "preset" in request.selection) {
    yield* acquire(request.selection.preset);
  }
  const selection =
    "selection" in request
      ? yield* resolveSelection(
          yield* registryIndex(registry, references),
          request.selection
        )
      : undefined;
  const pending = "reference" in request ? [request.reference] : [];
  if (selection) {
    pending.push(
      "app-web",
      ...Object.values(selection.providers),
      ...selection.addOns
    );
  }
  const visited = new Set<string>();
  while (pending.length) {
    const reference = pending.pop();
    if (reference === undefined || visited.has(reference)) {
      continue;
    }
    visited.add(reference);
    const { index, name } = yield* acquire(reference);
    const item = index.items.get(name);
    pending.push(...(item?.registryDependencies ?? []));
    const metadata = index.metadataByName.get(name);
    if (selection) {
      pending.push(...selectedConditionalDependencies(metadata, selection));
    }
  }
  return { external, observed, references, registry };
});
