# Checkout

The Checkout context describes how a buyer completes the information and choices required to turn a cart into an order-ready purchase.

## Language

**Checkout**:
The buyer-facing process for completing the information and choices required before placing an order.
_Avoid_: Checkout page, checkout wizard

**Cart**:
The current collection of products and cart-owned checkout details being prepared for purchase.
_Avoid_: Checkout state

**Cart Policy**:
A rule based only on Cart data that determines whether the Cart is purchasable as currently composed.
_Avoid_: Checkout policy

**Cart Policy Violation**:
A reason the Cart is not purchasable as currently composed.
_Avoid_: Checkout policy violation

**Checkout State**:
The derived view of Checkout progress and available actions for the current Cart.
_Avoid_: Stored checkout, checkout aggregate

**Checkout Read Schema**:
The structural shape that can represent ordinary incomplete Checkout.
_Avoid_: Completed checkout schema

**Checkout Action Schema**:
The stricter structural shape required to perform a Checkout action.
_Avoid_: Checkout state schema

**Checkout Detail**:
A current detail used to evaluate Checkout, either saved on the Cart or derived for the current Cart.
_Avoid_: Option list, choice catalog

**Checkout Mutation**:
An action that saves cart-backed checkout details without owning Checkout State.
_Avoid_: Checkout state update

**Checkout Mutation Failure**:
A typed reason a Checkout Mutation could not save its requested details.
_Avoid_: Exception, generic error

**Commerce Principal**:
The verified request identity used by commerce adapters before deriving checkout or cart access, such as anonymous cart possession or authenticated customer identity.
_Avoid_: HTTP headers, Checkout Scope, Registration Actor

**Commerce Request Context**:
The resolved adapter boundary context that combines request context such as locale with a verified Commerce Principal before commerce-specific scopes are derived.
_Avoid_: Auth session, raw request, Checkout Scope

**Checkout Scope**:
The value object that identifies which storefront Checkout context is being evaluated, such as anonymous checkout for a locale/cart or customer checkout for a locale/customer.
_Avoid_: HTTP headers, cookie bag, auth session

**Current Checkout Scope**:
A request-scoped Effect context value supplied by an adapter or middleware when transport context has already been resolved.
_Avoid_: Checkout capability, persistent session

**CheckoutSession**:
The public Effect Service for Checkout use-case programs.
_Avoid_: HTTP handler, stored session data

**Checkout Use-Case Program**:
An externally meaningful Checkout operation exposed by `CheckoutSession`, such as getting current Checkout State or saving Contact.
_Avoid_: Mapper, decoder, implementation helper

**Checkout State Builder**:
The internal function that builds `CheckoutState` from already-resolved Checkout inputs.
_Avoid_: Fetcher, Service, use-case program

**Cart For Checkout**:
The schema-backed Cart projection containing only Cart fields needed to evaluate Checkout.
_Avoid_: Full provider Cart, cart-like object

**Checkout Scope Resolver**:
An optional adapter capability for resolving Checkout Scope from cookies, headers, auth session, store context, or other request data when that behavior becomes pluggable.
_Avoid_: Domain checkout rule

**Checkout Version Conflict**:
A Checkout Mutation Failure caused by attempting to save against stale Cart state.
_Avoid_: Generic persistence error

**Checkout Policy**:
A rule that can block Checkout progress based on the Cart, buyer context, and checkout details.
_Avoid_: Cart policy

**Checkout Policy Violation**:
A reason Checkout progress is blocked by a Checkout Policy.
_Avoid_: Cart issue, policy error

**Violation Target**:
The part of Checkout or Cart that a policy violation explains.
_Avoid_: Affected UI element

**Checkout Violation**:
A normalized violation included in Checkout State, preserving whether it came from Cart Policy or Checkout Policy.
_Avoid_: Step error

**Checkout Step**:
A section of Checkout with a completion condition derived from current checkout details.
_Avoid_: Saved step, persisted step

**Contact**:
The Checkout Step that establishes how the buyer is known for Checkout.
_Avoid_: Buyer identification, login step, account step

**Contact Input**:
A detail or choice submitted to resolve Contact for the current Checkout.
_Avoid_: Provider payload, form field

**Contact Source Policy**:
A rule that determines whether a Contact Source is allowed for the current Checkout.
_Avoid_: UI-only rule

**Contact Source**:
The selected strategy for resolving Buyer Contact, such as manual entry or customer profile.
_Avoid_: Guest, provider field name, field-level provenance

**Buying Context**:
The business context a buyer is acting within for a Checkout.
_Avoid_: Account, selected company

