# Typed Effect errors across frontend boundaries

## Conclusion

`ActionResult` was not the bad part. The bad part was erasing every failure into a generalized `DomainError`.

For Next.js Server Actions, keep a serializable, discriminated action result whose failure branch contains the **exact action-specific union of schema-backed domain errors**. Encode that result at the server boundary and, when the client needs class instances rather than structural pattern matching, decode it with the same schema.

Effect Atom reaches the same outcome through a richer transport: RPC owns payload, success, and error schemas, transfers an encoded `Exit`, reconstructs the typed error on the client, and exposes it as `AsyncResult<A, E>`. A plain Server Action does not supply that RPC codec, so the action must perform the encode/decode boundary explicitly.

## What Effect Atom actually does

### 1. Frontend state retains the error type

Effect Atom represents an effectful computation as `AsyncResult<A, E>`. Its `Failure` branch stores `Cause<E>`, not `unknown` or a display-only error. `AsyncResult.error` retrieves the first typed `E`, while `matchWithError` explicitly separates a typed failure from a defect. See [`AsyncResult.ts`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/reactivity/AsyncResult.ts#L43-L54), [`Failure` and `error`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/reactivity/AsyncResult.ts#L252-L379), and [`matchWithError`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/reactivity/AsyncResult.ts#L482-L526).

The atom runtime converts the effect's `Exit<A, E>` directly to `AsyncResult<A, E>`, preserving its typed cause. See [`Atom.makeEffect`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/reactivity/Atom.ts#L535-L579).

### 2. RPC preserves the type because the error has a wire schema

An RPC declares `success` and `error` schemas with `Rpc.make`. `Rpc.exitSchema` builds a `Schema.Exit` whose failure schema is the union of the RPC error, middleware errors, and any stream error. See [`Rpc.make`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/rpc/Rpc.ts#L899-L940) and [`Rpc.exitSchema`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/rpc/Rpc.ts#L1097-L1135).

The server encodes the exit with the canonical JSON codec and the client decodes it using the same RPC exit schema:

- [`RpcServer`: `Schema.encodeUnknownEffect(Schema.toCodecJson(Rpc.exitSchema(...)))`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/rpc/RpcServer.ts#L614-L632)
- [`RpcClient`: `Schema.decodeUnknownEffect(Schema.toCodecJson(Rpc.exitSchema(...)))`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/rpc/RpcClient.ts#L795-L814)

Therefore a `Schema.TaggedErrorClass` can survive an RPC round trip: it is encoded to its struct representation on the server and reconstructed by its class schema on the client. The class schema's encoded side is the underlying struct's encoded type. See [`Schema.Class`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/Schema.ts#L10802-L10848) and [`Schema.TaggedErrorClass`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/Schema.ts#L11215-L11271).

### 3. `AtomRpc` carries the RPC error union into UI state

`AtomRpc.mutation` returns an `AtomResultFn<..., Success, Error | RpcClientError | MiddlewareError>`, and `AtomRpc.query` returns `Atom<AsyncResult<Success, Error | RpcClientError | MiddlewareError>>`. It does not collapse errors. See [`AtomRpcClient`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/reactivity/AtomRpc.ts#L56-L123).

For mutation state and query hydration, `AtomRpc` creates `AsyncResult.Schema` from the RPC success schema plus the combined RPC/middleware/client error schema. See [`AtomRpc` mutation and query serialization](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/reactivity/AtomRpc.ts#L198-L258) and [`makeErrorSchema`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/reactivity/AtomRpc.ts#L312-L317).

`AsyncResult.Schema` encodes `Initial`, `Success`, or `Failure`; a failure includes `Cause<Error>`, optional previous success, and `waiting`. This is why hydrated Atom state can retain typed failures. See [`AsyncResult.Schema`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/unstable/reactivity/AsyncResult.ts#L918-L1064). The React package has a wire-roundtrip test proving that serializable atom state is encoded, JSON-round-tripped, and decoded back into its runtime representation; see [`@effect/atom-react` hydration test](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/atom/react/test/index.test.tsx#L493-L526).

The React hook offers two different imperative modes: `promise` squashes and throws a failed cause, while `promiseExit` keeps the failure structure. Reading the mutation atom itself keeps the full `AsyncResult<A, E>`. See [`@effect/atom-react` `useAtomSet`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/atom/react/src/Hooks.ts#L115-L206). In other words, throwing is an opt-in convenience at the last UI edge, not the transport model.

## Why a Server Action cannot return a tagged error instance directly

React Server Functions serialize returned values, support plain objects, and explicitly do not support classes or class instances. See [React's `use server` serialization contract](https://react.dev/reference/rsc/use-server#serializable-parameters-and-return-values). `Schema.TaggedErrorClass` is built on `Schema.ErrorClass`, which extends Effect's error base class, so the runtime error value is a class instance. See [`Schema.ErrorClass`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/Schema.ts#L11148-L11204).

A rejected Server Action promise also has no TypeScript `E` channel. It is appropriate for defects and framework control-flow failures, but not for expected cart failures that the client must exhaustively handle.

## Recommended Server Action representation

Use a schema-native tagged union. Keep it generic only over schemas; instantiate it with an exact error union for each action family.

```ts
import { Effect, Schema } from "effect"

const ActionResult = <A extends Schema.Top, E extends Schema.Top>(
  success: A,
  error: E
) =>
  Schema.Union([
    Schema.TaggedStruct("Success", { value: success }),
    Schema.TaggedStruct("Failure", { error })
  ])

const CartActionError = Schema.Union([
  CartLineItemNotFound,
  CartMerchandiseUnavailable,
  CartAccessDenied,
  CartWriteConflict,
  CartWriteOutcomeUnknown,
  CartProviderFailure
])

export const CartActionResult = ActionResult(CurrentCartState, CartActionError)
export type CartActionResult = typeof CartActionResult.Type
export type CartActionResultEncoded = typeof CartActionResult.Encoded
```

At the action boundary, convert **typed failures only** and schema-encode the result before returning it:

```ts
const program: Effect.Effect<CurrentCartState, CartActionError> = // ...

const serializable = program.pipe(
  Effect.match({
    onSuccess: (value) => ({ _tag: "Success" as const, value }),
    onFailure: (error) => ({ _tag: "Failure" as const, error })
  }),
  Effect.flatMap(Schema.encodeEffect(CartActionResult)),
  Effect.runPromise
)
```

`Effect.match` does not turn defects into expected failures. Consequently bugs and Next.js control-flow exceptions still reject, while declared cart errors become data. On the client, the encoded union is already structurally discriminated. Decode it with `Schema.decodeUnknownEffect(CartActionResult)` only when the client wants reconstructed branded/class domain values.

This mirrors the important part of Effect RPC without pretending that a Server Action is RPC:

```text
Effect<A, CartError>
  -> action boundary matches typed E
  -> schema encodes a plain tagged union
  -> React transports plain data
  -> client narrows by outer _tag, then error._tag
  -> optional schema decode reconstructs domain classes
```

### Why not return `Effect.Result` directly?

Effect v4 does provide `Result<A, E>` and `Schema.Result(success, failure)`, with structural success/failure variants described by the schema. See [`Schema.Result`](https://github.com/Effect-TS/effect-smol/blob/6f38f07d5941a211b251383aaab0f4f55e8a6557/packages/effect/src/Schema.ts#L7598-L7701). However the runtime `Result` itself has Effect-specific prototypes. For an RSC boundary, either encode its canonical JSON codec first or use the plain `Schema.TaggedStruct` envelope above. The latter retains a precise encoded TypeScript return type without returning a library runtime object.

## Decision

- Keep `ActionResult`, but make it a schema-derived discriminated union.
- Delete generalized `DomainError`.
- Give Cart actions a closed `CartActionError` union of public, provider-agnostic tagged errors.
- Keep provider errors inside the provider layer and translate them to that public union before the action boundary.
- Return encoded plain data from Server Actions; optionally decode in the browser.
- Let defects and Next.js control-flow failures reject instead of laundering them into action failures.
- If Cart later moves to Effect RPC, use `AtomRpc`; its generated `AsyncResult<A, E>` removes the need for the hand-written Server Action envelope.
