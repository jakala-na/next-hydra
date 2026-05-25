# Effect REST + Vercel Workflow Registration Tracer

## Summary

Replace the `/rpc` registration flow with an end-to-end Effect REST flow:
`web -> apps/api REST -> registration-effect services -> Vercel Workflow -> registration-effect approval/rejection programs`.

The workflow remains in `apps/api`; each `"use step"` directly runs Effect programs with the live API layer. Vercel Workflow is not abstracted behind an Effect service.

## Key Changes

- Complete the `registration-effect` REST contract with:
  - `POST /registrations`
  - `GET /registrations`
  - `GET /registrations/:registrationId`
  - `POST /registrations/:registrationId/approve`
  - `POST /registrations/:registrationId/reject`
- Mount the REST API in `apps/api/app/registrations/[[...rest]]/route.ts`.
- Add `apps/api/lib/registration-effect-runtime.ts` for the live Effect layer.
- Use `b2b-registration-effect-by-id` as the clean Effect-owned custom object container.
- Replace the registration workflow with an Effect-backed workflow using `registration-approval:{registrationId}` hook tokens.
- Move web registration/admin adapters from `/rpc/registration/*` to REST.

## Tests

- REST submit creates an Effect registration and starts the Vercel workflow.
- REST list/get load through `RegistrationQueries` and `Registrations`.
- REST approve/reject resume deterministic workflow hooks.
- Workflow approval/rejection steps run `registration-effect` programs.
- Web registration/admin adapters no longer call `/rpc/registration`.

## Assumptions

- The old `@repo/registration` package remains only as historical reference.
- No legacy custom object migration is included in this tracer.
- Admin REST authorization keeps the existing `x-registration-approval-secret` header.
