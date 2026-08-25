# Registration

The Registration context describes how a company asks for access and how that request moves through approval, rejection, and onboarding.

## Language

**Registration**: A company access request and its lifecycle state. _Avoid_: Registration record, storage record, workflow record

**Registration ID**: The identity assigned to a Registration by the Registration context. _Avoid_: Workflow ID, submission key

**Submission Key**: A caller-provided key used to recognize repeated attempts to submit the same Registration. _Avoid_: Registration ID

## Relationships

- A **Registration** is either awaiting approval, approved, or rejected.
- A **Registration** has exactly one **Registration ID**.

## Example Dialogue

> **Dev:** "Should the **Registration** include workflow retry details?" **Domain expert:** "No — the **Registration** only describes the company access request and its domain state."

> **Dev:** "Can the workflow choose the **Registration ID**?" **Domain expert:** "No — the Registration context assigns the **Registration ID**; callers use a **Submission Key** for idempotency."

## Flagged Ambiguities

- "storage" was used to mean both domain persistence and operational workflow metadata — resolved: persistent **Registration** contains only domain state.
- "idempotency key" was used near **Registration ID** — resolved: idempotency is separate from aggregate identity and outside the Registration repository.
