#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

detect_lan_ip() {
  if command -v ipconfig >/dev/null 2>&1; then
    local ip
    ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
    if [[ -n "$ip" ]]; then
      printf '%s\n' "$ip"
      return 0
    fi
  fi

  if command -v ipconfig >/dev/null 2>&1; then
    local ip
    ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
    if [[ -n "$ip" ]]; then
      printf '%s\n' "$ip"
      return 0
    fi
  fi

  if command -v ifconfig >/dev/null 2>&1; then
    ifconfig | awk '/inet 192\.168\.|inet 10\.|inet 172\.(1[6-9]|2[0-9]|3[0-1])\./ {print $2; exit}'
  fi
}

LAN_IP="$(detect_lan_ip)"

if [[ -z "${LAN_IP}" ]]; then
  echo "Could not detect a LAN IP automatically."
  exit 1
fi

LAN_DOMAIN="${LAN_IP}.sslip.io"
APP_URL="https://app.${LAN_DOMAIN}"

export HOST="0.0.0.0"
export LOCAL_DEV_DOMAIN="${LAN_DOMAIN}"
export NEXTAUTH_URL="${APP_URL}"
export NEXT_PUBLIC_APP_URL="${APP_URL}"
export AUTH_SERVICE_URL="http://127.0.0.1:3001"
export CHAT_SERVICE_URL="http://127.0.0.1:3002"
export CALL_SERVICE_URL="http://127.0.0.1:3003"
export NOTIFICATION_SERVICE_URL="http://127.0.0.1:3004"
export FILE_SERVICE_URL="http://127.0.0.1:3005"
export NEXT_PUBLIC_WS_URL="${APP_URL}"
export NEXT_PUBLIC_WS_PATH="/socket.io-chat"
export CALL_SIGNALING_URL="${APP_URL}"
export NEXT_PUBLIC_CALL_SIGNALING_PATH="/socket.io-call"

mkdir -p ./.local/caddy/data ./.local/caddy/config
docker compose up -d caddy

echo "Starting HTTPS LAN dev mode"
echo "App URL: ${APP_URL}"
echo "Chat WS: ${NEXT_PUBLIC_WS_URL}${NEXT_PUBLIC_WS_PATH}"
echo "Call signaling: ${CALL_SIGNALING_URL}${NEXT_PUBLIC_CALL_SIGNALING_PATH}"
echo
echo "Share this URL with teammates on the same network:"
echo "  ${APP_URL}"
echo
echo "If a browser warns about the local certificate, trust this Caddy root CA on each laptop:"
echo "  ${ROOT_DIR}/.local/caddy/data/caddy/pki/authorities/local/root.crt"
echo

pnpm turbo run dev \
  --filter=@comms/auth-service \
  --filter=@comms/chat-service \
  --filter=@comms/call-service \
  --filter=@comms/notification-service \
  --filter=@comms/file-service \
  --filter=@comms/web
