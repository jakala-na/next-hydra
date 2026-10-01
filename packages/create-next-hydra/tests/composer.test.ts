import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Schema } from "effect";
import { applyEdits, modify } from "jsonc-parser";
import { describe } from "vitest";

import type { ComposerContribution } from "../src/composer.ts";
import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";

const json = Schema.fromJsonString(Schema.Unknown);
const encode = Schema.encodeSync(json);
const decode = Schema.decodeEffect(json);
const backend = "/application/apps/backend";
const initial = {
  config: { "allow-plugins": { "vendor/plugin": true } },
  repositories: [{ type: "composer", url: "https://packages.example.com" }],
  require: { php: "^8.3", "vendor/existing": "^1" },
  scripts: { test: "php tests.php" },
};
const search: ComposerContribution = {
  cwd: "apps/backend",
  repositories: {
    search: {
      options: { symlink: false },
      type: "path",
      url: "recipes/search",
    },
  },
  require: { "application/search": "*@dev" },
  "require-dev": { "vendor/test-tool": "^2" },
};
const lockfile = '{"content-hash":"operator-owned","packages":[]}';

const registryItem = (
  contributions: readonly ComposerContribution[],
  withFiles = true
) => ({
  files: withFiles
    ? [
        {
          content: encode(initial),
          path: "composer.json",
          target: "~/apps/backend/composer.json",
          type: "registry:file",
        },
        {
          content: lockfile,
          path: "composer.lock",
          target: "~/apps/backend/composer.lock",
          type: "registry:file",
        },
        {
          content:
            '{"name":"application/search","type":"drupal-recipe","require":{"vendor/search-module":"^3"}}',
          path: "recipes/search/composer.json",
          target: "~/apps/backend/recipes/search/composer.json",
          type: "registry:file",
        },
      ]
    : [],
  meta: {
    nextHydra: {
      composer: contributions,
      id: "example/php-backend",
      kind: "add-on",
    },
  },
  name: "php-backend",
  type: "registry:item",
});

const fresh = (addOns: readonly string[]) =>
  Workspaces.pipe(
    Effect.flatMap((workspaces) =>
      workspaces.fresh({
        destination: "/application",
        name: "site",
        selection: { addOns: [...addOns], providers: {} },
        source: { kind: "working-tree", root: "/source" },
      })
    )
  );

const addition = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(backend, { recursive: true });
  yield* fs.writeFileString(
    "/application/package.json",
    '{"name":"site","private":true}'
  );
  yield* fs.writeFileString(`${backend}/composer.json`, encode(initial));
  yield* fs.writeFileString(`${backend}/composer.lock`, lockfile);
  yield* fs.writeFileString(
    "/application/search.json",
    encode(registryItem([search], false))
  );
  return yield* (yield* Workspaces).existing({ root: "/application" });
});

it.effect(
  "materializes selected Composer requirements without tools, lockfile resolution or recipe dependency flattening",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(
          "/source/php.json",
          encode(registryItem([search]))
        );
        yield* (yield* fresh(["/source/php.json"])).materialize({
          install: "skip",
        });
        expect(
          yield* fs
            .readFileString(`${backend}/composer.json`)
            .pipe(Effect.flatMap(decode))
        ).toEqual({
          ...initial,
          repositories: {
            "0": { type: "composer", url: "https://packages.example.com" },
            search: {
              options: { symlink: false },
              type: "path",
              url: "recipes/search",
            },
          },
          require: {
            "application/search": "*@dev",
            php: "^8.3",
            "vendor/existing": "^1",
          },
          "require-dev": { "vendor/test-tool": "^2" },
        });
        expect(yield* fs.readFileString(`${backend}/composer.lock`)).toBe(
          lockfile
        );
        expect(
          yield* fs
            .readFileString(`${backend}/recipes/search/composer.json`)
            .pipe(Effect.flatMap(decode))
        ).toMatchObject({ require: { "vendor/search-module": "^3" } });
      }).pipe(Effect.provide(layer));
    })
);

it.effect("does not include Composer files from an unselected item", () =>
  Effect.gen(function* () {
    const layer = yield* memoryWorkspace("application");
    yield* Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const registry = yield* fs.readFileString("/source/registry.json");
      yield* fs.writeFileString(
        "/source/registry.json",
        applyEdits(
          registry,
          modify(
            registry,
            ["items", -1],
            registryItem([{ ...search, cwd: "../outside" }]),
            { isArrayInsertion: true }
          )
        )
      );
      yield* (yield* fresh([])).materialize({ install: "skip" });
      expect(yield* fs.exists(`${backend}/composer.json`)).toBeFalsy();
      expect(
        yield* fs.exists(`${backend}/recipes/search/composer.json`)
      ).toBeFalsy();
    }).pipe(Effect.provide(layer));
  })
);