**Buyer Contact**:
The contact details used for communicating with the buyer during Checkout, whether entered by the buyer or derived from a known buyer.
_Avoid_: Contact information

**Shipping Address**:
The delivery destination selected or entered during Checkout.
_Avoid_: Shipping information

**Delivery Details Source**:
The selected strategy for resolving Shipping Address, such as manual entry or address book.
_Avoid_: Provider address object

**Address Book Reference**:
A reference to a saved address selected for Delivery Details.
_Avoid_: Copied address book record

**Active Checkout Step**:
The single Checkout Step currently open for buyer input.
_Avoid_: Open step, selected step

**Checkout Step Completion**:
The derived state that a Checkout Step's completion condition is currently satisfied.
_Avoid_: Completion flag, saved completion

**Delivery Details**:
The Checkout Step that establishes the Shipping Address.
_Avoid_: Contact information, shipping information

**Shipping Options**:
The Checkout Step where the buyer chooses how the order should be delivered.
_Avoid_: Delivery options

**Payment Method**:
The way the buyer will pay or settle the order.
_Avoid_: Payment arrangement, payment option

**Payment Options**:
The Checkout Step where the buyer chooses one or more Payment Methods for the order.
_Avoid_: Payment methods step, payment arrangement

**Review Order**:
The Checkout Step where the buyer confirms the order before it is placed.
_Avoid_: Review checkout, order summary

## Relationships

- A **Checkout** has exactly one **Active Checkout Step**.
- A **Checkout** requires an existing non-empty **Cart**.
- A **Checkout State** is a lean read model derived from the current **Cart**, buyer context, and **Checkout Details**.
- `CheckoutSession.getCurrent` is the use-case program that gets current **Checkout State** for a **Checkout Scope**.
- A **Checkout State Builder** receives an already-resolved **Checkout Scope**, **Cart For Checkout**, **Checkout Details**, buyer context, **Cart Policy Violations**, and **Checkout Policy Violations**.
- A **Checkout State Builder** validates that Checkout can start, computes binary **Checkout Step** status, computes the **Active Checkout Step**, normalizes violations, and returns **Checkout State**.
- A **Checkout State Builder** does not fetch provider data or resolve request context.
- A **Cart For Checkout** decoder maps provider Cart data into the Checkout Cart projection before **Checkout State** is built.
- A **Current Checkout Scope** can be supplied by HTTP middleware for API handlers or constructed directly by Server Components when the caller already knows the current buyer/cart context.
- A **Commerce Request Context** combines resolved locale with a **Commerce Principal** before a Checkout adapter derives **Checkout Scope**.
- Anonymous **Commerce Principal** access is possession-based and grants access only to the possessed anonymous Cart flow.
- HTTP adapters resolve or receive **Checkout Scope**, run one **Checkout Use-Case Program**, and map typed errors to transport responses.
- A first-slice **Checkout State** reports current **Checkout Details**, binary step status, active step, and **Checkout Violations**.
- A first-slice **Checkout State** does not report structured incompletion reasons.
- Blocking violations in **Checkout State** are global and do not have to belong to a **Checkout Step**.
- A **Checkout State** does not own option lists that have not been saved to the **Cart**.
- A **Checkout Read Schema** can represent ordinary incomplete **Checkout**.
- A **Checkout Action Schema** can require the details needed for a specific action.
- A **Checkout State** includes **Checkout Violations** as one global list.
- A **Checkout Violation** preserves whether it came from a **Cart Policy** or **Checkout Policy**.
- First-slice **Checkout Violations** are blocking.
- A **Checkout Mutation** can change the **Cart** details from which **Checkout State** is derived.
- A **Checkout Mutation Failure** prevents the requested details from being saved.
- Replacement-style **Checkout Mutations** are idempotent for the same requested details.
- A **Checkout Version Conflict** prevents stale checkout details from overwriting newer Cart state.
- A **Checkout Mutation Failure** occurs when the selected **Contact Source** cannot provide required **Buyer Contact** details.
- A **Checkout Mutation Failure** occurs when the selected **Contact Source** is not allowed for the current **Checkout**.
- A **Checkout Mutation Failure** occurs when an **Address Book Reference** cannot resolve to a **Shipping Address**.
- A **Checkout Step Completion** is derived from current checkout details and is not stored independently.
- First-slice **Checkout Step** status is binary: complete or incomplete.
- The **Active Checkout Step** is the first incomplete **Checkout Step** in the step sequence.
- A **Checkout Step** after the **Active Checkout Step** is unavailable until earlier completion conditions are satisfied.
- A blocking **Cart Policy Violation** prevents Checkout from advancing to a step that assumes a purchasable Cart.
- **Contact** is complete when required **Buyer Contact** details are available to the current **Checkout** and the current buyer mode is allowed.
- Required **Buyer Contact** details are email address, first name, and last name.
- Phone number is optional **Buyer Contact**.
- Authenticated B2B **Checkout** also requires an eligible buyer and **Buying Context** before **Contact** is complete.
- For authenticated B2B **Checkout**, **Buyer Contact** alone is not sufficient to complete **Contact**.
- Resolving **Buying Context** is part of **Contact** when it is required for **Checkout**.
- **Buyer Contact** can be recorded for the **Cart** even when it is derived from a known buyer.
- Authenticated buyers can save **Buyer Contact** details that differ from their profile.
- **Contact Input** can be entered by the buyer or derived from the customer profile.
- **Contact Input** includes a **Contact Source** when more than one strategy can resolve **Buyer Contact**.
- **Manual** is the **Contact Source** for buyer-entered **Buyer Contact** details.
- **Customer Profile** is the **Contact Source** for **Buyer Contact** details derived from the current customer profile.
- **Contact Source** resolves a complete **Buyer Contact**; partial overrides are not part of the current Contact language.
- A **Contact Source Policy** can make a **Contact Source** unavailable for the current **Checkout**.
- **Checkout State** derives **Contact Source Policy** results from current details; stored carts are re-evaluated rather than migrated.
- A previously saved **Contact Source** that becomes disallowed no longer satisfies **Contact**.
- **Contact Source Policy** results are represented as **Contact** incompletion, not **Checkout Policy Violations**.
- **Buying Context** is not a **Contact Source** for **Buyer Contact**.
- Saving **Contact** submits the **Contact Inputs** needed to resolve **Contact** for the current **Checkout**.
- Saving **Contact** is a replacement-style **Checkout Mutation** and is allowed even when **Contact** is already complete.
- **Delivery Details** is complete when **Shipping Address** is present and structurally valid.
- **Delivery Details** follows **Contact** when delivery details are incomplete.
- **Manual** is the **Delivery Details Source** for buyer-entered **Shipping Address**.
- **Address Book** is the **Delivery Details Source** for **Shipping Address** selected from saved addresses.
- **Address Book** **Delivery Details Source** submits an **Address Book Reference** rather than a copied **Shipping Address**.
- **Delivery Details** completion depends on the resolved **Shipping Address**, not on preserving an **Address Book Reference**.
- Changing **Buying Context** requires a different **Cart**.
- A structurally valid **Shipping Address** can be saved even when it produces a **Checkout Policy Violation**.
- **Shipping Options** can be the **Active Checkout Step** and remain incomplete when blocking violations prevent selecting shipping.
- A **Checkout Policy Violation** can have one or more **Violation Targets**.
- A **Checkout Violation** can have one or more **Violation Targets**.
- A **Violation Target** can identify a **Checkout Step**, a Cart item, or the whole **Cart**.
- **Payment Method** includes invoice terms, store credit, card payment, and split-payment components.
- **Payment Options** saves one or more **Payment Methods** for the current **Cart**.

