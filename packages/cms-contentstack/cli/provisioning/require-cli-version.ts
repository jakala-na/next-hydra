import { Effect } from "effect";

import { ContentstackCli } from "./contentstack-cli";
import { CONTENTSTACK_CLI_VERSION } from "./contentstack-cli-live";
import { ContentstackCliVersionError } from "./model";

export const requireSupportedContentstackCliVersion = Effect.fn(
  "ContentstackCli.requireSupportedVersion"
)(function* () {
  const cli = yield* ContentstackCli;
  const actual = yield* cli.version();
  const expectedPrefix = `@contentstack/cli/${CONTENTSTACK_CLI_VERSION} `;

  if (actual.startsWith(expectedPrefix)) {
    return yield* Effect.void;
  }

  return yield* new ContentstackCliVersionError({
    actual,
    cause: new Error(
      `Expected Contentstack CLI output to start with ${expectedPrefix}`
    ),
    expected: CONTENTSTACK_CLI_VERSION,
    message: "The installed Contentstack CLI version is not supported",
  });
});
