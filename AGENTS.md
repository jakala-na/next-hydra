# Agent Guidelines for next-cms-commerce

## Build/Test Commands
- `pnpm build` - Build all apps and packages
- `pnpm dev` - Start development servers
- `pnpm test` - Run all tests with Vitest
- `pnpm test --run apps/api/__tests__/health.test.ts` - Run single test file
- `pnpm lint` - Lint with Ultracite (extends Biome)
- `pnpm format` - Format code with Ultracite
- `pnpm typecheck` - Type check (available in individual apps)

## Code Style
- Use TypeScript with strict mode, prefer `type` over `interface`
- Imports: Use `import type` for types, `node:` protocol for Node.js builtins
- Components: Use arrow functions, avoid default exports for components
- Error handling: Catch specific errors, log with stack traces
- Naming: Use camelCase for variables/functions, PascalCase for components/types
- Use `const` assertions (`as const`) over literal types
- Prefer `for-of` over `Array.forEach`, use `?.` for optional chaining
- No `console.log` in production code (warn level in linter)

## Project Structure
- Monorepo with apps (api, web, storybook) and packages (design-system, auth, cms, etc.)
- Use workspace imports (`@repo/package-name`)
- Follow existing patterns in each package for consistency