import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Schema } from "effect";

import { prepareApplicationTypes } from "../src/application-typecheck.ts";

describe("Application type generation", () => {
  for (const { exitCode, existingEnvironment } of [
    { existingEnvironment: false, exitCode: 0 },
    { existingEnvironment: true, exitCode: 0 },
    { existingEnvironment: true, exitCode: 1 },
  ]) {
    it.live(
      `preserves authoring files during typegen with exit code ${exitCode} and existing environment ${existingEnvironment}`,
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const destination = path.join(root, "workspace");
          const web = path.join(destination, "apps/web");
          const config = path.join(web, "next.config.ts");
          const next = path.join(web, "node_modules/.bin/next");
          yield* fs.makeDirectory(path.dirname(next), { recursive: true });
          yield* fs.writeFileString(config, "// original config\n");
          yield* fs.writeFileString(path.join(web, "package.json"), "{}");
          yield* fs.writeFileString(path.join(web, "tsconfig.json"), "{}");
          if (existingEnvironment) {
            yield* fs.writeFileString(
              path.join(web, "next-env.d.ts"),
              "// existing environment\n"
            );
          }
          yield* fs.makeDirectory(path.join(web, "app"));
          yield* fs.writeFileString(
            path.join(web, "app/page.tsx"),
            "export default function Page() { return null; }"
          );
          const encodedConfig = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.String)
          )(config);
          const edited = "// saved by editor during typegen\n";
          const encodedEdit = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.String)
          )(edited);
          yield* fs.writeFileString(
            next,
            `#!${process.execPath}
const fs = require("node:fs");
fs.writeFileSync(${encodedConfig}, ${encodedEdit});
fs.writeFileSync("tsconfig.json", "// automatically updated by Next\\n");
fs.mkdirSync(".next/types", { recursive: true });
fs.writeFileSync(".next/types/routes.d.ts", "// generated routes\\n");
fs.writeFileSync("next-env.d.ts", "// generated environment\\n");
process.exit(${exitCode});
`
          );
          yield* fs.chmod(next, 0o755);
          if (exitCode === 0) {
            yield* prepareApplicationTypes(destination);
            expect(
              yield* fs.readFileString(
                path.join(web, ".next/types/routes.d.ts")
              )
            ).toBe("// generated routes\n");
            expect(
              yield* fs.readFileString(path.join(web, "next-env.d.ts"))
            ).toBe(
              existingEnvironment
                ? "// existing environment\n"
                : "// generated environment\n"
            );
          } else {
            expect(
              yield* prepareApplicationTypes(destination).pipe(Effect.flip)
            ).toMatchObject({ _tag: "ApplicationTaskFailed" });
          }
          expect(yield* fs.readFileString(config)).toBe(edited);
          if (existingEnvironment) {
            expect(
              yield* fs.readFileString(path.join(web, "next-env.d.ts"))
            ).toBe("// existing environment\n");
          }
          expect(
            yield* fs.readFileString(path.join(web, "tsconfig.json"))
          ).toBe("{}");
          expect(yield* fs.readDirectory(root)).toEqual(["workspace"]);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer))
    );
  }
});
