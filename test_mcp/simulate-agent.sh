#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${TASEDECK_BRIDGE_PORT:-}" ]]; then
  echo "ERROR: set TASEDECK_BRIDGE_PORT (from topology Play status or mcp.json env)."
  echo ""
  echo "  export TASEDECK_BRIDGE_PORT=60382"
  echo "  $DIR/simulate-agent.sh"
  exit 1
fi

exec node "$DIR/simulate-cursor-agent.mjs" "$@"
