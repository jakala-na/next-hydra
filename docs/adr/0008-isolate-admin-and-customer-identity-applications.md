# Isolate Admin and Customer Identity Applications

Status: Accepted

The customer storefront and admin workspace deploy as separate applications and authenticate against separate identity-provider applications or projects, even when both use the same selected provider. The shared API verifies each route group with credentials for its caller: Registration decisions derive the `RegistrationReviewerActor` from the admin identity pool, while Registration intake and onboarding continue to use the customer identity pool. Browser sessions remain host-only instead of sharing a parent-domain cookie, and the admin application reads customer and Registration data through the API rather than directly inspecting the customer identity provider. Existing provider-neutral capabilities such as `IdentityUsers` remain unchanged and are composed with realm-specific Layers at the API boundary.
