# Workspace CLI

`apps/cli` is the executable composition root for administration commands owned
by workspace packages. It defines the root `cli` program, composes package
environment fragments in `env.ts`, and adds the commands exported by those
packages.

The Commercetools migration, schema export, and type-generation commands are
implemented by `packages/commerce/cli`.

Copy `.env.example` to `.env` and provide the environment required by the
composed package schemas. Environment validation is lazy: help and commands
that do not use Commercetools can run without Commercetools credentials. To
target a different environment without changing `.env`, pass the global option
before the command:

```bash
pnpm cli --env-file /absolute/path/to/project.env commerce migrate plan
```

Common commands:

```bash
# Preview and apply schema migrations
pnpm cli commerce migrate plan
pnpm cli commerce migrate

# Export Product Types and Custom Types
pnpm cli commerce schema export

# Generate TypeScript from packages/commerce/schema
pnpm cli commerce types generate
```

Package composition:

- `apps/cli/env.ts` extends environment fragments exported by command packages.
- `apps/cli/src/program.ts` adds the `Command` objects declared by packages.
- `packages/commerce/keys.ts` owns the Commercetools environment schema.
- `packages/commerce/cli` owns the Commercetools commands and implementation.

To add commands from another package:

1. Export that package's environment fragment from its `keys.ts`.
2. Export one namespaced root-command factory from its `cli` module. Accept an
   environment provider rather than reading `process.env` in the command.
3. Extend the package keys in `apps/cli/env.ts`.
4. Add the returned root command in `apps/cli/src/program.ts`.

The app owns environment-file loading and composition. Package commands own
their schemas and only resolve the composed environment when a command actually
needs it.
