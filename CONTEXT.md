# Registration

The Registration context describes how a company asks for access and how that request moves through approval, rejection, and onboarding.

## Language

**Registration**: A company access request and its lifecycle state. _Avoid_: Registration record, storage record, workflow record

**Registration ID**: The identity assigned to a Registration by the Registration context. _Avoid_: Workflow ID, submission key

**Submission Key**: A caller-provided key used to recognize repeated attempts to submit the same Registration. _Avoid_: Registration ID

**Registration Invitation**: The domain invitation issued after approval to let the registrant establish the initial owner identity for the company. It remains correlated to exactly one Registration even when an identity provider cannot store that business context. _Avoid_: Provider invitation

**Company Member Invitation**: The domain invitation issued by an existing company owner to offer associate access to that company. It is distinct from a Registration Invitation and requires durable company-owned context before acceptance. _Avoid_: Registration invitation, Provider invitation

**Invitation Delivery**: An identity provider's delivery and lifecycle projection for an Invitation, including its provider ID, recipient, acceptance URL, and state. It does not define why the Invitation exists or who issued it. _Avoid_: Invitation intent

**Invitation Acceptance**: Verified evidence that the invited person established an authentication identity. It links that identity to the approved company's Commerce account; it does not change the Registration's approved decision. _Avoid_: Sign-in callback

## Relationships

- A **Registration** is either awaiting approval, approved, or rejected.
- A **Registration** has exactly one **Registration ID**.
- An approved **Registration** has exactly one **Registration Invitation**.
- A **Registration Invitation** has one provider-owned **Invitation Delivery**.
- A **Company Member Invitation** has one provider-owned **Invitation Delivery**.

## Example Dialogue

> **Dev:** "Should the **Registration** include workflow retry details?" **Domain expert:** "No — the **Registration** only describes the company access request and its domain state."

> **Dev:** "Can the workflow choose the **Registration ID**?" **Domain expert:** "No — the Registration context assigns the **Registration ID**; callers use a **Submission Key** for idempotency."

## Flagged Ambiguities

- "storage" was used to mean both domain persistence and operational workflow metadata — resolved: persistent **Registration** contains only domain state.
- "idempotency key" was used near **Registration ID** — resolved: idempotency is separate from aggregate identity and outside the Registration repository.
