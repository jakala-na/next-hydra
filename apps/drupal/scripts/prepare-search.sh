#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

composer config repositories.application-search \
  '{"type":"path","url":"recipes/search-algolia","options":{"symlink":false}}'
composer require --no-interaction 'application/algolia-content-search:*@dev'
