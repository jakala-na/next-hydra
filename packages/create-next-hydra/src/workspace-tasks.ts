import path from "node:path";

import { workspaceNonSourceDirectories } from "./workspace-artifacts.js";
import { isEnvironmentFile } from "./workspace-files.js";

/** Cache correctness is application policy, shared by customer and named workspaces regardless of deployment location. */
export function workspaceTaskConfiguration(
  files: Iterable<[string, { content: string | Uint8Array }]>
) {
  const environment = new Set([
    "ANALYZE",
    "NODE_ENV",
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "NEXT_PUBLIC_*",
  ]);
  for (const [target, file] of files) {
    const name = path.posix.basename(target);
    if (name !== ".env.example" && !isEnvironmentFile(name)) {
      continue;
    }
    for (const match of Buffer.from(file.content)
      .toString()
      .matchAll(/^\s*(?:export\s+)?(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*=/gmu)) {
      if (match.groups?.name) {
        environment.add(match.groups.name);
      }
    }
  }
  // Explicit inputs also hash sources under a Git-ignored named workspace, including file links.
  const inputs = [
    "**/*",
    ...[...workspaceNonSourceDirectories].map(
      (directory) => `!**/${directory}/**`
    ),
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
