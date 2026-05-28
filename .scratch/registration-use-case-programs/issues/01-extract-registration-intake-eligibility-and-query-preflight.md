# Extract Registration intake, eligibility, and query-owned preflight semantics

Status: ready-for-agent

## Parent

`.scratch/registration-use-case-programs/PRD.md`

## What to build

Extract public Registration intake and eligibility behaviour from the HTTP adapter into named Registration Effect programs. The resulting use-case surface should validate a company access request, run provider-independent eligibility checks, create an awaiting approval Registration only when eligibility passes, and keep provider-specific details behind capability services supplied by Layers.

This slice should also move query-owned preflight/read-model semantics out of transport code where they belong to Registration queries. Pending email lookup and list/search semantics should be owned by the query/read-model capability rather than by recursive HTTP helper logic or post-pagination filtering in the adapter.

The public HTTP create/list contract should remain stable. The HTTP adapter should become a thin transport seam that decodes input, runs the program or query capability, and maps typed failures to HTTP responses.

## Acceptance criteria

- [ ] Public Registration intake is implemented as a named Effect program, not as a new `Context.Service` unless a real replaceable adapter seam emerges.
- [ ] The intake program composes provider-independent capability services and does not import provider-specific adapters or provider payload shapes.
- [ ] The intake program converts external submission input into Registration details, runs eligibility, and creates an awaiting approval Registration only after eligibility passes.
- [ ] Eligibility checks cover pending Registration email, existing Commerce customer email, existing identity user email, unsupported country, and invalid VAT.
- [ ] Eligibility failure reasons remain typed and explicit enough for adapters to map them to the existing validation response shape.
- [ ] Provider lookup failure semantics are deliberate and covered by tests.
- [ ] Pending email lookup is owned by Registration query/read-model behaviour rather than by manually paging through lists inside HTTP.
- [ ] Registration list/search semantics are owned by Registration query/read-model behaviour where needed, avoiding transport-layer post-pagination filtering.
- [ ] The HTTP create handler keeps the same external contract while delegating Registration policy to the intake program.
- [ ] The HTTP list handler keeps the same external contract while delegating read-model semantics to Registration queries.
- [ ] `Registrations` continues to own only aggregate persistence and lifecycle transitions; workflow metadata, retry details, provider payloads, and read-model concerns stay outside the aggregate.
- [ ] Program tests cover successful awaiting approval creation, duplicate pending Registration email, existing Commerce customer email, existing identity user email, invalid VAT, unsupported country, multiple validation reasons, and provider lookup failure semantics.
- [ ] Query tests cover pending email existence and list/search/cursor behaviour without relying on HTTP post-filtering.
- [ ] Route tests focus on HTTP schema decoding, response status/error mapping, and adapter wiring rather than duplicating all intake/eligibility behaviour.
- [ ] The package typechecks and the relevant Registration Effect/API tests pass.

## Blocked by

None - can start immediately
