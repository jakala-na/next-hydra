# Effect tsgo after the TypeScript 7 release

Research snapshot: 2026-08-14. Effect guidance was checked at [`Effect-TS/tsgo@e15e4d1`](https://github.com/Effect-TS/tsgo/tree/e15e4d1f7c062afdf654987081058f68c24e4e0b), with the latest published package release [`@effect/tsgo@0.36.4`](https://github.com/Effect-TS/tsgo/releases/tag/%40effect%2Ftsgo%400.36.4). Microsoft guidance was checked against the TypeScript 7 release announcement and TypeScript 7 VS Code extension source at [`microsoft/typescript-go@3e58dfc`](https://github.com/microsoft/typescript-go/tree/3e58dfce6ea23b08fc2911b75286008dc56f277b).

## Conclusion

Next Hydra should stop installing `@typescript/native-preview`. TypeScript 7 is stable and is now published as `typescript`; the Effect tsgo README requires either `typescript >= 7` or a stable alias such as `@typescript/native`. The current Effect patcher tries `typescript` and then `@typescript/native`; it no longer discovers `@typescript/native-preview`. See the [Effect installation note](https://github.com/Effect-TS/tsgo/blob/e15e4d1f7c062afdf654987081058f68c24e4e0b/README.md#installation), [backend names and version gate](https://github.com/Effect-TS/tsgo/blob/ca859c5/_packages/tsgo/src/patcher/discovery.ts#L9-L27), and [backend discovery](https://github.com/Effect-TS/tsgo/blob/ca859c5/_packages/tsgo/src/patcher/discovery.ts#L85-L110).

The repository cannot safely replace its existing `typescript` package directly with TypeScript 7. Tools such as `@typescript-eslint/typescript-estree` and `ts-node` consume the JavaScript TypeScript API, while TypeScript 7.0 has no programmatic API. Microsoft therefore recommends a side-by-side install: expose the TypeScript 6 compatibility API under the package name `typescript`, and expose stable TypeScript 7 under an alias such as `@typescript/native`. See [Next Hydra's current catalog](../pnpm-workspace.yaml), [Microsoft's side-by-side guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0), and [the retirement of `@typescript/native-preview`](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#nightly-builds-and-typescriptnative-preview).

Keeping `typescript@5.9.3` unchanged while adding the TypeScript 7 alias would create a command collision: both packages publish a `tsc` executable. The official compatibility package publishes `tsc6` instead, leaving `tsc` unambiguously owned by TypeScript 7. For this repository, the coherent stable layout is therefore:

```jsonc
{
  "devDependencies": {
    "@typescript/native": "npm:typescript@7.0.2",
    "typescript": "npm:@typescript/typescript6@6.0.2"
  }
}
```

`effect-tsgo patch` remains the current installation mechanism. The latest README documents it, the CLI still exposes `patch` and `unpatch`, and the current setup workflow adds an explicit `effect-tsgo patch --typescript --no-oxlint` prepare command. Plain `effect-tsgo patch` still defaults to TypeScript enabled and Oxlint disabled, so the existing command remains valid; the explicit flags only make its scope clearer. See the [Effect README](https://github.com/Effect-TS/tsgo/blob/e15e4d1f7c062afdf654987081058f68c24e4e0b/README.md#installation), [CLI defaults](https://github.com/Effect-TS/tsgo/blob/ca859c5/_packages/tsgo/src/cli/integrationFlags.ts#L13-L25), and [setup-generated command](https://github.com/Effect-TS/tsgo/blob/ca859c5/_packages/tsgo/src/cli/setup/patch-command.ts#L17-L31).

## Why `native-preview` still appears in VS Code

The Marketplace extension's immutable identifier is still `TypeScriptTeam.native-preview`, but its display name is now **TypeScript 7**. Microsoft describes it as the native TypeScript language service, not a preview, and says TypeScript 7 support will become part of VS Code. Keeping that extension ID in `.vscode/extensions.json` is therefore currently correct even though the identifier is historical. See the [current extension listing](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview), [TypeScript 7 editor guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#editor-experience), and the extension's [`name` and `displayName`](https://github.com/microsoft/typescript-go/blob/3e58dfce6ea23b08fc2911b75286008dc56f277b/_extension/package.json#L1-L5).

The setting `typescript.native-preview.tsdk` is obsolete. Microsoft's extension manifest marks it deprecated in favor of `js/ts.tsdk.path`; its current README uses `js/ts.experimental.useTsgo` and a relative local package directory. See the [deprecation text](https://github.com/microsoft/typescript-go/blob/3e58dfce6ea23b08fc2911b75286008dc56f277b/_extension/package.nls.json#L11-L17) and [current extension configuration](https://github.com/microsoft/typescript-go/blob/3e58dfce6ea23b08fc2911b75286008dc56f277b/_extension/README.md#configuration).

Current `@effect/tsgo setup` writes these new setting names:

```jsonc
{
  "js/ts.experimental.useTsgo": true,
  "js/ts.tsdk.path": "./node_modules/typescript/bin",
  "js/ts.tsdk.promptToUseWorkspaceVersion": true,
  "js/ts.tsdk.additionalLocations": ["./node_modules/typescript/bin"]
}
```

See the [released setup target](https://github.com/Effect-TS/tsgo/blob/ca859c5/_packages/tsgo/src/cli/setup/target.ts#L75-L84). However, that generated path assumes `typescript` itself is TypeScript 7. Under the required side-by-side layout, `typescript` is the TypeScript 6 compatibility API, so applying setup's path literally would select the wrong package rather than the Effect-patched TypeScript 7 binary.

For the side-by-side alias, point the same current setting at the alias instead:

```jsonc
{
  "js/ts.experimental.useTsgo": true,
  "js/ts.tsdk.path": "./node_modules/@typescript/native",
  "js/ts.tsdk.promptToUseWorkspaceVersion": true,
  "js/ts.tsdk.additionalLocations": ["./node_modules/@typescript/native"]
}
```

The TypeScript 7 extension accepts a package directory or its `bin` child, resolves relative paths from the workspace, reads the aliased package metadata, and locates its platform `tsc` binary. See the [SDK resolver](https://github.com/microsoft/typescript-go/blob/3e58dfce6ea23b08fc2911b75286008dc56f277b/_extension/src/util.ts#L315-L353). The relative alias path is portable and replaces the machine-specific absolute path currently in [`.vscode/settings.json`](../.vscode/settings.json).

## Recommended migration

1. Upgrade `@effect/tsgo` from `^0.13.0` to `^0.36.4`.
2. Remove `@typescript/native-preview@7.0.0-dev.20260527.2`.
3. Change the `typescript` catalog entry from `5.9.3` to `npm:@typescript/typescript6@6.0.2`. This preserves the JavaScript API under the package name expected by API-consuming tools and exposes its compiler as `tsc6`.
4. Add `@typescript/native: npm:typescript@7.0.2` as a root development dependency. Its `tsc` command is the stable native compiler.
5. Replace repository typecheck script invocations of `tsgo --noEmit` with `tsc --noEmit`; the stable package no longer provides `tsgo`.
6. Keep `effect-tsgo patch` in `prepare`, optionally spelling it as `effect-tsgo patch --typescript --no-oxlint`. Keep `effect-language-service patch` initially for the TypeScript 6 compatibility path; removing that older integration can be evaluated separately after editor and embedded-language fallbacks are verified.
7. Keep the `TypeScriptTeam.native-preview` extension recommendation until VS Code bundles TypeScript 7 or Microsoft changes the extension identifier.
8. Delete `typescript.native-preview.tsdk` and add the `js/ts.*` settings above, targeting `./node_modules/@typescript/native`.
9. Run the package-manager install so `prepare` patches the stable TypeScript 7 binary. Verify `pnpm exec tsc --version`, `pnpm exec tsc6 --version`, the full typecheck, and that VS Code resolves its active server from `@typescript/native`.

This is not merely a package-version bump: `@effect/tsgo@0.15.0` first added stable `typescript >= 7` support while retaining preview compatibility, and `0.18.0` introduced the current `typescript` -> `@typescript/native` fallback. See the [`0.15.0` release notes](https://github.com/Effect-TS/tsgo/releases/tag/%40effect%2Ftsgo%400.15.0) and [`0.18.0` release notes](https://github.com/Effect-TS/tsgo/releases/tag/%40effect%2Ftsgo%400.18.0). Upgrading to `0.36.4` is what removes the preview backend from the supported current path and brings the setup/editor guidance in line with stable TypeScript 7.