it.effect(
  "seeds a patched manifest but honors preservation during Check and refresh",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = "/source/workspaces/configured-site";
        yield* fs.writeFileString(
          "/source/php.json",
          encode(registryItem([search]))
        );
        yield* fs.writeFileString(
          `${root}/next-hydra.json`,
          encode({
            addOns: ["/source/php.json"],
            preserve: [
              "apps/backend/composer.json",
              "apps/backend/composer.lock",
            ],
            providers: {},
          })
        );
        const workspace = yield* (yield* Workspaces).named({
          name: "configured-site",
          sourceRoot: "/source",
        });
        yield* workspace.sync({ install: "skip" });
        expect(
          yield* fs
            .readFileString(`${root}/apps/backend/composer.json`)
            .pipe(Effect.flatMap(decode))
        ).toMatchObject({ require: { "application/search": "*@dev" } });
        const operatorManifest = '{"require":{"vendor/operator-package":"^4"}}';
        yield* fs.writeFileString(
          `${root}/apps/backend/composer.json`,
          operatorManifest
        );
        expect((yield* workspace.check).ready).toBeTruthy();
        yield* workspace.sync({ install: "skip" });
        expect(
          yield* fs.readFileString(`${root}/apps/backend/composer.json`)
        ).toBe(operatorManifest);
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "Add patches existing manifests without package-manager processes and is repeatable",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* addition;
        const inspection = yield* workspace.inspectAdd({
          reference: "search.json",
        });
        expect(
          inspection.packages.find(
            (entry) => entry.name === "application/search"
          )
        ).toEqual({
          name: "application/search",
          section: "require",
          status: "create",
          target: "apps/backend/composer.json",
        });
        yield* workspace.add({
          expected: inspection.precondition,
          overwrite: false,
          reference: "search.json",
        });
        const manifest = yield* fs.readFileString(`${backend}/composer.json`);
        expect(yield* decode(manifest)).toMatchObject({
          config: initial.config,
          require: {
            "application/search": "*@dev",
            php: "^8.3",
            "vendor/existing": "^1",
          },
          scripts: initial.scripts,
        });
        yield* workspace.add({ overwrite: false, reference: "search.json" });
        expect(yield* fs.readFileString(`${backend}/composer.json`)).toBe(
          manifest
        );
        expect(yield* fs.readFileString(`${backend}/composer.lock`)).toBe(
          lockfile
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "requires overwrite approval before changing a conflicting Composer requirement",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* addition;
        const before = encode({
          ...initial,
          require: { ...initial.require, "application/search": "^9" },
        });
        yield* fs.writeFileString(`${backend}/composer.json`, before);
        expect(
          yield* workspace
            .add({ overwrite: false, reference: "search.json" })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "AdditionConflict" });
        expect(yield* fs.readFileString(`${backend}/composer.json`)).toBe(
          before
        );
        yield* workspace.add({ overwrite: true, reference: "search.json" });
        expect(
          yield* fs
            .readFileString(`${backend}/composer.json`)
            .pipe(Effect.flatMap(decode))
        ).toMatchObject({
          require: { "application/search": "*@dev", "vendor/existing": "^1" },
        });
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "Add retains local manifest fields when the registry also supplies a baseline",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* addition;
        const local = { ...initial, description: "Operator customization" };
        yield* fs.writeFileString(`${backend}/composer.json`, encode(local));
        yield* fs.writeFileString(
          "/application/search.json",
          encode(registryItem([search]))
        );
        yield* workspace.add({ overwrite: false, reference: "search.json" });
        const first = yield* fs.readFileString(`${backend}/composer.json`);
        expect(yield* decode(first)).toMatchObject({
          config: local.config,
          description: local.description,
          require: { "application/search": "*@dev", "vendor/existing": "^1" },
        });
        yield* workspace.add({ overwrite: false, reference: "search.json" });
        expect(yield* fs.readFileString(`${backend}/composer.json`)).toBe(
          first
        );
        expect(yield* fs.readFileString(`${backend}/composer.lock`)).toBe(
          lockfile
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "Add seeds a missing Composer manifest from its selected registry file",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* addition;
        yield* fs.remove(`${backend}/composer.json`);
        yield* fs.writeFileString(
          "/application/search.json",
          encode(registryItem([search]))
        );
        yield* workspace.add({ overwrite: false, reference: "search.json" });
        expect(
          yield* fs
            .readFileString(`${backend}/composer.json`)
            .pipe(Effect.flatMap(decode))
        ).toMatchObject({
          require: { "application/search": "*@dev", php: "^8.3" },
        });
      }).pipe(Effect.provide(layer));
    })
);

