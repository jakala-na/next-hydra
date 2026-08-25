import path from "node:path";

import {
  generateOutput,
  generateSchema,
  generateTurbo,
} from "@gql.tada/cli-utils";

import { keys } from "../keys.ts";
import "dotenv/config";

(async () => {
  try {
    console.log("\n🚀 Generating GraphQL Schema");
    const graphqlHostName = "graphql.contentstack.com";

    const graphqlEndpoint = `https://${graphqlHostName}/stacks/${keys().CONTENTSTACK_API_KEY}?environment=${keys().CONTENTSTACK_ENVIRONMENT}`;
    await generateSchema({
      headers: {
        access_token: keys().CONTENTSTACK_DELIVERY_TOKEN,
      },
      input: graphqlEndpoint,
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
