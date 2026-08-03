# React and Next integration ownership

Type: grilling
Status: resolved
Blocked by: 02, 03, 04, 09

## Question

Define which reusable React and Next.js integration surfaces belong in `@repo/commerce` and which must remain application boundary code.

Account for Product caching explicitly. The current Product collection uses `"use cache"` with locale-only inputs, but Product Price and Availability are resolved for `CommerceContext`. The first extraction removes that cross-request cache; any reusable Next integration must not reintroduce buyer-unsafe caching or require provider identities in application cache keys.

Use the actual Product Collection, Product Detail, Checkout page, form action contracts, Cart Server Actions, Checkout Server Actions, cookie/header resolution, metadata, `notFound`, cache directives, revalidation, localization, and design-system translation call sites. Decide whether `@repo/commerce` exposes framework-neutral components plus explicit action functions, Next-specific entrypoints within the same package, or only domain-to-view-model integration while applications retain request-bound actions.

The answer must preserve the two-package destination and avoid introducing another package unless the current dependency graph proves it necessary. Provider Layers and provider models must never be imported by reusable components or action contracts.

## Confirmed decisions

- `@repo/commerce` owns its reusable Next.js commerce slices, including the actual package-level `"use server"` exports for Checkout and Cart. Those actions are colocated with the commerce page or component that consumes them and are imported directly there. The application does not add a facade for each action.
- This placement preserves starter-kit decomposability. Removing commerce means removing the single application composition module, commerce routes/layout slots, intentionally commerce-dependent CMS blocks, and the commerce packages; commerce orchestration is not scattered through `apps/web`. CMS may depend on provider-neutral commerce integration without creating a cycle because commerce does not import CMS.
- The exact compile-time alias targets one app-owned commerce Layers module, not the Commercetools package directly. That module exports the selected immutable Commercetools capability Layers together with the application's WorkOS-backed `CommerceIdentity` Layer. This is the only application commerce composition file and the only place ordinary web code imports `@repo/commerce-commercetools`.
- `CommerceIdentity` is the provider-neutral leaf Service through which a commerce boundary obtains either the current verified `AuthUserId` or anonymous identity. `@repo/commerce` cannot import `@repo/auth-workos`: the current `auth-workos -> registration -> commerce` dependency path would make that import circular. The app-owned configuration Layer supplies the WorkOS implementation without making commerce actions or components aware of WorkOS.
- The configured Next commerce integration requires no process bootstrap, instrumentation registration, provider registry, or process `ManagedRuntime`. Every page, action, metadata function, or commerce block composes the immutable named Layers with a fresh request Layer containing cookies, Store selection, Commerce Context, and context-sensitive Services such as Current Cart, Address Book, Product Discovery, and Checkout Session.
- For one cohesive request program, provide the merged request Layer once with `Effect.provide` so its Services share the request scope and release when the program completes. A request-local `ManagedRuntime` is also valid when several independent Effect programs in the same request must share the constructed Services, provided it is disposed at the request boundary. Never place Commerce Context in the process runtime because `ManagedRuntime` caches its Layer-built Services across runs.
- Product Card and Product Detail reads remain request-time reads in the first extraction. Remove the current collection-level `"use cache"`; do not use `"use cache: private"` and do not put Customer, Business Unit, or provider channel identities into application cache keys. A package-private React `cache` wrapper may deduplicate the same Product Detail read between `generateMetadata` and the page within one request because it does not create a cross-request commerce cache.

## Answer

### Package shape and configured Layers

Keep the commerce package module-based. Cart, Checkout, Product, and Commerce Context own their React and Next integration beside their domain and Service code. Do not add `next/` folders or `next-` filenames: this starter kit is centered on Next, so that qualifier distinguishes nothing today. Shared request construction belongs with Commerce Context, while the configured Layer binding is a package-root module. A framework namespace is introduced only if another real host later requires it.

The stable module imported by package-owned boundaries is `@repo/commerce/layers`. Core owns its named Layer contract and unconfigured implementations that fail with a named composition error during standalone use. `apps/web/next.config.ts` aliases that exact specifier to `apps/web/lib/commerce-layers.ts`:

