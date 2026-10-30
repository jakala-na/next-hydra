import type { NextTask } from "@repo/cli-core/output-model";
import type { ConfiguredContentSearchMapping } from "@repo/search/content-search-app";

export interface ContentIndexingHandoffContext {
  readonly appInstalled: boolean;
  readonly credentialsLocation: string;
  readonly configuredMappings?: readonly ConfiguredContentSearchMapping[];
}

export interface ContentIndexingHandoff {
  readonly tasks: readonly NextTask[];
  readonly title: string;
}
