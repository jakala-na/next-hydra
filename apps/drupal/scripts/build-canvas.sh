#!/usr/bin/env bash
# Development Canvas checkouts do not ship the compiled editor assets.
set -euo pipefail
cd "$(dirname "$0")/../docroot/modules/contrib/canvas"
if [[ -f ui/dist/assets/index.js ]]; then
  exit 0
fi
CYPRESS_INSTALL_BINARY=0 npm ci --ignore-scripts --no-audit --no-fund
npm run build