## Example Dialogue

> **Dev:** "Should we save that the shipping step is complete?"
> **Domain expert:** "No — **Checkout Step Completion** is derived from the current checkout details, because address or cart changes can make a completed step incomplete again."

> **Dev:** "Does Checkout have its own stored state?"
> **Domain expert:** "No — **Checkout State** is derived from the current **Cart** and buyer context."

> **Dev:** "Does saving Delivery Details return and store a new Checkout State?"
> **Domain expert:** "No — saving Delivery Details is a **Checkout Mutation**; **Checkout State** is recomputed from the updated **Cart**."

> **Dev:** "Is a provider outage a Checkout Policy Violation?"
> **Domain expert:** "No — provider failures are **Checkout Mutation Failures** when they prevent saving details."

> **Dev:** "If the same Delivery Details are submitted twice, should that create duplicate checkout details?"
> **Domain expert:** "No — replacement-style **Checkout Mutations** are idempotent for the same requested details."

> **Dev:** "Can a buyer start Checkout without a Cart?"
> **Domain expert:** "No — **Checkout** requires an existing non-empty **Cart**."

> **Dev:** "Should we reject an Alaska shipping address if the current cart contains an item that cannot ship to Alaska?"
> **Domain expert:** "No — save the structurally valid **Shipping Address**, then show the resulting **Checkout Policy Violation** in **Checkout State**."

