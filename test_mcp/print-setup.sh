#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="$DIR/server.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found. Install Node.js first."
  exit 1
fi

if [[ ! -f "$SERVER" ]]; then
  echo "ERROR: missing $SERVER"
  exit 1
fi

echo "=== TaseDeck Test MCP — copy into UI ==="
echo ""
echo "1) MCP → + → name: TaseDeck Test MCP → Enter"
echo "2) Run commands → stdio → Command (bash), paste ONE line:"
echo ""
echo "   node $SERVER"
echo ""
echo "3) Optional env: TASEDECK_TEST_ENV = hello"
echo "4) Click Create, expand card → Tools (expect 5 tools)"
echo ""
echo "Smoke test:"
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}\n' \
  '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' \
  | node "$SERVER" 2>/dev/null | head -2
echo ""
echo "OK if you see initialize + tools JSON above."
