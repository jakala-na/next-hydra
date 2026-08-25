/**
 * Vitest alias target for `server-only`.
 * The real package throws when imported outside a React Server Component graph;
 * tests run in Node/jsdom, so we resolve it to a no-op module instead of vi.mock.
 */
module.exports = {};