> **Dev:** "If Delivery Details are saved but shipping cannot continue because of a policy violation, do we reopen Delivery Details?"
> **Domain expert:** "No — **Shipping Options** becomes the **Active Checkout Step** and remains incomplete while the blocking violation prevents selecting shipping."

> **Dev:** "Does Delivery Details only support manually entered addresses?"
> **Domain expert:** "No — first design includes **Manual** and **Address Book** as **Delivery Details Sources**."

> **Dev:** "When saving Delivery Details from Address Book, do we submit a copied Shipping Address?"
> **Domain expert:** "No — submit an **Address Book Reference** and let the save operation resolve the **Shipping Address** for the **Cart**."

> **Dev:** "Does Delivery Details completion require preserving the Address Book Reference?"
> **Domain expert:** "No — completion depends on the resolved **Shipping Address** saved for the **Cart**."

> **Dev:** "If an Address Book Reference resolves to a structurally valid address that violates checkout policy, should Delivery Details still save it?"
> **Domain expert:** "Yes — save the structurally valid **Shipping Address**, then derive the resulting **Checkout Violation** in **Checkout State**."

> **Dev:** "If an Address Book Reference is stale or inaccessible, should Delivery Details save and remain incomplete?"
> **Domain expert:** "No — saving **Delivery Details** fails with a **Checkout Mutation Failure** because the **Shipping Address** cannot be resolved."

> **Dev:** "Should Checkout Step status include blocked?"
> **Domain expert:** "No — first-slice **Checkout Step** status is binary, and the **Active Checkout Step** is the first incomplete step."

> **Dev:** "Do blocking violations always belong to a Checkout Step?"
> **Domain expert:** "No — blocking violations are global in **Checkout State** and can target a **Checkout Step**, a Cart item, or the whole **Cart**."

> **Dev:** "If two products cannot be purchased together, should both line items always be marked invalid?"
> **Domain expert:** "No — the violation can target the **Cart** instead of individual line items when the buyer chooses which item to remove."

> **Dev:** "Does a Cart Policy become a Checkout Policy when Checkout shows it?"
> **Domain expert:** "No — a **Cart Policy Violation** can block Checkout progress, but it remains about the **Cart** being purchasable as composed."

> **Dev:** "Is invoice payment a special arrangement outside payment?"
> **Domain expert:** "No — invoice terms are a **Payment Method**."

> **Dev:** "Should the checkout step be called Payment Methods?"
> **Domain expert:** "No — **Payment Options** is the buyer-facing step; **Payment Methods** are what the buyer selects."

> **Dev:** "If the buyer is already signed in, do we still show **Contact**?"
> **Domain expert:** "Only if required contact details or buyer context are incomplete; otherwise **Contact** is already complete and Checkout advances to the next incomplete step."

> **Dev:** "If the buyer is already signed in, should saving Contact fail because the contact details are derived?"
> **Domain expert:** "No — saving **Contact** can record or replace derived **Buyer Contact** details for the **Cart**, and repeated saves are idempotent."

> **Dev:** "If an authenticated buyer changes the cart contact email, does that change who the buyer is?"
> **Domain expert:** "No — **Buyer Contact** is order communication detail; it does not change the authenticated buyer or **Buying Context**."

> **Dev:** "If the buyer profile has an email, but the current Checkout does not yet have required Buyer Contact details, is Contact complete?"
> **Domain expert:** "No — **Contact** is complete when required **Buyer Contact** details are available to the current **Checkout**, not merely known elsewhere about the buyer."

> **Dev:** "Is email enough to complete Contact?"
> **Domain expert:** "No — required **Buyer Contact** details are email address, first name, and last name; phone number is optional."

> **Dev:** "After signing in and merging a guest cart, what happens if the buyer context cannot be determined?"
> **Domain expert:** "**Contact** becomes the **Active Checkout Step** until the required buyer context is available."

> **Dev:** "If Buyer Contact is complete after sign-in, but Buying Context is unresolved, is Contact complete?"
> **Domain expert:** "No — authenticated B2B **Checkout** requires both **Buyer Contact** and **Buying Context** before **Contact** is complete."

> **Dev:** "If Buying Context is unresolved after guest-to-login merge, do we add a separate buyer-context step?"
> **Domain expert:** "No — resolving **Buying Context** is part of **Contact** when it is required for **Checkout**."

> **Dev:** "Does saving Contact always mean submitting email, first name, and last name fields typed by the buyer?"
> **Domain expert:** "No — saving **Contact** submits the **Contact Inputs** needed to resolve **Contact**; those inputs can be entered manually or derived from the customer profile."

