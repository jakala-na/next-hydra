import { isUtf8 } from "node:buffer";

import { Effect, Schema } from "effect";

import { InvalidComposition } from "./errors.ts";
import type { PreparedFile } from "./model.ts";
import { DevelopmentPort } from "./model.ts";

const extras = [Schema.Record(Schema.String, Schema.Unknown)] as const;
const Manifest = Schema.fromJsonString(
  Schema.StructWithRest(
    Schema.Struct({
      portless: Schema.optionalKey(
        Schema.StructWithRest(
          Schema.Struct({
            name: Schema.optionalKey(Schema.String),
            script: Schema.String,
          }),
          extras
        )
      ),
      scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    }),
    extras
  ),
  { space: 2 }
);

export const scopeApplicationHosts = Effect.fn(
  "Composition.scopeApplicationHosts"
)(function* (
  files: readonly PreparedFile[],
  name: string,
  opaqueTargets: ReadonlySet<string>,
  port?: number
) {
  if (port !== undefined) {
    yield* Schema.decodeEffect(DevelopmentPort)(port);
  }
  const namespace = name
    .replaceAll(/[._]/gu, "-")
    .slice(0, 63)
    .replace(/-+$/u, "");
  const hosts = new Map<string, string>();
  const output: PreparedFile[] = [];
  for (const file of files) {
    if (
      opaqueTargets.has(file.target) ||
      !/^apps\/[^/]+\/package\.json$/u.test(file.target)
    ) {
      output.push(file);
      continue;
    }
    const manifest = yield* Schema.decodeEffect(Manifest)(
      new TextDecoder().decode(file.content)
    );
    if (!manifest.portless) {
      output.push(file);
      continue;
    }
    const scripts = manifest.scripts ?? {};
    if (
      !(scripts.dev === "portless" || scripts.dev?.startsWith("portless ")) ||
      manifest.portless.script === "dev" ||
      !scripts[manifest.portless.script]
    ) {
      return yield* new InvalidComposition({
        message: `Invalid Portless development command: ${file.target}`,
      });
    }
    const [, application] = file.target.split("/");
    const appPort =
      port === undefined
        ? undefined
        : new Map([
            ["web", port],
            ["api", port + 1],
            ["admin", port + 2],
          ]).get(application ?? "");
    const scopedName = `${application}.${namespace}`;
    if (manifest.portless.name !== undefined) {
      const hostname = `${manifest.portless.name}.localhost`;
      if (hosts.has(hostname)) {
        return yield* new InvalidComposition({
          message: `Duplicate Portless hostname: ${hostname}`,
        });
      }
      hosts.set(hostname, `${scopedName}.localhost`);
    }
    output.push({
      ...file,
      content: new TextEncoder().encode(
        `${yield* Schema.encodeEffect(Manifest)({ ...manifest, portless: { ...manifest.portless, appPort, name: scopedName } })}\n`
      ),
    });
  }
  if (hosts.size === 0) {
    return output;
  }
  const escaped = [...hosts.keys()].map((hostname) =>
    hostname.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")
  );
  const pattern = new RegExp(
    `(?<![\\w.-])(?:${escaped.join("|")})(?![\\w.-])`,
    "gu"
  );
  return output.map((file) => {
    if (
      opaqueTargets.has(file.target) ||
      !isUtf8(file.content) ||
      file.content.includes(0)
    ) {
      return file;
    }
    const text = new TextDecoder().decode(file.content);
    const updated = text.replaceAll(
      pattern,
      (hostname) => hosts.get(hostname) ?? hostname
    );
    return updated === text
      ? file
      : { ...file, content: new TextEncoder().encode(updated) };
  });
});
