# Extract Registration review decision acceptance

Status: ready-for-agent

## Parent

`.scratch/registration-use-case-programs/PRD.md`

## What to build

Extract approve/reject decision acceptance orchestration from the HTTP adapter into a named Registration program. The program should represent the use case where a reviewer decision is accepted for asynchronous processing: authorize or receive an already-authorized reviewer decision from the adapter, mark the Registration as approval processing for the requested decision, and resume workflow through a small edge capability.

The program should not approve or reject the Registration finally. Final approval/rejection remains the role of Registration onboarding programs executed by workflow. The HTTP approve/reject handlers should keep the same external contract and remain responsible for transport concerns such as header extraction, payload decoding, and HTTP error/status mapping.

## Acceptance criteria

- [ ] Review decision acceptance is implemented as a named Effect program, not as a new `Context.Service` unless a real replaceable adapter seam emerges.
- [ ] The program composes provider-independent capability services and a small workflow resume edge capability.
- [ ] Workflow resume remains outside the Registration aggregate and does not introduce workflow metadata or retry details into Registration persistence.
- [ ] Approve and reject acceptance paths share one coherent program surface or closely related program functions.
- [ ] The program marks approval processing before resuming workflow.
- [ ] The program does not resume workflow when the Registration transition conflicts.
- [ ] The program returns a typed result that the HTTP adapter can map to the existing accepted decision response.
- [ ] Existing conflict semantics are preserved for already approved, already rejected, and already processing Registrations.
- [ ] The HTTP approve/reject handlers keep their external contract and become thin transport/auth/error-mapping adapters over the program.
- [ ] Program tests cover transition conflict before workflow resume, approval-processing state for approve, approval-processing state for reject, accepted response data, and workflow resume payload shape.
- [ ] Route tests focus on auth/header handling, schema decoding, response mapping, and confirming workflow is not resumed after transition conflicts.
- [ ] The package typechecks and the relevant Registration/API tests pass.

## Blocked by

None - can start immediately
