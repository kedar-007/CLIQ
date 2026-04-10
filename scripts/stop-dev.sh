#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

lsof -ti tcp:3000 tcp:3001 tcp:3002 tcp:3003 tcp:3004 tcp:3005 tcp:3006 tcp:3007 tcp:3008 tcp:3009 tcp:3010 tcp:3011 tcp:3012 tcp:3013 | xargs kill -9 2>/dev/null || true
docker compose down

echo "Development services stopped."
