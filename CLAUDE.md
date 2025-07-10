# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a production-grade Next.js Commerce monorepo built with Turborepo. It includes a web application, API server, and shared packages for common functionality.

## Common Commands

### Development
- `pnpm dev` - Start all applications in development mode
- `pnpm build` - Build all applications and packages
- `pnpm lint` - Run linting with Ultracite
- `pnpm format` - Format code with Ultracite
- `pnpm test` - Run tests across all packages
- `pnpm clean` - Clean all node_modules and build artifacts

### Application-Specific Commands
- **Web App (port 3001)**: `cd apps/web && npm run dev`
- **API Server (port 3002)**: `cd apps/api && npm run dev`
- **Storybook**: `cd apps/storybook && npm run dev`

### Testing
- Run tests: `pnpm test`
- Run API tests: `cd apps/api && npm test`
- Single test files can be run with vitest directly

### Build & Analysis
- `pnpm analyze` - Build with bundle analysis
- `pnpm typecheck` - TypeScript type checking (available in individual apps)

## Architecture

### Monorepo Structure
- **apps/**: Contains the main applications
  - `web/` - Next.js web application (main frontend)
  - `api/` - Next.js API server with webhooks and cron jobs
  - `storybook/` - Component documentation and testing
  - `email/` - Email templates and utilities
- **packages/**: Shared packages and utilities
  - `design-system/` - UI components (shadcn/ui based)
  - `auth/` - Authentication system
  - `cms/` - Content management system integration
  - `commerce/` - E-commerce functionality
  - `i18n/` - Internationalization with next-intl
  - `analytics/` - Analytics integrations (Google, PostHog, Vercel)
  - `observability/` - Monitoring and logging (Sentry)
  - `security/` - Security middleware and utilities
  - `seo/` - SEO utilities and JSON-LD
  - `typescript-config/` - Shared TypeScript configurations

### Key Technologies
- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS v4
- **Package Manager**: pnpm with workspace support
- **Build System**: Turborepo
- **Linting**: Ultracite (comprehensive ESLint + accessibility rules)
- **Testing**: Vitest
- **Deployment**: Vercel-optimized
- **Languages**: TypeScript throughout
- **Internationalization**: next-intl

### Package Dependencies
Most packages follow the `@repo/` namespace pattern for internal dependencies. External dependencies are managed at the workspace level where possible.

## Development Workflow

1. **Setup**: Use `pnpm install` to install dependencies
2. **Development**: Use `pnpm dev` to start all services
3. **Testing**: Run `pnpm test` before committing
4. **Linting**: Code is automatically formatted with Ultracite on commit via lint-staged
5. **Building**: Use `pnpm build` to ensure everything compiles correctly

## Code Quality

The project uses Ultracite for comprehensive linting and formatting, which includes:
- ESLint rules for JavaScript/TypeScript
- React-specific rules
- Accessibility rules
- Next.js specific rules
- Import/export rules
- Security rules

All code follows strict TypeScript rules and accessibility standards as defined in `.cursor/rules/ultracite.mdc`.

## Environment

- **Node.js**: >=18 required
- **Package Manager**: pnpm 10.11.0
- **Build Tool**: Turbo with TUI interface enabled