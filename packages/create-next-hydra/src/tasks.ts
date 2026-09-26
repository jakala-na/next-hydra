import { cacheDirectories, environmentFileType } from "./file-policy.ts";
import type { PreparedFile } from "./model.ts";

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
export function applicationTasks(files: readonly PreparedFile[]) {
  const environment = new Set([
    "ANALYZE",
    "NODE_ENV",
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "NEXT_PUBLIC_*",
  ]);
  for (const file of files) {
    if (environmentFileType(file.target) === undefined) {
      continue;
    }
    for (const match of new TextDecoder()
      .decode(file.content)
      .matchAll(/^\s*(?:export\s+)?(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*=/gmu)) {
      if (match.groups?.name) {
        environment.add(match.groups.name);
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
  return {
    envMode: "loose",
    futureFlags: { affectedUsingTaskInputs: true },
    globalEnv: [...environment],
    tasks: {
      build: {
        dependsOn: ["^build", "typecheck", "test"],
        // Sentry uploads run during the build, so changed destinations or credentials must retry them.
        env: ["SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_AUTH_TOKEN"],
        inputs,
        outputs: [".next/**", "!.next/cache/**", "!.next/dev/**"],
      },
      dev: {
        cache: false,
        passThroughEnv: ["PORTLESS_*"],
        persistent: true,
      },
      e2e: { cache: false },
      "e2e:list": { cache: false },
      test: { dependsOn: ["^test"], inputs },
      typecheck: { dependsOn: ["^typecheck"], inputs },
    },
  };
}
