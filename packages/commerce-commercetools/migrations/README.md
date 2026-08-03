# Commercetools schema migrations

Migrations are timestamped TypeScript files in `scripts/`. The CLI loads them
in filename order and records successful applications as Custom Objects in the
`schema-migrations` container.

The CLI composes `serverKeys()` from
`packages/commerce-commercetools/keys.ts` and loads
environment values from `apps/cli/.env`. Pass the CLI's global `--env-file`
option before the command when targeting another Commercetools project.

```bash
# Show pending migrations
pnpm cli commerce migrate plan

# Apply pending migrations
pnpm cli commerce migrate

# Show status
pnpm cli commerce migrate status

# Generate a migration
pnpm cli commerce migrate create add-field \
  --description "Add a field to a Custom Type"
```

A migration that adds a field must check `fieldExists()` first. This makes the
operation retryable if the Type was created but migration tracking was not
recorded.

After applying schema changes, export the current project schema and regenerate
TypeScript:

```bash
pnpm cli commerce schema export
pnpm cli commerce types generate
```
