/* oxlint-disable no-console -- Schema synchronization reports progress. */

import path from "node:path";

import {
  generateOutput,
  generateSchema,
  generateTurbo,
} from "@gql.tada/cli-utils";
import "dotenv/config";

import { keys } from "../keys.ts";

(async () => {
  try {
    const authResponse = await fetch(
      `https://auth.${keys().COMMERCETOOLS_REGION}.commercetools.com/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${keys().COMMERCETOOLS_CLIENT_ID}:${keys().COMMERCETOOLS_CLIENT_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: `manage_shopping_lists:${keys().COMMERCETOOLS_PROJECT_KEY}`,
        }),
      }
    );

    const authData = await authResponse.json();

    console.log("\n🚀 Generating GraphQL Schema");
    await generateSchema({
      input: `https://api.${keys().COMMERCETOOLS_REGION}.commercetools.com/${keys().COMMERCETOOLS_PROJECT_KEY}/graphql`,
      output: path.join(process.cwd(), "gql/schema.graphql"),
      headers: {
        Authorization: `${authData.token_type} ${authData.access_token}`,
      },
      tsconfig: undefined,
    });

    console.log("\n🚀 Generating Types");
    await generateOutput({
      output: undefined,
      disablePreprocessing: false,
      tsconfig: undefined,
    });

    console.log("\n🚀 Generating Cache");
    await generateTurbo({
      output: undefined,
      failOnWarn: false,
      tsconfig: undefined,
    });
  } catch (error) {
    console.error(error);
  }
})();
