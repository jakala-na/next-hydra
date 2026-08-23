# Contentstack migrations

The immutable stack import recipe is the empty-stack baseline. Every later content-model change is a timestamped CommonJS migration in this directory.

Run pending migrations through the workspace CLI:

```bash
pnpm cli cms migrate --management-token-alias <alias>
pnpm cli cms migrate plan --management-token-alias <alias>
pnpm cli cms migrate status --management-token-alias <alias>
```

Files are discovered and applied in lexicographic order. The baseline stack recipe provisions the administrative `migrations` content type; migration commands only read and append to it. The CLI invokes the pinned Contentstack migration command once per file and records a ledger entry only after that subprocess succeeds. Do not rename or edit an applied migration; add a new migration instead.

Migration files must:

- match `YYYY-MM-DD-HHMMSS-kebab-case.js`;
- export the function expected by `csdx cm:stacks:migration`;
- use the injected `migration` DSL or `stackSDKInstance` rather than importing dependencies, because CSDX otherwise runs an implicit package installation;
- avoid printing credentials or accepting Management Tokens as arguments.

Contentstack does not provide transactions across migration tasks and the ledger write. If a process stops after the provider mutation succeeds but before the ledger entry is written, inspect the target stack before repairing the ledger or rerunning the migration.
