# Effect v4 aggregate OpenAPI with separate Next.js handlers

Date: 2026-08-14
Effect source reviewed: `Effect-TS/effect-smol` commit `6f38f07d5941a211b251383aaab0f4f55e8a6557` (`4.0.0-beta.67`)

## Answer

Yes: Effect's contract model supports one aggregate `HttpApi` graph for OpenAPI while the actual Next.js route handlers continue to run smaller child APIs independently.

The idiomatic split is:

1. Each domain package owns a declarative `HttpApi` contract.
2. The application composes those contracts with `addHttpApi` into one application API graph.
3. A documentation route calls `OpenApi.fromApi(applicationApi)` and returns the object as JSON.
4. Each physical Next route keeps using `HttpApiBuilder.layer(childApi)` with only that child's handler implementations.

The aggregate graph is a contract/documentation composition. It does **not** need to become the runtime router and does **not** require an aggregate handler `Layer`.

```ts
// apps/api/lib/openapi.ts
import { CheckoutHttpApi } from "@repo/commerce/http/checkout-api"
import { RegistrationHttpApi } from "@repo/registration/http/registration-api"
import { HttpApi, OpenApi } from "effect/unstable/httpapi"

export class ApplicationHttpApi extends HttpApi.make("application-http-api")
  .addHttpApi(CheckoutHttpApi)
  .addHttpApi(RegistrationHttpApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Next Hydra API",
      version: "1.0.0"
    })
  ) {}

export const applicationOpenApi = OpenApi.fromApi(ApplicationHttpApi)
```

```ts
// apps/api/app/openapi.json/route.ts
import { applicationOpenApi } from "../../lib/openapi"

export const GET = () => Response.json(applicationOpenApi)
```

The existing runtime handlers remain physically separate:

```ts
// checkout route runtime graph
HttpApiBuilder.layer(CheckoutHttpApi).pipe(
  Layer.provide(checkoutHandlers),
  Layer.provide(checkoutDependencies)
)

// registration route runtime graph
HttpApiBuilder.layer(RegistrationHttpApi).pipe(
  Layer.provide(registrationHandlers),
  Layer.provide(registrationDependencies)
)
```

That arrangement keeps OpenAPI complete without forcing the checkout catch-all route to know registration implementations, or vice versa.

## Why this is the Effect model

`HttpApi` is explicitly the declarative contract. Effect's module documentation says implementations are supplied separately through `HttpApiBuilder.group`, and that `HttpApiBuilder.layer` registers a completed API. The same module presents `addHttpApi` as the operation for combining APIs from multiple modules. [Source: `HttpApi.ts`, module contract and composition notes](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/HttpApi.ts#L1-L23) [Source: `HttpApi` interface](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/HttpApi.ts#L61-L107)

