# next-hydra

TypeScript monorepo template for building production-grade, composable digital commerce and CMS solutions.

## Synopsis

`next-hydra` is a composable commerce monorepo template that embeds best practices required to deliver an enterprise digital commerce solution using multiple composable providers (Commerce, CMS, Auth, Security, Email, Intl, etc) and orchestrating them together to deliver the multiple experience (website, API and backoffice integrations) It is built for one full-stack team (and their coding agents) to ship features across package boundaries using Next.js primitives and end-to-end type safety.

## Why It Exists

Great open-source starter templates that cross provider and domain boundaries are rare or hard to find. Most commerce accelerators are either provider-owned or agency-owned, closed-source, and tend to either go deep on the provider stack, or go broad with minimal integration. `next-hydra` aims to be an open-source reference architecture for composable architecture that demonstrates the beauty of composing multiple providers, all while keeping a full-stack developer experience only available in monolithic providers

## Core Principles

- Next.js full-stack focus: Web and API composition with one technology stack.
- End-to-end type-safety with Typescript and GraphQL data access layer for CMS and Commerce, with `gql.tada` for query type inference.
- Domain-driven composition: domain concepts live in packages, app layer stays thin wrapper
- Swappable components: adapters should be replaceable without rewriting feature orchestration.

## Batteries Included

### Business Domains

Business domains are packages that model core product capabilities and workflows.

- `@repo/cms`: the stable CMS dependency name selected by the consuming app.
- `@repo/cms-contentstack`: Contentstack GraphQL client, content block rendering, draft mode routes, and live preview wiring.
- `@repo/cms-drupal`: Drupal OAuth, authenticated GraphQL transport, schema generation, and draft preview integration scaffold.
- `@repo/commerce`: provider-neutral commerce domain models and service contracts.
- `@repo/commerce-provider`: the selected Commerce implementation used by applications.
- `@repo/auth`: the selected Auth implementation used by applications.
- `@repo/auth-workos`: WorkOS auth routes, provider, middleware proxy, and server helpers.
- `@repo/auth-clerk`: Clerk auth adapter package (available for swap-in/experiments).

### Shared Platform Capabilities

Shared platform capabilities are reusable concerns that support multiple domains and apps.

- `@repo/design-system`: shared UI components and commerce UI primitives, validated in Storybook.
- `@repo/i18n`: locale routing with `next-intl` and region-driven locale config.
- `@repo/analytics`: PostHog + optional Google Analytics + Vercel Analytics.
- `@repo/observability`: Sentry capture and Logtail-powered logging wrappers.
- `@repo/feature-flags`: feature flag helpers with PostHog-based user targeting + Vercel Toolbar support.
- `@repo/security`: Arcjet protections and Nosecone security headers integration.
- `@repo/rate-limit`: Upstash Redis ratelimit wrapper with sensible defaults.
- `@repo/seo`: typed JSON-LD helpers via `schema-dts`.
- `@repo/email`: Resend + React Email setup for transactional email workflows.
- `@repo/testing`: shared testing utilities with Vitest in the workspace.

### App surfaces

- `apps/web`: composable storefront app (CMS + Commerce + Auth + i18n + flags + security).
- `apps/api`: Next.js API app for backend-oriented routes and health checks.
- `apps/email`: local preview/build workflow for email templates.
- `apps/storybook`: design system and UI component playground.
- `apps/docs`: Fumadocs-powered documentation app.
- `apps/drupal`: Drupal 11 backend with landing-page, Paragraph, native-menu, preview, and GraphQL Compose configuration.

## Provider Strategy (Current vs Next)

The README calls this out explicitly because swappability is a core product promise in the marketing context.

| Domain | Shipped in repo today | Also present | Worth prioritizing next |
| --- | --- | --- | --- |
| Commerce | Commercetools | - | Shopify, Medusa, BigCommerce/Saleor adapters |
| CMS | Contentstack or Drupal through the `@repo/cms` alias | Hydra-owned Drupal recipe and demo content | Contentful, Sanity, Hygraph adapters |
| Auth | WorkOS (wired in `apps/web`) | Clerk package adapter | Better Auth, Auth0/Okta adapters |
| Email | Resend | - | Postmark/SES adapters |
| Analytics/Observability | PostHog, GA, Vercel Analytics, Sentry, Logtail | - | Segment and OpenTelemetry-first adapter path |

Notes:

- “Worth prioritizing next” means roadmap candidates, not current support.
- First release focuses on one production provider path per major domain, then expands adapters incrementally.

## Monorepo Layout

```text
apps/
  web         Next.js storefront + orchestration layer
  api         Next.js API app
  email       React Email preview/build app
  storybook   Design system development surface
  docs        Product/documentation app
  drupal      Drupal 11 CMS backend
packages/
  cms-*, commerce, auth-*, analytics, observability, feature-flags,
  security, rate-limit, i18n, seo, email, design-system, testing
```

## Getting Started

```bash
pnpm install
pnpm exec portless trust
pnpm dev
```

Local HTTP applications run through Portless with stable HTTPS origins and worktree-aware routing. See [Portless local development](docs/development/portless.md) for application URLs, certificate setup, direct package fallbacks, auth callback handling, and the API-only ngrok workflow.
