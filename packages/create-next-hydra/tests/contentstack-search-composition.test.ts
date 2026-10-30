import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import ts from "typescript";

import {
  groupSetupInstructions,
  renderSetupInstructions,
} from "../src/setup-instructions.ts";
import { Workspaces } from "../src/workspaces.ts";
import { liveWorkspace } from "./fixtures/live-workspace.ts";

const SearchExports = Schema.Struct({
  searchableContentTypes: Schema.Array(
    Schema.Struct({
      instructions: Schema.Array(Schema.String),
      label: Schema.String,
      searchTextRoot: Schema.String,
      uid: Schema.String,
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
            providers: { auth: "workos", cms: "contentstack" },
          },
          {
            name: "auth-clerk",
            providers: { auth: "clerk", cms: "contentstack" },
          },
          {
            name: "search",
            providers: { cms: "contentstack", search: "algolia" },
          },
          {
            name: "commerce",
            providers: {
              auth: "workos",
              cms: "contentstack",
              commerce: "commercetools",
              search: "algolia",
            },
          },
          {
            name: "commerce-clerk",
            providers: {
              auth: "clerk",
              cms: "contentstack",
              commerce: "commercetools",
              search: "algolia",
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
            selection: { addOns: [], providers },
            source: { kind: "working-tree", root: sourceRoot },
          });
          const result = yield* workspace.materialize({ install: "skip" });
          const groups = groupSetupInstructions(result.instructions);
          const instructions = renderSetupInstructions(result.instructions, {
            color: false,
            width: 88,
          });
          const expectedAuthTitle =
            providers.auth === "clerk"
              ? "Identity · Clerk"
              : "Identity · WorkOS";
          const auth = groups.find((group) => group.group === "auth");
          const authInstructions = renderSetupInstructions(
            result.instructions.filter(
              (instruction) =>
                "setup" in instruction && instruction.setup.group === "auth"
            ),
            { color: false, width: 88 }
          );
          expect({
            groups: groups.map((group) => group.group),
            monitoringOptional: groups.find(
              (group) => group.group === "observability"
            )?.optional,
            analyticsOptional:
              groups.find((group) => group.group === "analytics")?.optional ===
              true,
            analyticsDocs: yield* fs.exists(
              path.join(destination, "packages/analytics/README.md")
            ),
            monitoringDocs: yield* fs.exists(
              path.join(destination, "packages/observability/README.md")
            ),
            authTitle: auth?.title,
            authSteps: auth?.steps.map(({ id }) => id),
            adminApp: yield* fs.exists(path.join(destination, "apps/admin")),
            apiApp: yield* fs.exists(path.join(destination, "apps/api")),
            authWebhook: yield* fs.exists(
              path.join(
                destination,
                `apps/api/app/api/webhooks/${providers.auth}/route.ts`
              )
            ),
            authDocs:
              hasAuth &&
              (yield* fs.exists(
                path.join(
                  destination,
                  `packages/auth-${providers.auth}/README.md`
                )
              )),
            authWebSetup: !hasAuth || authInstructions.includes("apps/web"),
            authAdminSetup: /admin|webhook|--api-url/iu.test(authInstructions),
          }).toEqual({
            groups: [
              "cms",
              ...(hasAuth ? ["auth"] : []),
              ...(hasCommerce ? ["commerce", "payments", "email"] : []),
              ...(hasSearch ? ["search"] : []),
              "analytics",
              "observability",
            ],
            monitoringOptional: true,
            analyticsOptional: false,
            analyticsDocs: true,
            monitoringDocs: true,
            authTitle: hasAuth ? expectedAuthTitle : undefined,
            authSteps: hasAuth
              ? [
                  "auth.configure",
                  ...(hasCommerce ? ["auth.admin", "auth.provision"] : []),
                ]
              : undefined,
            adminApp: hasCommerce,
            apiApp: hasCommerce,
            authWebhook: hasCommerce,
            authDocs: hasAuth,
            authWebSetup: true,
            authAdminSetup: hasCommerce,
          });
          expect({
            priceWarning: instructions.includes(
              "projected prices as authoritative"
            ),
            payments: instructions.includes("Payments · Stripe"),
            email: instructions.includes("Email · Resend"),
            stripeKey: instructions.includes("STRIPE_SECRET_KEY"),
            resendToken: instructions.includes("RESEND_TOKEN"),
            authProvision: instructions.includes("cli auth provision"),
            searchProvisionCount:
              instructions.match(/cli search provision/gu)?.length ?? 0,
            commerceIndexing: instructions.includes(
              "Prepare Commerce indexing access"
            ),
            explicitLocale: instructions.includes("--locale <locale>"),
            paymentsDocs: yield* fs.exists(
              path.join(destination, "packages/payments-stripe/README.md")
            ),
            emailDocs: yield* fs.exists(
              path.join(destination, "packages/email/README.md")
            ),
          }).toEqual({
            priceWarning: false,
            payments: hasCommerce,
            email: hasCommerce,
            stripeKey: hasCommerce,
            resendToken: hasCommerce,
            authProvision: hasCommerce,
            searchProvisionCount: Number(hasSearch),
            commerceIndexing: hasCommerce,
            explicitLocale: hasSearch,
            paymentsDocs: hasCommerce,
            emailDocs: true,
          });
          const cms = path.join(destination, "packages/cms-contentstack");
          const aggregate = path.join(cms, "search-content-types.ts");
          expect({
            aggregate: yield* fs.exists(aggregate),
            commerceRecipe: yield* fs.exists(
              path.join(cms, "recipe/search/product-collection.ts")
            ),
          }).toEqual({ aggregate: hasSearch, commerceRecipe: hasCommerce });
          if (!hasSearch) {
            continue;
          }
          // Resolve the actual application's config through its selected packages,
          // without installing the full application dependency graph.
          const configModules = path.join(destination, "node_modules/@repo");
          yield* fs.makeDirectory(configModules, { recursive: true });
          for (const { alias, directory } of [
            { alias: "typescript-config", directory: "typescript-config" },
            { alias: "cms", directory: "cms-contentstack" },
          ]) {
            yield* fs.symlink(
              path.join(destination, "packages", directory),
              path.join(configModules, alias)
            );
          }
          const configFile = path.join(destination, "apps/web/tsconfig.json");
          const config = ts.readConfigFile(configFile, (file) =>
            ts.sys.readFile(file)
          );
          const parsed = ts.parseJsonConfigFileContent(
            config.config,
            ts.sys,
            path.dirname(configFile)
          );
          const program = ts.createProgram([aggregate], {
            ...parsed.options,
            // These recipe definitions have no ambient Node or React dependency.
            types: [],
          });
          const diagnostics = [
            ...parsed.errors,
            ...ts.getPreEmitDiagnostics(program),
          ];
          expect({
            configError: config.error,
            diagnostics: diagnostics.map(
              (diagnostic) =>
                `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
            ),
          }).toEqual({ configError: undefined, diagnostics: [] });
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
          const wrapper = yield* fs.readFileString(path.join(cms, "search.ts"));
          const installer = yield* fs.readFileString(
            path.join(cms, "cli/content-search-app/index.ts")
          );
          expect({
            contentTypes: searchableContentTypes.map(({ uid }) => uid),
            commerceInstructions: JSON.stringify(
              searchableContentTypes
            ).includes("Commerce category"),
            searchUsesAggregate: wrapper.includes(
              "createContentstackSearch(searchableContentTypes)"
            ),
            installerUsesAggregate:
              /createContentSearchAppInstaller\(\s*searchableContentTypes\s*\)/u.test(
                installer
              ),
          }).toEqual({
            contentTypes: ["landing_page"],
            commerceInstructions: hasCommerce,
            searchUsesAggregate: true,
            installerUsesAggregate: true,
          });
        }
      })
    ).pipe(Effect.provide(liveWorkspace), Effect.provide(NodeServices.layer)),
  60_000
);
