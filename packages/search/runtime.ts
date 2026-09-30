import "server-only";
import type { SearchRuntime } from "./runtime/make-search-runtime";

export { makeSearchRuntime } from "./runtime/make-search-runtime";
export type {
  SearchClientConfiguration,
  SearchRuntime,
  SearchRuntimeOptions,
} from "./runtime/make-search-runtime";

export class SearchRuntimeNotConfiguredError extends Error {
  override readonly name = "SearchRuntimeNotConfiguredError";

  constructor() {
    super("The Search application runtime is not configured");
  }
}

const unavailable = async (): Promise<never> =>
  await Promise.reject(new SearchRuntimeNotConfiguredError());

const unavailableClientConfiguration = (): never => {
  throw new SearchRuntimeNotConfiguredError();
};

/** The application replaces this binding through its exact runtime alias. */
export const searchRuntime: SearchRuntime = {
  getClientConfiguration: unavailableClientConfiguration,
  resolveAudience: unavailable,
  resolveProductAudience: unavailable,
  search: unavailable,
};
