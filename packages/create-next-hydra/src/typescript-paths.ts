import { Effect, FileSystem, Path, Schema } from "effect";
import { applyEdits, modify, parse } from "jsonc-parser";
import type { ParseError } from "jsonc-parser";

import { InvalidComposition } from "./errors.ts";

export interface TypeScriptAlias {
  readonly cwd: string;
  readonly alias: string;
  readonly sourcePath: string;
}
export type TypeScriptAliasTarget = Omit<TypeScriptAlias, "sourcePath">;

const Config = Schema.Struct({
  compilerOptions: Schema.optionalKey(
    Schema.Struct({
      baseUrl: Schema.optionalKey(Schema.String),
      paths: Schema.optionalKey(
        Schema.Record(Schema.String, Schema.Array(Schema.String))
      ),
    })
  ),
});

export const applyTypeScriptAliases = Effect.fn(
  "Composition.applyTypeScriptAliases"
)(function* (
  root: string,
  aliases: readonly TypeScriptAlias[],
  ownedAliases: readonly TypeScriptAliasTarget[]
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const cwd of new Set(
    [...ownedAliases, ...aliases].map((alias) => alias.cwd)
  )) {
    const filename = path.join(root, cwd, "tsconfig.json");
    const desired = aliases.filter((entry) => entry.cwd === cwd);
    if (desired.length === 0 && !(yield* fs.exists(filename))) {
      continue;
    }
    let text = yield* fs.readFileString(filename);
    const errors: ParseError[] = [];
    const data: unknown = parse(text, errors, { allowTrailingComma: true });
    if (errors.length) {
      return yield* new InvalidComposition({
        message: `Invalid TypeScript configuration: ${cwd}/tsconfig.json`,
      });
    }
    const config = yield* Schema.decodeUnknownEffect(Config)(data);
    const consumer = path.join(
      root,
      cwd,
      config.compilerOptions?.baseUrl ?? "."
    );
    const updates = new Map<string, string[] | undefined>();
    for (const alias of ownedAliases.filter((entry) => entry.cwd === cwd)) {
      updates.set(alias.alias, undefined);
      updates.set(`${alias.alias}/*`, undefined);
    }
    for (const alias of desired) {
      const relative = path
        .relative(consumer, path.join(root, alias.sourcePath))
        .split(path.sep)
        .join("/");
      const target = relative.startsWith(".") ? relative : `./${relative}`;
      updates.set(alias.alias, [target]);
      if (!/\.[cm]?[jt]sx?$/u.test(alias.sourcePath)) {
        updates.set(`${alias.alias}/*`, [`${target}/*`]);
      }
    }
    for (const [name, value] of updates) {
      text = applyEdits(
        text,
        modify(text, ["compilerOptions", "paths", name], value, {
          formattingOptions: { insertSpaces: true, tabSize: 2 },
        })
      );
    }
    yield* fs.writeFileString(filename, text).pipe(Effect.uninterruptible);
  }
});
