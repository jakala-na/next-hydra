# Dependency patches

## NEMO 3.0.1

`@zanreal__nemo@3.0.1.patch` extends the terminal-response cookie handling from [upstream #184](https://github.com/zanreal-labs/nemo/issues/184) to explicit response headers. Each chain records those headers alongside NEMO's existing request carrier; request forwarding and header visibility to later middleware remain unchanged.

Rewrites, redirects, and other terminal middleware responses retain earlier response headers. Later explicit response values win, including for `Vary`, and upstream cookie handling is retained. Request overrides and `x-middleware-*` controls are excluded from the added response-header collection. Normal completion and custom error-handler behavior are unchanged.

The published entry point is minified. The patch adds a readable internal helper and connects it to `executeMiddlewareChain`; it adds no public API. The web app's `lib/proxy-chain.test.ts` covers the patch with the actual next-intl middleware. Remove the patch when an upstream release passes those regression tests without it.
