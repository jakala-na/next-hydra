import { Effect, Schema } from "effect";

import { cacheDirectories, environmentFileType } from "./file-policy.ts";
import type { PreparedFile } from "./model.ts";
import { internalDependencies, ManifestJson } from "./packages.ts";

const nonSourceDirectories = [
  ...cacheDirectories,
  ".git",
  "coverage",
  ".features-gen",
  "playwright-report",
  "test-results",
  ".workflow-data",
];

/** Cache correctness is application policy, shared by customer and named workspaces regardless of deployment location. */
export const applicationTasks = Effect.fn("Composition.applicationTasks")(
  function* (files: readonly PreparedFile[]) {
    const buildEnvironment = [
      "ANALYZE",
      "NODE_ENV",
      "VERCEL",
      "VERCEL_ENV",
      "VERCEL_PROJECT_PRODUCTION_URL",
      // Sentry uploads must retry when their destination or credentials change.
      "SENTRY_ORG",
      "SENTRY_PROJECT",
      "SENTRY_AUTH_TOKEN",
    ];
    const packages = new Map<
      string,
      {
        directory: string;
        dependencies: readonly string[];
      }
    >();
    const environment = new Map<string, Set<string>>();
    for (const file of files) {
      if (
        file.target === "package.json" ||
        !file.target.endsWith("/package.json")
      ) {
        continue;
      }
      const manifest = yield* Schema.decodeEffect(ManifestJson)(
        new TextDecoder().decode(file.content)
      );
      if (manifest.name !== undefined) {
        packages.set(manifest.name, {
          dependencies: internalDependencies(manifest),
          directory: file.target.slice(0, -"/package.json".length),
        });
      }
    }
    for (const file of files) {
      if (environmentFileType(file.target) === undefined) {
        continue;
      }
      const directory = file.target
        .slice(0, file.target.lastIndexOf("/") + 1)
        .replace(/\/$/u, "");
      const names = environment.get(directory) ?? new Set<string>();
      environment.set(directory, names);
      for (const match of new TextDecoder()
        .decode(file.content)
        .matchAll(/^\s*(?:export\s+)?(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*=/gmu)) {
        if (
          match.groups?.name &&
          !match.groups.name.startsWith("NEXT_PUBLIC_")
        ) {
          names.add(match.groups.name);
        }
      }
    }
    // Explicit inputs include physical sources under Git-ignored development workspaces.
    const inputs = [
      "**/*",
      ...nonSourceDirectories.map((directory) => `!**/${directory}/**`),
      "!**/*.tsbuildinfo",
      "!next-env.d.ts",
      "!next.config.compiled.js",
      "!app/.well-known/workflow/**",
    ];
    const build = {
      dependsOn: ["^build", "typecheck", "test"],
      env: buildEnvironment,
      inputs,
      outputs: [".next/**", "!.next/cache/**", "!.next/dev/**"],
    };
    const builds: Record<`${string}#build`, typeof build> = {};
    for (const [name, app] of packages) {
      if (!app.directory.startsWith("apps/")) {
        continue;
      }
      const names = new Set([
        ...buildEnvironment,
        ...(environment.get("") ?? []),
      ]);
      const visited = new Set<string>();
      const collect = (packageName: string) => {
        if (visited.has(packageName)) {
          return;
        }
        visited.add(packageName);
        const selected = packages.get(packageName);
        if (selected === undefined) {
          return;
        }
        for (const [directory, variables] of environment) {
          if (
            directory === selected.directory ||
            directory.startsWith(`${selected.directory}/`)
          ) {
            for (const variable of variables) {
              names.add(variable);
            }
          }
        }
        for (const dependency of selected.dependencies) {
          collect(dependency);
        }
      };
      collect(name);
      // Root package-specific tasks replace the generic definition entirely.
      builds[`${name}#build`] = { ...build, env: [...names] };
    }
    // Unit tests use fixtures rather than deployment environment files.
    const testInputs = [...inputs, "!**/.env", "!**/.env.*"];
    const tasks = {
      build,
      dev: {
        cache: false,
        passThroughEnv: ["PORTLESS_*"],
        persistent: true,
      },
      e2e: { cache: false },
      "e2e:list": { cache: false },
      test: {
        dependsOn: ["^test"],
        env: ["!NEXT_PUBLIC_*"],
        inputs: testInputs,
      },
      typecheck: {
        dependsOn: ["^typecheck"],
        env: ["!NEXT_PUBLIC_*"],
        inputs,
      },
    };
    const scopedTasks: typeof tasks & typeof builds = { ...tasks, ...builds };
    return {
      envMode: "loose",
      futureFlags: { affectedUsingTaskInputs: true },
      tasks: scopedTasks,
    };
  }
);
