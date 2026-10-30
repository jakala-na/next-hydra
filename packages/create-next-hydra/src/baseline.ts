import { Effect, Schema } from "effect";
import type { Document } from "yaml";
import { parseAllDocuments, parseDocument } from "yaml";

import { InvalidComposition } from "./errors.ts";
import { applicationPackagePatterns } from "./package-catalog.ts";

export const applicationIgnoreRules = `node_modules/
.next/
.turbo/
.env
.env.*
!.env.example
*.tsbuildinfo
`;

export function normalizeApplicationName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9._-]+/gu, "-")
      .replaceAll(/-+/gu, "-")
      .replace(/^[._-]+/u, "")
      .slice(0, 214)
      .replace(/[._-]+$/u, "") || "application"
  );
}

const RootManifest = Schema.fromJsonString(
  Schema.Struct({
    devDependencies: Schema.Record(Schema.String, Schema.String),
    engines: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    packageManager: Schema.optionalKey(Schema.String),
  })
);
const encodeJson = Schema.encodeEffect(
  Schema.fromJsonString(Schema.Unknown, { space: 2 })
);
const WorkspaceSettings = Schema.Struct({
  packages: Schema.Array(Schema.String),
});
const Lockfile = Schema.Struct({
  importers: Schema.Record(Schema.String, Schema.Unknown),
  patchedDependencies: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Unknown)
  ),
});

const decodeDocument = Effect.fn("Composition.decodeDocument")(function* <A>(
  document: Document,
  target: string,
  schema: Schema.Decoder<A>
) {
  if (document.errors.length > 0) {
    return yield* new InvalidComposition({
      message: `Invalid YAML: ${target}`,
    });
  }
  const decode = yield* Effect.try({
    catch: () => new InvalidComposition({ message: `Invalid YAML: ${target}` }),
    try: () => Schema.decodeUnknownEffect(schema)(document.toJS()),
  });
  const data = yield* decode;
  return { data, document };
});

export const yamlDocument = Effect.fn("Composition.yamlDocument")(function* <A>(
  bytes: Uint8Array,
  target: string,
  schema: Schema.Decoder<A>
) {
  const document = yield* Effect.try({
    catch: () => new InvalidComposition({ message: `Invalid YAML: ${target}` }),
    try: () => parseDocument(new TextDecoder().decode(bytes)),
  });
  return yield* decodeDocument(document, target, schema);
});

export const applicationWorkspace = Effect.fn(
  "Composition.applicationWorkspace"
)(function* (
  settings: Effect.Success<ReturnType<typeof readWorkspaceSettings>>,
  lockSource: Uint8Array,
  targets: ReadonlySet<string>,
  patches: ReadonlyMap<string, string>
) {
  settings.document.set(
    "packages",
    applicationPackagePatterns(settings.data.packages, targets)
  );
  settings.document.set("patchedDependencies", Object.fromEntries(patches));
  // pnpm 12 keeps its own dependency graph in an optional leading document.
  // Preserve it and filter only the application's graph in the last document.
  const documents = yield* Effect.try({
    catch: () =>
      new InvalidComposition({ message: "Invalid YAML: pnpm-lock.yaml" }),
    try: () => parseAllDocuments(new TextDecoder().decode(lockSource)),
  });
  const project = documents.at(-1);
  if (!project || documents.some((document) => document.errors.length > 0)) {
    return yield* new InvalidComposition({
      message: "Invalid YAML: pnpm-lock.yaml",
    });
  }
  const lock = yield* decodeDocument(project, "pnpm-lock.yaml", Lockfile);
  lock.document.set(
    "importers",
    Object.fromEntries(
      Object.entries(lock.data.importers).filter(([cwd]) =>
        targets.has(cwd === "." ? "package.json" : `${cwd}/package.json`)
      )
    )
  );
  lock.document.set(
    "patchedDependencies",
    Object.fromEntries(
      Object.entries(lock.data.patchedDependencies ?? {}).filter(
        ([dependency]) => patches.has(dependency)
      )
    )
  );
  return new Map([
    [
      "pnpm-workspace.yaml",
      new TextEncoder().encode(settings.document.toString()),
    ],
    [
      "pnpm-lock.yaml",
      new TextEncoder().encode(
        documents.map((document) => document.toString()).join("")
      ),
    ],
  ]);
});

export const readWorkspaceSettings = (source: Uint8Array) =>
  yamlDocument(source, "pnpm-workspace.yaml", WorkspaceSettings);

export const applicationManifest = Effect.fn("Composition.applicationManifest")(
  function* (source: Uint8Array, name: string, browserTests: boolean) {
    const manifest = yield* Schema.decodeEffect(RootManifest)(
      new TextDecoder().decode(source)
    );
    if (!manifest.devDependencies.portless) {
      return yield* new InvalidComposition({
        message:
          "The source workspace must declare Portless in devDependencies",
      });
    }
    const devDependencies = {
      "@typescript/native": manifest.devDependencies["@typescript/native"],
      portless: manifest.devDependencies.portless,
      turbo: manifest.devDependencies.turbo,
      typescript: "catalog:",
    };
    const scripts = {
      build: "turbo run build",
      dev: "turbo run dev",
      test: "turbo run test",
      "test:e2e": browserTests ? "turbo run e2e" : undefined,
      "test:e2e:list": browserTests ? "turbo run e2e:list" : undefined,
      typecheck: "turbo run typecheck",
    };
    return new TextEncoder().encode(
      `${yield* encodeJson({ devDependencies, engines: manifest.engines, name, packageManager: manifest.packageManager, private: true, scripts })}\n`
    );
  }
);
