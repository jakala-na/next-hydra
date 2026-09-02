import type { Page } from "@repo/e2e-testing";

export interface SearchStoreContext {
  readonly currency: string;
  readonly locale: string;
  readonly storeKey: string;
}

const searchStores = new WeakMap<Page, SearchStoreContext>();

export const defineSearchStore = (
  page: Page,
  store: SearchStoreContext
): void => {
  searchStores.set(page, store);
};

export const requireSearchStore = (page: Page): SearchStoreContext => {
  const store = searchStores.get(page);
  if (store === undefined) {
    throw new Error("The scenario does not define a Product search Store");
  }
  return store;
};
