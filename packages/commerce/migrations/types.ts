import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";

export type Migration = {
  readonly name: string;
  readonly description: string;
  readonly fileName: string;
  readonly key: string;
  readonly up: (apiRoot: ByProjectKeyRequestBuilder) => Promise<void>;
};

export type MigrationDefinition = Omit<Migration, "fileName" | "key">;
