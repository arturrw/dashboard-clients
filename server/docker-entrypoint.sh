#!/bin/sh
set -e

# First start on an empty volume: load the demo dataset so the portal is
# usable straight away. Set SEED_ON_START=false to start with an empty schema,
# or SEED_ON_START=always to reset the data on every start (demo / CI).
case "${SEED_ON_START:-auto}" in
  always) node --no-warnings src/seed.js ;;
  auto)   [ -f "$DB_PATH" ] || node --no-warnings src/seed.js ;;
esac

exec "$@"