it.effect("rejects a Composer manifest edited after Add inspection", () =>
  Effect.gen(function* () {
    const layer = yield* memoryWorkspace("application");
    yield* Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* addition;
      const inspection = yield* workspace.inspectAdd({
        reference: "search.json",
      });
      const edited = encode({ ...initial, description: "Operator edit" });
      yield* fs.writeFileString(`${backend}/composer.json`, edited);
      expect(
        yield* workspace
          .add({
            expected: inspection.precondition,
            overwrite: false,
            reference: "search.json",
          })
          .pipe(Effect.flip)
      ).toMatchObject({ _tag: "AdditionChanged" });
      expect(yield* fs.readFileString(`${backend}/composer.json`)).toBe(edited);
    }).pipe(Effect.provide(layer));
  })
);

it.effect(
  "Add patches Composer platform requirements alongside package requirements",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* addition;
        yield* fs.writeFileString(
          "/application/search.json",
          encode(
            registryItem(
              [
                {
                  cwd: "apps/backend",
                  require: {
                    composer: "^2.2",
                    "composer-plugin-api": "^2",
                    "composer-runtime-api": "^2.2",
                    "ext-curl": "*",
                    "ext-pdo_mysql": "*",
                    hhvm: "*",
                    "lib-curl": "^8",
                    php: "^8.3",
                    "php-64bit": "^8.3",
                    "php-ipv6": "^8.3",
                    "php-zts": "^8.3",
                    "vendor/tool": "^1",
                  },
                  "require-dev": { "php-debug": "^8.3" },
                },
              ],
              false
            )
          )
        );
        yield* workspace.add({ overwrite: false, reference: "search.json" });
        expect(
          yield* fs
            .readFileString(`${backend}/composer.json`)
            .pipe(Effect.flatMap(decode))
        ).toMatchObject({
          require: {
            composer: "^2.2",
            "composer-plugin-api": "^2",
            "composer-runtime-api": "^2.2",
            "ext-curl": "*",
            "ext-pdo_mysql": "*",
            hhvm: "*",
            "lib-curl": "^8",
            php: "^8.3",
            "php-64bit": "^8.3",
            "php-ipv6": "^8.3",
            "php-zts": "^8.3",
            "vendor/existing": "^1",
            "vendor/tool": "^1",
          },
          "require-dev": { "php-debug": "^8.3" },
        });
        expect(yield* fs.readFileString(`${backend}/composer.lock`)).toBe(
          lockfile
        );
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "Add declares external recipes and repository controls while preserving local metadata",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* addition;
        yield* fs.writeFileString(
          `${backend}/composer.json`,
          encode({
            ...initial,
            repositories: [
              {
                "no-api": true,
                type: "vcs",
                url: "https://github.com/example/operator-module.git",
              },
            ],
          })
        );
        yield* fs.writeFileString(
          "/application/search.json",
          encode(
            registryItem(
              [
                {
                  cwd: "apps/backend",
                  repositories: {
                    local: {
                      canonical: true,
                      only: ["application/search"],
                      options: {
                        reference: "config",
                        versions: { "application/search": "1.0.0" },
                      },
                      type: "path",
                      url: "recipes/search",
                    },
                    packages: {
                      canonical: false,
                      exclude: ["vendor/legacy"],
                      only: ["vendor/*"],
                      type: "composer",
                      url: "https://packages.example.com",
                    },
                    recipe: {
                      type: "vcs",
                      url: "https://github.com/example/content-recipe.git",
                    },
                    recipeGit: {
                      type: "git",
                      url: "ssh://git@git.example.com:2222/recipes/private.git",
                    },
                    recipeSsh: {
                      type: "vcs",
                      url: "git@git.example.com:recipes/private.git",
                    },
                  },
                  require: { "vendor/content-recipe": "^1" },
                },
              ],
              false
            )
          )
        );
        yield* workspace.add({ overwrite: false, reference: "search.json" });
        const manifest = yield* fs.readFileString(`${backend}/composer.json`);
        expect(yield* decode(manifest)).toEqual({
          ...initial,
          repositories: {
            "0": {
              "no-api": true,
              type: "vcs",
              url: "https://github.com/example/operator-module.git",
            },
            local: {
              canonical: true,
              only: ["application/search"],
              options: {
                reference: "config",
                versions: { "application/search": "1.0.0" },
              },
              type: "path",
              url: "recipes/search",
            },
            packages: {
              canonical: false,
              exclude: ["vendor/legacy"],
              only: ["vendor/*"],
              type: "composer",
              url: "https://packages.example.com",
            },
            recipe: {
              type: "vcs",
              url: "https://github.com/example/content-recipe.git",
            },
            recipeGit: {
              type: "git",
              url: "ssh://git@git.example.com:2222/recipes/private.git",
            },
            recipeSsh: {
              type: "vcs",
              url: "git@git.example.com:recipes/private.git",
            },
          },
          require: { ...initial.require, "vendor/content-recipe": "^1" },
        });
        yield* workspace.add({ overwrite: false, reference: "search.json" });
        expect(yield* fs.readFileString(`${backend}/composer.json`)).toBe(
          manifest
        );
        expect(yield* fs.readFileString(`${backend}/composer.lock`)).toBe(
          lockfile
        );
      }).pipe(Effect.provide(layer));
    })
);

