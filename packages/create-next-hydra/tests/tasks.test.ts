import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { applicationTasks } from "../src/tasks.ts";

describe("application task environment", () => {
  it.effect(
    "preserves the test and typecheck gates for application-specific builds",
    () =>
      Effect.gen(function* () {
        const config = yield* applicationTasks([
          {
            content: new TextEncoder().encode('{"name":"web"}'),
            mode: 0o644,
            target: "apps/web/package.json",
          },
        ]);
        expect(config.tasks["web#build"]?.dependsOn).toEqual(
          expect.arrayContaining(["test", "typecheck", "^build"])
        );
      })
  );
  it.effect("confines deployment variables to builds", () =>
    Effect.gen(function* () {
      const config = yield* applicationTasks([]);
      expect(config).not.toHaveProperty("globalEnv");
      expect(config.tasks.build.env).toContain("VERCEL_PROJECT_PRODUCTION_URL");
      expect([config.tasks.test.env, config.tasks.typecheck.env]).toEqual([
        ["!NEXT_PUBLIC_*"],
        ["!NEXT_PUBLIC_*"],
      ]);
      expect(config.tasks.test.inputs).toEqual(
        expect.arrayContaining(["!**/.env", "!**/.env.*"])
      );
    })
  );

  it.effect(
    "scopes private variables to each application's dependency closure, resolving aliases and cycles",
    () =>
      Effect.gen(function* () {
        const files = [
          [
            "apps/web/package.json",
            '{"dependencies":{"@repo/cms":"workspace:@repo/cms-selected@*"},"name":"web"}',
          ],
          [
            "apps/api/package.json",
            '{"dependencies":{"@repo/shared":"workspace:*"},"name":"api"}',
          ],
          [
            "packages/cms-selected/package.json",
            '{"dependencies":{"@repo/shared":"workspace:*"},"name":"@repo/cms-selected"}',
          ],
          [
            "packages/shared/package.json",
            '{"dependencies":{"api":"workspace:*"},"name":"@repo/shared"}',
          ],
          [
            "apps/web/.env.example",
            "WEB_SECRET=example\nNEXT_PUBLIC_WEB_URL=https://example.com\n",
          ],
          ["packages/cms-selected/.env.example", "CMS_TOKEN=example\n"],
          ["packages/shared/.env.example", "SHARED_TOKEN=example\n"],
        ].map(([target = "", content = ""]) => ({
          content: new TextEncoder().encode(content),
          mode: 0o644,
          target,
        }));
        const config = yield* applicationTasks(files);
        expect(config.tasks["web#build"]?.env).toEqual(
          expect.arrayContaining(["CMS_TOKEN", "WEB_SECRET", "SHARED_TOKEN"])
        );
        expect(config.tasks["api#build"]?.env).toContain("SHARED_TOKEN");
        expect(
          config.tasks["api#build"]?.env.filter((name) =>
            ["CMS_TOKEN", "WEB_SECRET", "SHARED_TOKEN"].includes(name)
          )
        ).toEqual(["SHARED_TOKEN"]);
        expect(config.tasks.build.env).not.toContain("CMS_TOKEN");
        expect(
          config.tasks["web#build"]?.env.filter((name) =>
            name.startsWith("NEXT_PUBLIC_")
          )
        ).toEqual([]);
      })
  );
});
