import { createApiBuilderFromCtpClient } from "@commercetools/platform-sdk";
import { ClientBuilder } from "@commercetools/ts-client";
import "dotenv/config";
import { keys } from "../keys.ts";

const CONTAINER = "b2b-registration-by-id";
const PAGE_SIZE = 100;

function createApiRoot() {
  const env = keys();
  const authHost = `https://auth.${env.COMMERCETOOLS_REGION}.commercetools.com`;
  const apiHost = `https://api.${env.COMMERCETOOLS_REGION}.commercetools.com`;

  const client = new ClientBuilder()
    .withProjectKey(env.COMMERCETOOLS_PROJECT_KEY)
    .withClientCredentialsFlow({
      host: authHost,
      projectKey: env.COMMERCETOOLS_PROJECT_KEY,
      credentials: {
        clientId: env.COMMERCETOOLS_CLIENT_ID,
        clientSecret: env.COMMERCETOOLS_CLIENT_SECRET,
      },
      scopes: env.COMMERCETOOLS_SCOPE.split(" "),
      httpClient: fetch,
    })
    .withHttpMiddleware({
      host: apiHost,
      httpClient: fetch,
      enableRetry: true,
      retryConfig: {
        maxRetries: 3,
        retryDelay: 200,
        backoff: false,
        retryCodes: [500, 503],
      },
    })
    .build();

  return createApiBuilderFromCtpClient(client).withProjectKey({
    projectKey: env.COMMERCETOOLS_PROJECT_KEY,
  });
}

const apiRoot = createApiRoot();

async function listBatch() {
  const response = await apiRoot
    .customObjects()
    .withContainer({ container: CONTAINER })
    .get({
      queryArgs: {
        limit: PAGE_SIZE,
        withTotal: false,
      },
    })
    .execute();

  return response.body.results.map((result) => ({
    key: result.key,
    version: result.version,
  }));
}

async function deleteEntry(key: string, version: number) {
  await apiRoot
    .customObjects()
    .withContainerAndKey({ container: CONTAINER, key })
    .delete({
      queryArgs: {
        version,
      },
    })
    .execute();
}

async function main() {
  let deleted = 0;

  while (true) {
    const batch = await listBatch();

    if (batch.length === 0) {
      break;
    }

    for (const entry of batch) {
      await deleteEntry(entry.key, entry.version);
      deleted += 1;
      console.log(`Deleted ${entry.key}`);
    }
  }

  console.log(`Cleared ${deleted} custom object(s) from ${CONTAINER}`);
}

main().catch((error) => {
  console.error("Failed to clear registration custom objects", error);
  process.exitCode = 1;
});
