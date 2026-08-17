# Preserve Typed Failures Across Adapter Boundaries

Status: Accepted

ADR-0003 establishes Effect programs, services, layers, and tagged failures as the repository-wide architecture. This ADR defines how those failures cross HTTP and Server Action boundaries. Expected failures remain typed data with one stable meaning across boundaries; adapters do not replace them with transport- or UI-specific error classes merely because they are being serialized.

## Decision

Domain programs use the Effect error channel for expected failures and defects for bugs, violated invariants, and impossible provider responses. A boundary projects an internal failure to a public error only when private data must be removed or the internal failure is not itself a public contract. That projection happens once, at the boundary that owns the public contract.

Public errors are safe Schema values defined by an exact `_tag`, a stable machine-readable `code`, a broad `category`, a `recovery` instruction, a human-readable `message`, and any safe fields needed by the caller. The exact tag is the primary discriminator. Categories support generic presentation and telemetry; they do not replace exact domain meaning. Provider diagnostics and `cause` values are logged privately and are not part of the public schema.

When an internal error is already safe and meaningful to callers, its public schema preserves the original tag while omitting private fields. HTTP clients and Action procedures pass declared public failures through unchanged. Consumer layers do not inspect a typed error's nested cause to classify it again. An infrastructure adapter may inspect an untyped provider exception once when that is the only way to create the provider-independent typed failure.

### HTTP APIs and clients

HTTP APIs declare their success and public error schemas. Caller-controlled input that cannot be decoded becomes the shared `InputInvalid` error. Endpoint programs project expected internal failures to their public schemas. Defects escape the endpoint error channel and are logged and converted to the safe HTTP-only `Unexpected` response by the terminal `UnexpectedHttpErrors` middleware.

A generated `HttpApiClient` decodes declared success and error responses. A declared public error remains that exact error in the client's Effect error channel; application code does not map it back to a generic HTTP client error or invent another wrapper.

`HttpClientError` and `SchemaError` values produced by the client itself are not declared application failures. The application-owned HTTP adapter distinguishes failures that occurred without a usable response from failures decoded from a declared response. For a non-idempotent write, a transport failure without a usable response, or a response that cannot be decoded according to its declared contract, means the write may have succeeded. The caller receives an exact outcome-unknown failure and is not told to retry unless a durable submission or idempotency key makes retry safe. Unclassified client failures and impossible contract states are defects.

### ActionClient

`ActionClient` is the serialized invocation adapter for an Effect program; it is not a second domain service or a second error-classification layer. A procedure:

1. Decodes its external input and returns `InputInvalid` without invoking the handler when decoding fails.
2. Supplies invocation context and request-scoped layers.
3. Runs the handler with its declared Effect failure channel.
4. Encodes success or a declared expected failure as `Schema.Result`.

Consequently, `.toAction()` and `.toFormAction()` resolve with declared failures as data. Presentation-specific `displayMessage` text may be added beside the error, but the error itself is not renamed. Defects, undeclared failures, invalid encoded results, and framework terminal control flow such as redirects are not converted into expected Action failures. Success hooks run after Effect execution so framework control flow is not accidentally captured as a defect.

`Unexpected` is safe to expose over HTTP, but it still represents a server defect. Its serializability does not make it an expected domain or Action failure.

## Boundary Behavior

| Situation | HTTP boundary | Action boundary |
| --- | --- | --- |
| Caller input is invalid | `InputInvalid` | `InputInvalid` result; handler is not invoked |
| An expected public failure occurs | Return its exact public tag | Return the same tag in `Schema.Result.Failure` |
| A non-idempotent write has no usable response | Return or create an outcome-unknown failure | Return outcome unknown as a declared failure |
| A response violates its declared schema | Treat it as a response-contract failure | For a write, return outcome unknown; otherwise defect unless explicitly modeled |
| A bug or invariant violation occurs | Log it and expose `Unexpected` at the terminal HTTP boundary | Reject the Action rather than manufacturing an expected failure |

## Examples

### Expected public failure

When an endpoint returns a declared expected failure, the generated HTTP client receives that exact tag. An Action using that client returns the same error in its failure result. Neither client nor Action creates a replacement error code.

### Invalid Action input

When a submitted form does not satisfy the procedure input schema, `ActionClient` returns `InputInvalid` with safe field paths and does not call the handler or HTTP API. If an HTTP API independently returns its declared `InputInvalid` error, an Action using that API also preserves the tag rather than turning it into a defect.

### Mutation without a usable response

When an API returns a declared availability error, the HTTP client and Action preserve it. When a non-idempotent mutation has no usable response, or its success response violates the declared schema, the mutation may already have succeeded. The Action returns a declared outcome-unknown failure without recommending retry. A retryable availability error is valid only when the server can establish that repeating the operation is safe or the request carries a durable idempotency key.

## Considered Options

Mapping every failure to generic HTTP status errors or Action-specific error codes was rejected because it erases exact domain meaning, duplicates mapping logic, and makes consumers reverse-engineer the original failure. Serializing internal errors directly was rejected because diagnostic causes and provider details are not public contracts. Rejecting the Action promise for every failure was rejected because expected failures are recoverable application state that the caller must be able to render.

## Consequences

Public error schemas can be shared by HTTP and Action contracts. Callers branch on exact tags and use category and recovery only for generic behavior. Boundary tests must prove that declared errors survive serialization unchanged, private causes do not cross the wire, invalid input does not invoke handlers, and ambiguous writes never become ordinary retryable failures without an idempotency mechanism.

Executable boundary tests are the canonical examples of this contract. Research and alternative exploration remain in `.scratch/` and are not part of this architectural record.