```text
@repo/commerce/layers
  -> exact Turbopack alias
  -> apps/web/lib/commerce-layers.ts
       -> cartsLayer / commerceAccountsLayer
       -> addressBookLayer / productDiscoveryLayer
       -> commerceIdentityLayer
```

The app-owned file contains Layer selection only. It exports immutable, unbuilt named Layers; it does not export action wrappers, request data, clients, or a runtime. The layers remain separate because Commerce Accounts is needed to build Commerce Context while Address Book and Product Discovery require that resolved Context. The Commercetools package remains responsible only for commerce provider Services and does not acquire an auth dependency.

The core-owned Commerce Context request module then performs the one request-bound operation that every commerce entrypoint needs:

```text
locale + Next cookies + configured Store selection
  + CommerceIdentity from commerceIdentityLayer
  -> CommerceContextRequest
  -> CommerceContext + provider capability Layers
  -> CurrentCart / CheckoutSession / ProductDiscovery / AddressBook
```

Anonymous Cart and Business Unit cookie names, decoding, options, set, and clear behavior belong here because they are commerce request semantics. Store resolution uses the provider-neutral configuration fixed in ticket 04 and performs no provider Store lookup. Provider errors and cookie-write errors remain typed operation failures; the request module does not introduce generic runners or invented association terminology.

Each actual boundary defines its specific Effect program and calls `Effect.runPromise` once after providing the complete Layer. There is no exported `runCommerceProgram(effect)` helper and no caller manually supplies Current Cart, Checkout, Store, or provider Layers.

### Cart

`@repo/commerce/cart` owns:

- the actual `addToCart`, `changeCartItemsQuantity`, and `removeCartItem` Server Actions;
- their input and stable client-result contracts;
- action diagnostics and mapping from typed Current Cart failures;
- the Server Component that loads Current Cart and supplies the design-system Cart provider with the Cart promise and those colocated actions.

The current generic `inStoreAction` middleware is removed. It resolves a provider-shaped Store context before the real action and forces every action caller through a legacy `next-safe-action` context. If `next-safe-action` remains for the existing client invocation/result protocol, each concrete Cart action may use the package's action client directly, but Store and buyer context are always obtained through the shared request Layer. The current app-only `current-cart-action-result.ts` helper moves into the Cart action module or disappears into the concrete error mapping.

The call graph becomes:

```text
apps/web [locale] layout
  -> <CommerceCartProvider locale>{children}</CommerceCartProvider>
     -> CurrentCart.get
     -> design-system CartProvider
        -> package-owned add/change/remove Server Actions
           -> fresh Next commerce request Layer
           -> CurrentCart.addItem / setLineItemQuantity / removeLineItem
```

The application decides where the provider wraps the tree and where Cart UI slots appear. It does not load Cart state, import Current Cart, construct a Layer, or pass an `actions` object.

### Checkout

`@repo/commerce/checkout` owns the complete reusable Checkout route slice:

- the package-level Checkout page Server Component;
- Checkout state loading through `CheckoutSession.getCurrent`;
- Address Book loading and address-option projection;
- absent Checkout to `notFound()` behavior;
- the actual `saveCheckoutContact` and `saveCheckoutDeliveryDetails` Server Actions;
- FormData decoding, stable action-state mapping, diagnostics, localization, design-system translation, and Checkout-path revalidation.

The public Checkout page no longer accepts `state`, `shippingAddressOptions`, or an `actions` bag. Its private form components may still receive the colocated action functions. The app route owns only the route segment and locale validation:

```text
apps/web [locale]/checkout/page.tsx
  -> validate locale + setRequestLocale
  -> <CheckoutPage locale>
     -> fresh Next commerce request Layer
     -> CheckoutSession.getCurrent + AddressBook.list
     -> package-owned Checkout view
        -> package-owned save contact/delivery actions
           -> fresh Next commerce request Layer
           -> CheckoutSession.saveContact / saveDeliveryDetails
           -> revalidatePath('/[locale]/checkout') when required
```

This removes the current app-side manual `Effect.provide(nextCheckoutLayer(locale))`, page-state projection, and action facade while keeping the domain behavior already enclosed by `CheckoutSession`.

### Product Collection and Product Detail

