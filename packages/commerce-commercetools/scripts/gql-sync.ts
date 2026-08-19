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
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: `manage_shopping_lists:${keys().COMMERCETOOLS_PROJECT_KEY}`,
        }),
        headers: {
          Authorization: `Basic ${Buffer.from(`${keys().COMMERCETOOLS_CLIENT_ID}:${keys().COMMERCETOOLS_CLIENT_SECRET}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      }
    );

    const authData = await authResponse.json();

    console.log("\n🚀 Generating GraphQL Schema");
    await generateSchema({
      headers: {
        Authorization: `${authData.token_type} ${authData.access_token}`,
      },
      input: `https://api.${keys().COMMERCETOOLS_REGION}.commercetools.com/${keys().COMMERCETOOLS_PROJECT_KEY}/graphql`,
      output: path.join(process.cwd(), "gql/schema.graphql"),
      tsconfig: undefined,
    });

    console.log("\n🚀 Generating Types");
    await generateOutput({
      disablePreprocessing: false,
      output: undefined,
      tsconfig: undefined,
    });

    console.log("\n🚀 Generating Cache");
    await generateTurbo({
      failOnWarn: false,
      output: undefined,
      tsconfig: undefined,
    });
  } catch (error) {
    console.error(error);
  }
})();
