# Drupal Backend App

This app provides the Drupal backend, Canvas configuration, GraphQL API, OAuth consumers, preview integration, and cache revalidation for the Drupal demo.

## Prerequisites

- Docker or another DDEV-compatible container provider
- [DDEV](https://ddev.com/)
- Node.js and pnpm versions required by the repository
- [Acquia CLI](https://docs.acquia.com/acquia-cloud-platform/add-ons/acquia-cli) for Acquia operations

## Install locally

Run the installer from the repository root against a fresh local database:

```bash
cd apps/drupal
ddev install
```

The command installs Composer dependencies, installs Drupal, applies the Next Hydra recipe, creates the OAuth consumers, configures revalidation, rebuilds permissions, and prints a one-time login link.

Copy the generated credentials into `apps/web/.env.local`:

```dotenv
DRUPAL_BASE_URL="https://drupal-hydra.ddev.site"
DRUPAL_PREVIEWER_CLIENT_ID="..."
DRUPAL_PREVIEWER_CLIENT_SECRET="..."
DRUPAL_VIEWER_CLIENT_ID="..."
DRUPAL_VIEWER_CLIENT_SECRET="..."
CMS_REVALIDATION_SECRET="..."
```

Start the frontend from the repository root:

```bash
pnpm --filter web dev
```

Open Drupal with:

```bash
cd apps/drupal
ddev launch
```

## Start an existing local site

Use the normal update flow when the local database is already installed:

```bash
cd apps/drupal
ddev start
ddev composer install
ddev drush updatedb --yes
ddev drush cache:rebuild
```

## Configure preview and revalidation

1. Open `/admin/config/services/next` in Drupal.
2. Set the local frontend URL and draft URL to `http://localhost:3001`.
3. Set the local revalidation URL to `http://host.docker.internal:3001/api/revalidate`.
4. Set the revalidation secret to the same value as `CMS_REVALIDATION_SECRET` in `apps/web/.env.local`.
5. Preserve the UUID, token, and language placeholders when setting `GRAPHQL_COMPOSE_PREVIEW_URL`:

   ```dotenv
   GRAPHQL_COMPOSE_PREVIEW_URL="http://localhost:3001/api/drupal-preview?uuid=[node:preview:uuid]&token=[node:preview:token]&langcode=[node:langcode]"
   ```

For a hosted environment, replace the local URLs with the Drupal-enabled Vercel project URL.

## Deploy to Acquia

### 1. Prepare the Acquia application

1. Create the Acquia application and target environment.
2. Create or select the Drupal database for that environment.
3. Use MySQL 8.0 when it is available. The project includes Acquia's supported MySQL 5.7 compatibility driver for legacy environments.
4. Set the environment PHP version to 8.3.
5. Configure the target environment to deploy branches.
6. Create an automation user with SSH access to the application.
7. Add the automation user's RSA public key to Acquia.
8. Create an Acquia Cloud API key and secret for the automation user.

### 2. Configure GitHub

Create a GitHub Actions environment named `acquia-drupal`. Restrict it to the branches and reviewers permitted to deploy Drupal.

Add these environment secrets:

| Name | Value |
| --- | --- |
| `ACQUIA_API_KEY_ID` | Acquia Cloud API key ID |
| `ACQUIA_API_KEY_SECRET` | Acquia Cloud API key secret |
| `ACQUIA_SSH_PRIVATE_KEY` | Private key for the Acquia automation user |
| `ACQUIA_SSH_KNOWN_HOSTS` | Trusted SSH host keys for the Acquia Git and application hosts |

Add this environment variable:

| Name | Value |
| --- | --- |
| `ACQUIA_ENVIRONMENT_ALIAS` | Acquia CLI alias such as `myapp.dev` or `myapp.prod` |

Keep the matching SSH public key on the Acquia automation user.

### 3. Deploy Drupal

Push a Drupal-affecting change to `main`. The `Deploy Drupal to Acquia` GitHub Action uses Turbo's affected selection, builds the Acquia artifact, pushes it to the configured environment, and runs database updates and a cache rebuild on an installed site.

To force a deployment, open **Actions → Deploy Drupal to Acquia → Run workflow** in GitHub.

To deploy from the repository root with your local SSH key:

```bash
acli auth:login
ssh-add /path/to/acquia-automation-key
ACQUIA_ENVIRONMENT_ALIAS=myapp.dev \
  pnpm exec turbo run deploy:acquia --filter=@repo/drupal
```

Build and inspect an artifact locally without pushing it:

```bash
acli push:artifact myapp.dev \
  --dir=apps/drupal \
  --no-push \
  --no-interaction
```

### 4. Install a fresh Acquia environment

Deploy the Drupal artifact before running the bootstrap script. Then run:

```bash
bash apps/drupal/scripts/bootstrap_acquia.sh myapp.prod
```

Pass the exact target alias. The script asks for confirmation and stops if Drupal is already installed.

The script initializes the environment's persistent `secrets.settings.php`, installs Drupal, applies the recipe, creates the OAuth consumers, configures revalidation, rebuilds permissions, and clears caches. It writes the generated frontend credentials to `next-hydra-bootstrap.env` in the environment's persistent private files directory.

Retrieve that file through an Acquia SSH session and add its values to the Drupal-enabled Vercel project. Also configure:

```dotenv
DRUPAL_BASE_URL="https://your-drupal-domain.example"
```

Delete `next-hydra-bootstrap.env` from Acquia after storing the credentials securely.

### 5. Maintain the hosted site

- Let routine deployments run Drupal database updates and rebuild caches.
- Apply the recipe only when installing a fresh environment.
- Deliver changes for installed environments through update hooks or an explicit configuration deployment process.
- Rotate OAuth secrets and the revalidation secret through the appropriate Drupal, Vercel, Acquia, and GitHub settings.

## Starter content model

The Next Hydra recipe installs the demo content model and integration configuration:

- Page and product content types
- Canvas components and page templates
- GraphQL Compose schema configuration
- Preview and revalidation configuration
- Previewer and viewer OAuth consumers

## Update the Drupal schema

After changing the Drupal content model:

1. Export the dependency-closed configuration into the Next Hydra recipe.
2. Reinstall a fresh local site and verify that the recipe applies successfully.
3. Regenerate the frontend Drupal schema from the repository root:

   ```bash
   pnpm --filter @repo/cms-drupal generate
   ```

4. Run the repository checks required for the affected packages before opening a pull request.