`@repo/commerce/product` owns Product Collection, Product Detail, Product metadata mapping, Product JSON-LD, Product absence to `notFound()`, localization inputs, and translation from Product Card or Product Detail into design-system props.

Product Collection accepts domain selectors such as `CategoryId`, limit, and excluded `ProductId`; it never constructs a Commercetools filter string. A CMS block stays in `@repo/cms` because it decodes CMS content, then passes the selected domain Category ID and CMS-authored presentation content to the commerce block. Rename the CMS-side `CommercetoolsCategoryField` representation to provider-neutral commerce/category language when that integration moves; its current name is provider leakage, but CMS content fetching itself is not moved into commerce.

The application Product route continues to own dynamic route parameters, supported-locale validation, and `setRequestLocale`. It delegates `generateMetadata` and rendering to commerce. Next explicitly supports `notFound()` inside `generateMetadata`, so that behavior does not need an app wrapper.

The first extraction does not cross-request-cache resolved Product Card or Product Detail models. They contain buyer-specific prices and contextual availability. The existing CMS `getPageCached` remains valid because it caches only CMS entry data; `DynamicProductCollection` executes afterward and performs a request-time commerce read.

For Product Detail, use a package-private, Product-specific React `cache` loader only to deduplicate identical slug/locale reads made by `generateMetadata` and the page in the same request. It must construct and consume the same request-scoped commerce graph and must not be generalized into an Effect runner. If the Next prototype cannot prove shared request memoization for this JIT entrypoint, keep the two reads initially rather than adding `"use cache"`.

### Buying Context switcher

The Business Unit switcher and its Server Action are commerce integration, not application shell logic, so they move into the Commerce Context module. The Server Component reads the resolved `CommerceContext` for the current Store, Customer, and selected Business Unit, and uses `CommerceAccounts` only to list the verified memberships it presents. It does not repeat auth, Store, Customer, or default-Business-Unit resolution.

The action validates a domain `CommerceBusinessUnitId`, saves that ID in the Business Unit cookie, and refreshes the current route from the server. The view displays `businessUnitLabel`; no key is used as a user-facing label. Switching context is allowed on Checkout and may reveal a different active Cart or no Cart. The application layout only chooses the switcher's slot.

### Caching and revalidation rules

- `"use cache"` is allowed only around inputs and outputs proven independent of Commerce Context. The current resolved Product projections do not meet that rule.
- `"use cache: private"` is experimental and only caches in the browser; it does not solve commerce result ownership and is not used.
- Request-local Layer memoization and React `cache` deduplication are allowed because they cannot serve one buyer's result to another request.
- CMS content caches remain owned by CMS. Future provider-owned catalog/inventory caches remain behind provider Layers and may use provider-specific revision dimensions internally.
- Cart actions update client Cart state from their returned Current Cart snapshot. Checkout mutations revalidate the Checkout route according to the existing action-state rules. Buying Context mutation refreshes the current route and layouts. None of those operations pretend to invalidate a removed Product result cache.

These rules follow the Next.js 16 behavior that `"use cache"` keys are based on serializable inputs and cannot directly read runtime request APIs, while package-level `"use server"` files may be imported by both Server and Client Components. See [Next.js `use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache), [Next.js `use server`](https://nextjs.org/docs/app/api-reference/directives/use-server), and [Next.js `generateMetadata`](https://nextjs.org/docs/app/api-reference/functions/generate-metadata).

### Application residue and proof

After this slice, delete the application-owned Cart actions, Checkout actions, Current Cart action-result helper, `apps/web/lib/current-cart.ts`, Business Unit action/component implementations, and Checkout page assembly. The app retains:

- route files and route-segment validation;
- `setRequestLocale` and placement of commerce page/layout slices;
- the single commerce configuration Layer module;
- the exact Next alias; and
- non-commerce layout composition such as CMS navigation, auth account UI, and design slots.

Boundary tests supply named test Layers through the same exact alias. Ticket 10 must prove the app-owned alias target, package-owned Server Component, package-owned Server Action manifest, standalone core typecheck with the unconfigured module, and missing-binding failure. Product integration tests must prove two different Buying Contexts cannot share a cross-request Product result; Cart and Checkout tests must prove every action constructs fresh request state and that Business Unit switching refreshes server-rendered Cart and Checkout state.
