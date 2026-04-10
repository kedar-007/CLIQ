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
  echo "Set NEXTAUTH_URL and NEXT_PUBLIC_WS_URL manually, then run pnpm dev."
  exit 1
fi

export HOST="0.0.0.0"
export NEXTAUTH_URL="http://${LAN_IP}:3000"
export NEXT_PUBLIC_APP_URL="http://${LAN_IP}:3000"
export AUTH_SERVICE_URL="http://127.0.0.1:3001"
export CHAT_SERVICE_URL="http://127.0.0.1:3002"
export CALL_SERVICE_URL="http://127.0.0.1:3003"
export NOTIFICATION_SERVICE_URL="http://127.0.0.1:3004"
export FILE_SERVICE_URL="http://127.0.0.1:3005"
export NEXT_PUBLIC_WS_URL="ws://${LAN_IP}:3002"
export CALL_SIGNALING_URL="http://${LAN_IP}:3003"

echo "Starting LAN dev mode"
echo "Web URL: ${NEXTAUTH_URL}"
echo "Chat WS: ${NEXT_PUBLIC_WS_URL}"
echo "Call signaling: ${CALL_SIGNALING_URL}"
echo
echo "Share this URL with teammates on the same network:"
echo "  ${NEXTAUTH_URL}"
echo

pnpm turbo run dev \
  --filter=@comms/auth-service \
  --filter=@comms/chat-service \
  --filter=@comms/call-service \
  --filter=@comms/notification-service \
  --filter=@comms/file-service \
  --filter=@comms/web
