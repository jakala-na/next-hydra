import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  groupSetupInstructions,
  renderSetupInstructions,
} from "../src/setup-instructions.ts";
import { Workspaces } from "../src/workspaces.ts";
import { liveWorkspace } from "./fixtures/live-workspace.ts";

const SearchExports = Schema.Struct({
  searchableContentTypes: Schema.Array(
    Schema.Struct({
      uid: Schema.String,
      label: Schema.String,
      searchTextRoot: Schema.String,
      instructions: Schema.Array(Schema.String),
    })
  ),
});

it.live(
  "materializes recipe-owned search definitions and setup only for the selected integrations",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const sourceRoot = yield* path.fromFileUrl(
          new URL("../../../", import.meta.url)
        );
        const temporaryRoot = yield* fs.makeTempDirectoryScoped({
          prefix: "search-composition-",
        });
        const workspaces = yield* Workspaces;
        const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
        for (const { name, providers } of [
          { name: "cms", providers: { cms: "contentstack" } },
          {
            name: "auth-workos",
            providers: { cms: "contentstack", auth: "workos" },
          },
          {
            name: "auth-clerk",
            providers: { cms: "contentstack", auth: "clerk" },
          },
          {
            name: "search",
            providers: { cms: "contentstack", search: "algolia" },
          },
          {
            name: "commerce",
            providers: {
              cms: "contentstack",
              search: "algolia",
              commerce: "commercetools",
              auth: "workos",
            },
          },
          {
            name: "commerce-clerk",
            providers: {
              cms: "contentstack",
              search: "algolia",
              commerce: "commercetools",
              auth: "clerk",
            },
          },
        ]) {
          const hasSearch = providers.search !== undefined;
          const hasCommerce = providers.commerce !== undefined;
          const hasAuth = providers.auth !== undefined;
          const destination = path.join(temporaryRoot, name);
          const workspace = yield* workspaces.fresh({
            destination,
            name,
            selection: { providers, addOns: [] },
            source: { kind: "working-tree", root: sourceRoot },
          });
          const result = yield* workspace.materialize({ install: "skip" });
          const groups = groupSetupInstructions(result.instructions);
          expect(groups.map((group) => group.group)).toEqual([
            "cms",
            ...(hasAuth ? ["auth"] : []),
            ...(hasCommerce ? ["commerce", "payments", "email"] : []),
            ...(hasSearch ? ["search"] : []),
            "analytics",
            "observability",
          ]);
          expect(
            groups.find((group) => group.group === "observability")?.optional
          ).toBe(true);
          expect(
            groups.find((group) => group.group === "analytics")?.optional
          ).not.toBe(true);
          expect(
            yield* fs.exists(
              path.join(destination, "packages/analytics/README.md")
            )
          ).toBe(true);
          expect(
            yield* fs.exists(
              path.join(destination, "packages/observability/README.md")
            )
          ).toBe(true);
          const instructions = renderSetupInstructions(result.instructions, {
            color: false,
            width: 88,
          });
          expect(instructions).not.toContain(
            "projected prices as authoritative"
          );
          expect(instructions.includes("Payments · Stripe")).toBe(hasCommerce);
          expect(instructions.includes("Email · Resend")).toBe(hasCommerce);
          if (hasAuth) {
            const auth = groups.find((group) => group.group === "auth");
            expect(auth?.title).toBe(
              providers.auth === "clerk"
                ? "Identity · Clerk"
                : "Identity · WorkOS"
            );
            expect(auth?.steps.map(({ id }) => id)).toEqual([
              "auth.configure",
              ...(hasCommerce ? ["auth.admin", "auth.provision"] : []),
            ]);
            expect(yield* fs.exists(path.join(destination, "apps/admin"))).toBe(
              hasCommerce
            );
            expect(yield* fs.exists(path.join(destination, "apps/api"))).toBe(
              hasCommerce
            );
            expect(
              yield* fs.exists(
                path.join(
                  destination,
                  `apps/api/app/api/webhooks/${providers.auth}/route.ts`
                )
              )
            ).toBe(hasCommerce);
            expect(instructions.includes("cli auth provision")).toBe(
              hasCommerce
            );
            expect(
              yield* fs.exists(
                path.join(
                  destination,
                  `packages/auth-${providers.auth}/README.md`
                )
              )
            ).toBe(true);
            if (!hasCommerce) {
              const authInstructions = renderSetupInstructions(
                result.instructions.filter(
                  (instruction) =>
                    "setup" in instruction && instruction.setup.group === "auth"
                ),
                { color: false, width: 88 }
              );
              expect(authInstructions).toContain("apps/web");
              expect(authInstructions).not.toMatch(/admin|webhook|--api-url/iu);
            }
          }
          if (hasCommerce) {
            expect(instructions).toContain("STRIPE_SECRET_KEY");
            expect(instructions).toContain("RESEND_TOKEN");
            expect(
              yield* fs.exists(
                path.join(destination, "packages/payments-stripe/README.md")
              )
            ).toBe(true);
            expect(
              yield* fs.exists(
                path.join(destination, "packages/email/README.md")
              )
            ).toBe(true);
          }

          if (hasSearch) {
            expect(instructions.match(/cli search provision/gu)).toHaveLength(
              1
            );
            expect(
              instructions.includes("Prepare Commerce indexing access")
            ).toBe(hasCommerce);
            expect(instructions).toContain("--locale <locale>");
          }
          const cms = path.join(destination, "packages/cms-contentstack");
          const aggregate = path.join(cms, "search-content-types.ts");
          expect(yield* fs.exists(aggregate)).toBe(hasSearch);
          expect(
            yield* fs.exists(
              path.join(cms, "recipe/search/product-collection.ts")
            )
          ).toBe(hasCommerce);
          if (!hasSearch) continue;
          const moduleUrl = yield* path.toFileUrl(aggregate);
          const loaded = yield* processes.string(
            ChildProcess.make(process.execPath, [
              "--input-type=module",
              "-e",
              `const result = await import(${JSON.stringify(moduleUrl.href)}); console.log(JSON.stringify(result));`,
            ])
          );
          const { searchableContentTypes } = yield* Schema.decodeEffect(
            Schema.fromJsonString(SearchExports)
          )(loaded);
          expect(searchableContentTypes.map(({ uid }) => uid)).toEqual([
            "landing_page",
          ]);
          expect(
            JSON.stringify(searchableContentTypes).includes("Commerce category")
          ).toBe(hasCommerce);
          const wrapper = yield* fs.readFileString(path.join(cms, "search.ts"));
          const installer = yield* fs.readFileString(
            path.join(cms, "cli/content-search-app/index.ts")
          );
          expect(wrapper).toContain(
            "createContentstackSearch(searchableContentTypes)"
          );
          expect(installer).toMatch(
            /createContentSearchAppInstaller\(\s*searchableContentTypes\s*\)/u
          );
        }
      })
    ).pipe(Effect.provide(liveWorkspace), Effect.provide(NodeServices.layer)),
  60_000
);