describe.each([
  { type: "path", url: "~/recipes/search" },
  { type: "path", url: "~" },
  { type: "path", url: "$HOME/recipes/search" },
  { type: "path", url: `\${RECIPE_SOURCE}/search` },
  { type: "path", url: "%RECIPE_SOURCE%/search" },
  { type: "path", url: `recipes/\${RECIPE_SOURCE}` },
  { type: "path", url: "../recipes/search" },
  { type: "path", url: "recipes/../search" },
  { type: "vcs", url: "https://user:secret@git.example.com/recipe.git" },
  { type: "git", url: "ssh://git:secret@git.example.com/recipe.git" },
  { type: "vcs", url: "file:///private/recipe" },
  { type: "git", url: "git://git.example.com/recipe.git" },
  { type: "vcs", url: "http://git.example.com/recipe.git" },
  { type: "composer", url: "ssh://git@git.example.com/packages" },
  { type: "git", url: "ssh://git@git.example.com:99999/recipe.git" },
  { type: "vcs", url: "git@-host:recipe.git" },
  { type: "vcs", url: "git@git.example.com:" },
  { type: "vcs", url: "git@git.example.com:recipe.git --upload-pack=other" },
  { canonical: "false", type: "composer", url: "https://packages.example.com" },
  {
    options: { reference: "invalid" },
    type: "path",
    url: "recipes/search",
  },
  {
    options: { versions: { invalid: "^1" } },
    type: "path",
    url: "recipes/search",
  },
])("invalid Composer repository: $url", (repository) => {
  it.effect("rejects unsafe or unsupported declarations before editing", () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* addition;
        const item = registryItem([], false);
        yield* fs.writeFileString(
          "/application/search.json",
          encode({
            ...item,
            meta: {
              nextHydra: {
                ...item.meta.nextHydra,
                composer: [
                  { cwd: "apps/backend", repositories: { recipe: repository } },
                ],
              },
            },
          })
        );
        expect(
          yield* workspace
            .add({ overwrite: false, reference: "search.json" })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect(yield* fs.readFileString(`${backend}/composer.json`)).toBe(
          encode(initial)
        );
        expect(yield* fs.readFileString(`${backend}/composer.lock`)).toBe(
          lockfile
        );
      }).pipe(Effect.provide(layer));
    })
  );
});

describe.each(["curl", "ext-", "php-unknown", "vendor/tool/extra"])(
  "invalid Composer requirement: %s",
  (name) => {
    it.effect("rejects the registry before editing the manifest", () =>
      Effect.gen(function* () {
        const layer = yield* memoryWorkspace("application");
        yield* Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const workspace = yield* addition;
          yield* fs.writeFileString(
            "/application/search.json",
            encode(
              registryItem(
                [{ cwd: "apps/backend", require: { [name]: "*" } }],
                false
              )
            )
          );
          expect(
            yield* workspace
              .add({ overwrite: false, reference: "search.json" })
              .pipe(Effect.flip)
          ).toMatchObject({ _tag: "InvalidComposition" });
          expect(yield* fs.readFileString(`${backend}/composer.json`)).toBe(
            encode(initial)
          );
        }).pipe(Effect.provide(layer));
      })
    );
  }
);

const invalidContributions: readonly ComposerContribution[] = [
  { cwd: "../outside", require: { "vendor/client": "^2" } },
  {
    cwd: "apps/backend",
    repositories: { unsafe: { type: "path", url: "../../outside" } },
  },
  {
    cwd: "apps/backend",
    repositories: {
      unsafe: { type: "composer", url: "https://user:secret@example.com" },
    },
  },
  { cwd: "apps/backend", require: { "application/search": "^3" } },
  { cwd: "apps/backend", "require-dev": { "application/search": "*@dev" } },
];
describe.each(invalidContributions)(
  "invalid Composer declaration: $cwd",
  (invalid) => {
    it.effect(
      "rejects the declaration before publishing any project files",
      () =>
        Effect.gen(function* () {
          const layer = yield* memoryWorkspace("application");
          yield* Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            yield* fs.writeFileString(
              "/source/php.json",
              encode(registryItem([search, invalid]))
            );
            const workspace = yield* fresh(["/source/php.json"]);
            expect(
              yield* workspace
                .materialize({ install: "skip" })
                .pipe(Effect.flip)
            ).toMatchObject({ _tag: "InvalidComposition" });
            expect(yield* fs.exists("/application")).toBeFalsy();
          }).pipe(Effect.provide(layer));
        })
    );
  }
);
