#!/usr/bin/env bash

set -euo pipefail

: "${ACQUIA_ENVIRONMENT_ALIAS:?ACQUIA_ENVIRONMENT_ALIAS is required}"

acli push:artifact "$ACQUIA_ENVIRONMENT_ALIAS" \
  --dir=. \
  --no-ansi \
  --no-interaction

bootstrap_status="$(
  acli remote:drush "$ACQUIA_ENVIRONMENT_ALIAS" -- \
    status --field=bootstrap --format=string 2>/dev/null || true
)"

if [[ "$bootstrap_status" == "Successful" ]]; then
  acli remote:drush "$ACQUIA_ENVIRONMENT_ALIAS" -- updatedb --yes
  acli remote:drush "$ACQUIA_ENVIRONMENT_ALIAS" -- cache:rebuild
else
  echo "Drupal is not installed yet. From the repository root, run:"
  echo "bash apps/drupal/scripts/bootstrap_acquia.sh $ACQUIA_ENVIRONMENT_ALIAS"
fi
