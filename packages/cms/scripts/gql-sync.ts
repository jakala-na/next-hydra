import path from 'node:path';
import {
  generateOutput,
  generateSchema,
  generateTurbo,
} from '@gql.tada/cli-utils';
import { keys } from '../keys.ts';
import 'dotenv/config';

(async () => {
  try {
    console.log('\n🚀 Generating GraphQL Schema');
    const graphqlHostName = 'graphql.contentstack.com';

    const graphqlEndpoint = `https://${graphqlHostName}/stacks/${keys().CONTENTSTACK_API_KEY}?environment=${keys().CONTENTSTACK_ENVIRONMENT}`;
    await generateSchema({
      input: graphqlEndpoint,
      output: path.join(process.cwd(), 'gql/schema.graphql'),
      headers: {
        access_token: keys().CONTENTSTACK_DELIVERY_TOKEN,
      },
      tsconfig: undefined,
    });

    console.log('\n🚀 Generating Types');
    await generateOutput({
      output: undefined,
      disablePreprocessing: false,
      tsconfig: undefined,
    });

    console.log('\n🚀 Generating Cache');
    await generateTurbo({
      output: undefined,
      failOnWarn: false,
      tsconfig: undefined,
    });
  } catch (error) {
    console.error(error);
  }
})();
