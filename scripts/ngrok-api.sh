#!/usr/bin/env bash
set -euo pipefail

# Starts an ngrok tunnel for the API server.
# Requires: ngrok CLI installed + authenticated (`ngrok config add-authtoken ...`).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
fi

PORT="${1:-${PORT:-3000}}"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not found. Install it first: https://ngrok.com/download" >&2
  exit 1
fi

echo "Starting ngrok tunnel to http://localhost:$PORT" >&2
echo "API base URL: https://<your-ngrok-domain>" >&2

exec ngrok http "$PORT"