> **Dev:** "Does Checkout State expose profile email choices or address book entries?"
> **Domain expert:** "No — **Checkout State** is a lean read model of current **Checkout Details**; option lists come from separate capabilities before they are saved to the **Cart**."

> **Dev:** "Should Checkout State fail schema decoding when Contact is incomplete?"
> **Domain expert:** "No — the **Checkout Read Schema** can represent ordinary incomplete **Checkout**; stricter **Checkout Action Schemas** enforce details required by specific actions."

> **Dev:** "Should Checkout State explain why every incomplete step is incomplete?"
> **Domain expert:** "Not in the first slice — first-slice **Checkout State** reports step status and current details, not structured incompletion reasons."

> **Dev:** "After saving Contact, do we record a source for each contact field?"
> **Domain expert:** "No — **Contact Source** is the selected strategy for resolving **Buyer Contact**, not field-level provenance."

> **Dev:** "Can Buying Context be a Contact Source?"
> **Domain expert:** "No — **Buying Context** may be required for authenticated B2B **Checkout**, but it is not a **Contact Source** for **Buyer Contact**."

> **Dev:** "Should the buyer-entered Contact Source be called Guest?"
> **Domain expert:** "No — the **Contact Source** is **Manual**; guest describes buyer mode, not how **Buyer Contact** is resolved."

> **Dev:** "Can Customer Profile Contact Source include a manual email override?"
> **Domain expert:** "Not now — **Contact Source** resolves a complete **Buyer Contact**; partial overrides are not part of the current Contact language."

> **Dev:** "If Customer Profile is selected but the profile lacks a required contact detail, should Contact save and remain incomplete?"
> **Domain expert:** "No — saving **Contact** fails with a **Checkout Mutation Failure** because the selected **Contact Source** cannot resolve required **Buyer Contact**."

> **Dev:** "Should Checkout State include every possible Contact Source option?"
> **Domain expert:** "No — **Checkout State** reports whether the current **Contact Source** satisfies **Contact**; selectable options are not owned by **Checkout State** until saved."

> **Dev:** "If the store later disallows Manual Contact Source for authenticated customers, do older carts need a migration?"
> **Domain expert:** "No — **Checkout State** is derived again from current details and **Contact Source Policy** results."

> **Dev:** "If a client submits Manual Contact Source when Manual is not allowed, should Checkout save it and show a policy violation?"
> **Domain expert:** "No — saving **Contact** fails with a **Checkout Mutation Failure** because the selected **Contact Source** is not allowed."

> **Dev:** "If a cart already has Manual Buyer Contact and Manual later becomes disallowed, is Contact still complete?"
> **Domain expert:** "No — the previously saved **Contact Source** no longer satisfies **Contact**, and **Checkout State** reports **Contact** as incomplete."

> **Dev:** "Is disallowed Manual Contact Source a Checkout Policy Violation?"
> **Domain expert:** "No — it is represented as **Contact** incompletion, not as a **Checkout Policy Violation**."

> **Dev:** "Should Checkout State keep Cart Policy Violations and Checkout Policy Violations in separate lists?"
> **Domain expert:** "No — **Checkout State** includes one global list of **Checkout Violations**, while preserving whether each violation came from **Cart Policy** or **Checkout Policy**."

> **Dev:** "Do first-slice Checkout Violations need warning/advisory severity?"
> **Domain expert:** "No — first-slice **Checkout Violations** are blocking."

> **Dev:** "Is signing in enough for B2B Checkout?"
> **Domain expert:** "No — **Contact** also needs the **Buying Context** the buyer is acting within."

> **Dev:** "Can the buyer switch Buying Context during Checkout?"
> **Domain expert:** "No — changing **Buying Context** requires a different **Cart**, so Checkout is too late for that change."

## Flagged Ambiguities

- "open step" was used near UI state — resolved: the domain term is **Active Checkout Step**, and there is exactly one during Checkout.
- "buyer identification" was used for the first step — resolved: **Contact** is the Checkout Step; **Buying Context** and **Buyer Contact** are details that can satisfy it.
- "context step" was used near contact collection — resolved: the Checkout Step is **Contact** unless the discussion is specifically about choosing **Buying Context**.
- "contact information" was used to include shipping address — resolved: **Contact** owns buyer contact details, while **Delivery Details** owns **Shipping Address**.
- "cart policy" was used for address-dependent restrictions — resolved: rules that depend on checkout details such as **Shipping Address** are **Checkout Policies**, even when their violations are displayed beside cart items.
- "account" and "company" were used near buyer selection — unresolved: the canonical business-context term is **Buying Context** until the concrete B2B model chooses whether that means Business Unit, Company Location, or another domain term.