`OpenApi.fromApi` is a synchronous function whose only argument is an `HttpApi`. It reflects the contract into OpenAPI 3.1, caches the result by API object identity, and never asks for handler implementations, a `Layer`, a router, or platform services. [Source: `OpenApi.fromApi`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/OpenApi.ts#L225-L283) [Source: reflection and final cache](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/OpenApi.ts#L316-L573)

By contrast, `HttpApiBuilder.layer(api)` is the runtime registrar. Its required environment includes the group implementation services, router, filesystem, HTTP platform, path, and ETag generator. It walks every group in the supplied API and dies when a group implementation is absent. Therefore using `HttpApiBuilder.layer(ApplicationHttpApi)` only to obtain the full document would introduce exactly the unnecessary runtime coupling we want to avoid. [Source: `HttpApiBuilder.layer`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts#L73-L121)

Effect's Swagger integration confirms the intended separate-document seam: it derives and embeds the document with `OpenApi.fromApi`, installs no `/openapi.json` endpoint, and explicitly directs callers that need raw JSON to call `OpenApi.fromApi` or expose another JSON route. [Source: `HttpApiSwagger.ts`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/HttpApiSwagger.ts#L1-L17)

The first-party HTTP server example also keeps API definitions separate from implementations, adds multiple groups to one contract, and only supplies handler layers when constructing the runtime server. [Source: example API composition](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/ai-docs/src/51_http-server/fixtures/api/Api.ts#L1-L14) [Source: example runtime wiring](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/ai-docs/src/51_http-server/10_basics.ts#L12-L62)

## Composition API semantics

| Operation | What it does | Important ordering rule |
| --- | --- | --- |
| `api.add(group)` | Adds one or more groups directly. | Groups are keyed by `group.identifier`; a later identical identifier replaces the earlier group. |
| `api.addHttpApi(childApi)` | Copies the child API's groups into the receiver and merges child API annotations into each added group. | A later identical group identifier replaces the earlier group. Group annotations override colliding child-API annotations. |
| `api.prefix("/x")` | Returns an API whose currently present groups have all current endpoint paths prefixed. | It affects only groups/endpoints already present at the call site. |

The replacement and ordering behavior comes directly from the implementation: both `add` and `addHttpApi` assign into a record by group identifier, and `prefix` maps the groups currently in that record. [Source: `HttpApi` implementation](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/HttpApi.ts#L129-L176)

`addHttpApi` performs `Context.merge(childApi.annotations, group.annotations)`. Effect's `Context.merge` specifies that the second context wins, so a group's own title/description/other annotation wins over the child API annotation with the same key. [Source: `addHttpApi`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/HttpApi.ts#L148-L162) [Source: `Context.merge` precedence](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/Context.ts#L925-L966)

One consequence is that child API-level metadata does not become the aggregate document's root `info`. It is pushed into the child groups. The application aggregate should therefore own its own root title, version, description, servers, and similar document-wide annotations.

### Prefixing in this repository

No new prefix is needed for the current APIs. The endpoint contracts already contain their public paths:

- Checkout/address book: `/address-book`, `/checkout/current`, `/checkout/contact`, `/checkout/delivery-details`. [Source: current checkout contract](../packages/commerce/http/checkout-api.ts)
- Registration: `/registrations` and `/registrations/:registrationId/...`. [Source: current registration contract](../packages/registration/http/registration-api.ts)

If a future child contract intentionally owns route-local paths such as `/current`, compose the public graph with the prefix applied before adding it:

```ts
ApplicationHttpApi
  .addHttpApi(CheckoutHttpApi.prefix("/checkout"))
```

That public path must still agree with the runtime router. `prefix` changes the declarative endpoint paths; it is not merely an OpenAPI display option.

## Merge and collision behavior

Effect's aggregate generation merges by reflecting the final API graph. It does not diagnose every semantic collision, so the application should validate the aggregate contract.

| Collision | Effect v4 behavior | Recommendation |
| --- | --- | --- |
| Same group identifier | Later group replaces earlier group silently. | Make group identifiers globally unique and test the aggregate group set. |
| Same endpoint name inside one group | Later endpoint replaces earlier endpoint silently because endpoints are keyed by name. | Make endpoint names unique inside a group. |
| Same normalized path + HTTP method in different groups | Later reflected operation overwrites the earlier operation in `spec.paths[path][method]`. | Reject this collision in an aggregate-contract test. |
| Same `operationId` | No uniqueness check is performed. Default is `groupId.endpointName` (except top-level groups). | Assert unique operation IDs after generation. |
| Same security-scheme name | First encountered scheme definition wins silently; operations still reference that name. | Use globally unique names, or assert equal definitions for reused names. |
| Additional schema with duplicate identifier | `OpenApi.fromApi` throws `Duplicate component schema identifier`. | Keep explicit additional-schema identifiers unique. |
| Endpoint schemas with same identifier and same representation | Shared schema conversion reuses the existing component reference. | Safe and desirable. |
| Endpoint schemas with same identifier but different representation | Shared schema conversion generates a suffixed component name such as `Thing1`. | Prefer globally meaningful unique schema identifiers; test generated components if clients depend on names. |

Evidence:

- Group replacement: [`HttpApi.add` / `addHttpApi`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/HttpApi.ts#L134-L162).
- Endpoint-name replacement: [`HttpApiGroup.add`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/HttpApiGroup.ts#L287-L307).
- Default operation ID and final path/method assignment: [`OpenApi.fromApi` operation construction](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/OpenApi.ts#L339-L356) and [`spec.paths[path][method] = op`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/OpenApi.ts#L494-L505).
- Security first-wins behavior: [`processHttpApiSecurity`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/OpenApi.ts#L444-L462).
- Additional-schema duplicate error: [`AdditionalSchemas` processing](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/OpenApi.ts#L509-L524).
- Shared component generation and suffixing: [`OpenApi` multi-document conversion](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/OpenApi.ts#L530-L555) and [`SchemaRepresentation` reference allocation](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/internal/schema/representation.ts#L22-L74).

### Subtle path collision risk

OpenAPI schema patch locations are collected while each endpoint is reflected, but the path/method operation itself is assigned later and may overwrite an earlier operation. A collision can therefore leave schema patch entries from both operations targeting the final operation's path. This is another reason to reject duplicate path/method pairs before treating the generated document as trustworthy. [Source: schema patch paths and final operation assignment](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/OpenApi.ts#L355-L424)

## Components and security are aggregate-wide

`OpenApi.fromApi` initializes one `components.schemas` record and one `components.securitySchemes` record, then reflects every group and endpoint in the aggregate graph. All endpoint schemas are converted in one multi-document pass, so cross-domain schema references and deduplication happen at document scope. [Source: document initialization](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/OpenApi.ts#L263-L283) [Source: shared schema conversion](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/OpenApi.ts#L530-L555)

This is better than independently generating child documents and merging JSON afterward. `addHttpApi` first builds one typed API graph; Effect then has one traversal in which to normalize paths, apply annotations, collect middleware security, and deduplicate schemas. A handwritten JSON merger would need to reproduce all of those rules and collision checks.

## Exposing the document

There are three first-party-supported shapes:

1. **Recommended for separate Next handlers:** call `OpenApi.fromApi(ApplicationHttpApi)` in a dedicated Next `GET` route and return JSON.
2. **One Effect router/runtime:** pass `{ openapiPath: "/openapi.json" }` to `HttpApiBuilder.layer(ApplicationHttpApi)`. This also registers all API routes and therefore requires implementations for every group. [Source](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/HttpApiBuilder.ts#L79-L120)
3. **Interactive documentation:** add `HttpApiSwagger.layer` or `HttpApiScalar.layer`. Swagger embeds the generated spec; Scalar similarly derives it with `OpenApi.fromApi`. Neither changes the need to expose raw JSON separately when tooling needs it. [Swagger source](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/HttpApiSwagger.ts#L33-L84) [Scalar source](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/HttpApiScalar.ts#L129-L174)

Because `fromApi` caches by `HttpApi` object identity, define both the aggregate API and generated document at module scope. Treat the returned document as immutable application metadata; mutating it would mutate the cached object seen by later consumers. [Source: `apiCache`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/httpapi/OpenApi.ts#L225-L268)

## Minimum verification for the application seam

The aggregate graph should have a focused contract test that:

- asserts the expected path + method set;
- asserts every operation ID is unique;
- asserts no two source endpoints normalize to the same path + method;
- asserts expected component schemas exist;
- asserts reused security-scheme names resolve to identical definitions;
- optionally snapshots the document only after the semantic assertions above.

This is a small amount of application-owned validation around collision cases that Effect currently resolves silently. It does not require booting handler layers or a Next server.

## Conclusion

Use one **application-owned aggregate contract** for discovery and documentation, not one aggregate runtime. `addHttpApi` is the intended typed composition seam; `OpenApi.fromApi` is the intended layer-free document generator. Continue to build and run the checkout and registration APIs separately at their existing physical Next boundaries. The only extra layer needed is a thin application contract module plus a raw JSON route; no managed runtime and no combined handler layer are needed for OpenAPI generation.
