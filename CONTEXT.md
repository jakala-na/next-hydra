# Registration

The Registration context describes how a company asks for access and how that request moves through approval, rejection, and onboarding.

## Language

**Registration**: A company access request and its lifecycle state. _Avoid_: Registration record, storage record, workflow record

**Registration ID**: The identity assigned to a Registration by the Registration context. _Avoid_: Workflow ID, submission key

**Submission Key**: A caller-provided key used to recognize repeated attempts to submit the same Registration. _Avoid_: Registration ID

**Registration Invitation**: The domain invitation issued after approval to let the registrant establish the initial company administrator identity. It remains correlated to exactly one Registration even when an identity provider cannot store that business context. _Avoid_: Provider invitation

**Verified Registrant Identity**: The authentication identity proven by the registrant while submitting a Registration. It permits onboarding after approval without a Registration Invitation. Email lookup alone is not proof of this identity. _Avoid_: Matching email, Existing customer

**Company Member Invitation**: The domain invitation issued by an existing company administrator to offer one or more Company Roles in that company. It is distinct from a Registration Invitation and requires durable company-owned context before acceptance. _Avoid_: Registration invitation, Provider invitation

**Company Role**: A business authorization assigned to a Company Member: Admin, Buyer, or Approver. A Company Member has a non-empty set of Company Roles whose permissions combine. _Avoid_: Owner, Associate, Identity provider role

**Invitation Delivery**: An identity provider's delivery and lifecycle projection for an Invitation, including its provider ID, recipient, acceptance URL, and state. It does not define why the Invitation exists or who issued it. _Avoid_: Invitation intent

**Registration Onboarding Status**: The Registration-owned lifecycle of its initial company-member invitation: invited, accepted, expired, or revoked. It is separate from both the approval decision and the identity provider's Invitation Delivery status. _Avoid_: Registration status, Provider invitation status

**Invitation Acceptance**: Verified evidence that the invited person established an authentication identity. It completes the Registration invitation and permits creation of the company's Commerce account; it does not change the Registration's approved decision. _Avoid_: Sign-in callback

**Company Provisioning**: Creation of the Commerce customer and business unit after Registration Invitation Acceptance or approval of a Registration bound to a Verified Registrant Identity. Approval alone does not provision an anonymous registrant. _Avoid_: Registration approval

**Registration Invitation Expiration**: The terminal end of a Registration Invitation after its provider-owned acceptance deadline passes. It ends that onboarding attempt before Company Provisioning and requires the registrant to submit a new Registration; it does not reverse the prior approval or authorize resending the invitation. _Avoid_: Registration rejection, Invitation resend

## Relationships

- A **Registration** is either awaiting approval, approved, or rejected.
- A **Registration** has exactly one **Registration ID**.
- An approved anonymous **Registration** has exactly one **Registration Invitation**; a Registration bound to a **Verified Registrant Identity** does not.
- An approved **Registration** has one **Registration Onboarding Status**.
- A **Registration Invitation** has one provider-owned **Invitation Delivery**.
- An invited **Registration** prevents another Registration for the same email; an expired or revoked Registration does not.
- **Invitation Acceptance** precedes **Company Provisioning** for an anonymous Registration; a **Verified Registrant Identity** supplies the equivalent identity proof before submission.
- An accepted **Registration** is permanently associated with the first verified authentication user; another user cannot replay acceptance for the same email.
- After that authentication user's final Commerce membership and Customer are retired, the same verified Auth User ID may submit a new Registration; the historical accepted Registration does not block it.
- **Registration Invitation Expiration** ends the onboarding workflow unsuccessfully while the **Registration** remains approved and unprovisioned.
- A **Company Member Invitation** has one provider-owned **Invitation Delivery**.
- A **Company Member Invitation** carries a non-empty set of **Company Roles**.
- A **Company Member Invitation** records the invitee name supplied by the company administrator as profile defaults. Identity-provider profile values supersede those defaults after acceptance; neither source establishes authorization.
- Adding a company member provisions an existing authentication identity directly; a **Company Member Invitation** is issued only when the email has no authentication identity and no existing Commerce customer.
- Removing a Company Member never deletes the authentication identity.
- A revoked **Company Member Invitation** no longer offers company access and may be replaced by a new invitation.
- The initial company member receives the Admin and Buyer **Company Roles**.
- Identity providers preserve the complete **Company Role** set in business metadata; provider-native authorization does not narrow the Invitation's business intent.

## Example Dialogue

> **Dev:** "Should the **Registration** include workflow retry details?" **Domain expert:** "No — the **Registration** only describes the company access request and its domain state."

> **Dev:** "Can the workflow choose the **Registration ID**?" **Domain expert:** "No — the Registration context assigns the **Registration ID**; callers use a **Submission Key** for idempotency."

## Flagged Ambiguities

- "storage" was used to mean both domain persistence and operational workflow metadata — resolved: persistent **Registration** contains only domain state.
- "idempotency key" was used near **Registration ID** — resolved: idempotency is separate from aggregate identity and outside the Registration repository.
