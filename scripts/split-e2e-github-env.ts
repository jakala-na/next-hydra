import { randomUUID } from "node:crypto";
import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Build the dotenv files consumed by GitHub CLI from the three application
 * runtime files. Input order is significant: web, API, then admin.
 *
 * Generate the files from the repository root:
 *
 *   pnpm e2e:env:split \
 *     apps/web/.env.local \
 *     apps/api/.env.local \
 *     apps/admin/.env.local
 *
 * Upload them to the repository's `e2e` GitHub Environment:
 *
 *   gh secret set --repo jakala-na/next-hydra --env e2e \
 *     --env-file .env.github.secrets
 *   gh variable set --repo jakala-na/next-hydra --env e2e \
 *     --env-file .env.github.variables
 *
 * Both generated files are gitignored and written with mode 0600. Keep the
 * mapping below aligned with `.github/workflows/e2e.yml`.
 */
type GitHubEnvironmentValueKind = "secret" | "variable";
type Application = "admin" | "api" | "web";
type GitHubEnvironmentMapping = readonly [
  application: Application,
  sourceName: string,
  kind: GitHubEnvironmentValueKind,
  targetName: string,
];

const [firstInput, secondInput, thirdInput, ...extraInputs] =
  process.argv.slice(2);

if (
  firstInput === undefined ||
  secondInput === undefined ||
  thirdInput === undefined ||
  extraInputs.length > 0
) {
  process.stderr.write(
    "Usage: pnpm e2e:env:split <web.env> <api.env> <admin.env>\n"
  );
  process.exit(1);
}

// Snapshot of the GitHub Environment mappings in .github/workflows/e2e.yml.
// Each source names its owning application because generic provider names have
// different meanings in the customer and isolated admin runtimes.
const githubEnvironmentMappings = [
  ["api", "ADMIN_WORKOS_API_KEY", "secret", "ADMIN_WORKOS_API_KEY"],
  ["api", "ADMIN_WORKOS_CLIENT_ID", "secret", "ADMIN_WORKOS_CLIENT_ID"],
  ["admin", "WORKOS_COOKIE_PASSWORD", "secret", "ADMIN_WORKOS_COOKIE_PASSWORD"],
  ["api", "COMMERCETOOLS_CLIENT_ID", "secret", "COMMERCETOOLS_CLIENT_ID"],
  [
    "api",
    "COMMERCETOOLS_CLIENT_SECRET",
    "secret",
    "COMMERCETOOLS_CLIENT_SECRET",
  ],
  ["api", "COMMERCETOOLS_PROJECT_KEY", "secret", "COMMERCETOOLS_PROJECT_KEY"],
  ["api", "COMMERCETOOLS_REGION", "variable", "COMMERCETOOLS_REGION"],
  ["api", "COMMERCETOOLS_SCOPE", "secret", "COMMERCETOOLS_SCOPE"],
  ["web", "CONTENTSTACK_API_KEY", "secret", "CONTENTSTACK_API_KEY"],
  [
    "web",
    "CONTENTSTACK_DELIVERY_TOKEN",
    "secret",
    "CONTENTSTACK_DELIVERY_TOKEN",
  ],
  ["web", "CONTENTSTACK_ENVIRONMENT", "variable", "CONTENTSTACK_ENVIRONMENT"],
  ["web", "CONTENTSTACK_PREVIEW_TOKEN", "secret", "CONTENTSTACK_PREVIEW_TOKEN"],
  [
    "web",
    "CONTENTSTACK_WEBHOOK_SECRET",
    "secret",
    "CONTENTSTACK_WEBHOOK_SECRET",
  ],
  ["web", "NEXT_PUBLIC_POSTHOG_HOST", "variable", "NEXT_PUBLIC_POSTHOG_HOST"],
  ["web", "NEXT_PUBLIC_POSTHOG_KEY", "secret", "NEXT_PUBLIC_POSTHOG_KEY"],
  [
    "api",
    "REGISTRATION_APPROVER_EMAIL",
    "variable",
    "REGISTRATION_APPROVER_EMAIL",
  ],
  ["api", "RESEND_FROM", "variable", "RESEND_FROM"],
  ["api", "RESEND_TOKEN", "secret", "RESEND_TOKEN"],
  ["api", "WORKOS_API_KEY", "secret", "WORKOS_API_KEY"],
  ["api", "WORKOS_CLIENT_ID", "secret", "WORKOS_CLIENT_ID"],
  ["web", "WORKOS_COOKIE_PASSWORD", "secret", "WORKOS_COOKIE_PASSWORD"],
  ["api", "WORKOS_WEBHOOK_SECRET", "secret", "WORKOS_WEBHOOK_SECRET"],
] as const satisfies readonly GitHubEnvironmentMapping[];

const readInput = (input: string) => {
  const inputPath = path.resolve(input);
  return parseEnv(readFileSync(inputPath, "utf-8"));
};

const inputs = {
  admin: readInput(thirdInput),
  api: readInput(secondInput),
  web: readInput(firstInput),
};

const resolved = {
  secret: new Map<string, string>(),
  variable: new Map<string, string>(),
};

for (const [
  application,
  sourceName,
  kind,
  targetName,
] of githubEnvironmentMappings) {
  const value = inputs[application][sourceName];
  if (value === undefined) {
    continue;
  }

  const existingValue = resolved[kind].get(targetName);
  if (existingValue !== undefined && existingValue !== value) {
    throw new Error(
      `The e2e mapping assigns conflicting ${application} values to ${kind}s.${targetName}`
    );
  }

  resolved[kind].set(targetName, value);
}

const formatDotenv = (values: ReadonlyMap<string, string>): string =>
  [...values.entries()]
    // This sorts a fresh array created from the map; the input is not mutated.
    // oxlint-disable-next-line unicorn/no-array-sort
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join("\n") + (values.size === 0 ? "" : "\n");

const writePrivateFile = (filename: string, contents: string): void => {
  const outputPath = path.resolve(filename);
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${randomUUID()}.tmp`
  );

  writeFileSync(temporaryPath, contents, { encoding: "utf-8", mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, outputPath);
  chmodSync(outputPath, 0o600);
};

writePrivateFile(".env.github.secrets", formatDotenv(resolved.secret));
writePrivateFile(".env.github.variables", formatDotenv(resolved.variable));

process.stdout.write(
  `Wrote ${resolved.secret.size} secrets to .env.github.secrets and ${resolved.variable.size} variables to .env.github.variables.\n`
);
