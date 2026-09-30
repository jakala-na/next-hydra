export interface SearchRouterLocation {
  readonly hash: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly port: string;
  readonly protocol: string;
}

export const createServerSearchLocation = (
  pathname: string
): SearchRouterLocation => ({
  hash: "",
  hostname: "localhost",
  pathname,
  port: "",
  protocol: "http:",
});

const EMPTY_ANCESTOR_ORIGINS: DOMStringList = {
  [Symbol.iterator]: () => new Array<string>()[Symbol.iterator](),
  contains: () => false,
  item: () => null,
  length: 0,
};

const rejectServerLocationMutation = (): never => {
  throw new Error("The server search location is read-only");
};

const createServerHistoryLocation = (serverUrl: string): Location =>
  Object.assign(new URL(serverUrl), {
    ancestorOrigins: EMPTY_ANCESTOR_ORIGINS,
    assign: rejectServerLocationMutation,
    reload: rejectServerLocationMutation,
    replace: rejectServerLocationMutation,
  });

export const getInstantSearchLocation = (serverUrl: string): Location => {
  if (globalThis.window !== undefined) {
    return globalThis.window.location;
  }

  // InstantSearch's history router only reads the URL fields shared by URL and
  // Location. Supplying the server URL keeps routing active during SSR without
  // accessing the browser-only window object.
  return createServerHistoryLocation(serverUrl);
};
