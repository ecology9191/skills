#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$REPO/bin/install.mjs" --link "$@"
