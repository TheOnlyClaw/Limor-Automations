#!/usr/bin/env bash
set -euo pipefail

# Starts an ngrok tunnel for the webhook listener service.
# Requires: ngrok CLI installed + authenticated (`ngrok config add-authtoken ...`).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env.local"
  set +a
fi

PORT="${1:-${WEBHOOKS_PORT:-3001}}"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not found. Install it first: https://ngrok.com/download" >&2
  exit 1
fi

echo "Starting ngrok tunnel to http://localhost:$PORT" >&2
echo "Webhook callback URL: https://<your-ngrok-domain>/api/v1/webhooks/instagram" >&2
echo "Verify token env var: IG_WEBHOOK_VERIFY_TOKEN" >&2

exec ngrok http "$PORT"
