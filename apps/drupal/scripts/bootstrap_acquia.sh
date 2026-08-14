#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -ne 1 || -z "$1" ]]; then
  echo "Usage: bash apps/drupal/scripts/bootstrap_acquia.sh <environment-alias>" >&2
  exit 64
fi

if ! command -v acli >/dev/null 2>&1; then
  echo "Acquia CLI is required. Install it and run 'acli auth:login' first." >&2
  exit 69
fi

target_alias="$1"
confirmation=""

echo "This will install Drupal into the fresh Acquia environment: $target_alias"
if ! read -r -p "Type the environment alias to continue: " confirmation; then
  echo "Confirmation is required." >&2
  exit 64
fi

if [[ "$confirmation" != "$target_alias" ]]; then
  echo "Confirmation must exactly match the Acquia environment alias." >&2
  exit 64
fi

remote_drush() {
  acli remote:drush "$target_alias" -- "$@"
}

bootstrap_status="$(
  remote_drush status --field=bootstrap --format=string 2>/dev/null || true
)"
if [[ "$bootstrap_status" == "Successful" ]]; then
  echo "Refusing to replace an installed Drupal database." >&2
  exit 65
fi

table_count="$(
  remote_drush sql:query \
    'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();' \
    --extra=--skip-column-names | tail -n 1 | tr -d '[:space:]'
)"
if [[ ! "$table_count" =~ ^[0-9]+$ || "$table_count" != "0" ]]; then
  echo "Refusing to install because the database was not proven empty." >&2
  exit 65
fi

remote_drush site:install minimal --verbose --yes
remote_drush recipe ../recipes/next-hydra-starter --verbose
remote_drush cache:rebuild
remote_drush php:script ../scripts/scopes
remote_drush php:script ../scripts/consumers
remote_drush php:script ../scripts/revalidation
remote_drush php:eval 'node_access_rebuild();'
remote_drush cache:rebuild

echo "Drupal bootstrap completed for $target_alias."
