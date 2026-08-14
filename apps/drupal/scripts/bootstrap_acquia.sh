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

remote_ssh() {
  acli remote:ssh "$target_alias" -- "$@"
}

echo "Checking whether Drupal is already installed..."
bootstrap_status="$(
  remote_drush status --field=bootstrap --format=string
)"
if [[ "$bootstrap_status" == "Successful" ]]; then
  echo "Refusing to replace an installed Drupal database." >&2
  exit 65
fi

echo "Initializing persistent Acquia settings..."
remote_ssh php scripts/initialize_acquia_secrets.php

echo "Installing Drupal..."
remote_drush site:install minimal --verbose --yes

echo "Applying the Next Hydra starter recipe..."
remote_drush recipe ../recipes/next-hydra-starter --verbose
remote_drush cache:rebuild

echo "Creating OAuth scopes and consumers..."
remote_drush php:script ../scripts/scopes
remote_drush php:script ../scripts/consumers

echo "Configuring frontend revalidation..."
remote_drush php:script ../scripts/revalidation

echo "Rebuilding node access and caches..."
remote_drush php:eval "'node_access_rebuild();'"
remote_drush cache:rebuild

echo "Drupal bootstrap completed for $target_alias."
