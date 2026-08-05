import path from "node:path";
import {
  generateOutput,
  generateSchema,
  generateTurbo,
} from "@gql.tada/cli-utils";
import "dotenv/config";
import { getDrupalAccessToken } from "../auth.ts";
import { getDrupalGraphqlUri, keys } from "../keys.ts";

function ensureStageSucceeded(stage: string): void {
  if (process.exitCode && process.exitCode !== 0) {
    throw new Error(`${stage} failed`);
  }
}

async function main(): Promise<void> {
  process.stdout.write("\nGenerating Drupal GraphQL schema\n");
  const authorization = await getDrupalAccessToken("viewer");
  await generateSchema({
    headers: { Authorization: authorization },
    input: getDrupalGraphqlUri(keys()),
    output: path.join(process.cwd(), "gql/schema.graphql"),
    tsconfig: undefined,
  });
  ensureStageSucceeded("Drupal schema generation");

  process.stdout.write("\nGenerating gql.tada introspection\n");
  await generateOutput({
    disablePreprocessing: false,
    output: undefined,
    tsconfig: undefined,
  });
  ensureStageSucceeded("gql.tada introspection generation");

  process.stdout.write("\nGenerating gql.tada document cache\n");
  await generateTurbo({
    failOnWarn: false,
    output: undefined,
    tsconfig: undefined,
  });
  ensureStageSucceeded("gql.tada document cache generation");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
