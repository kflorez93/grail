#!/usr/bin/env bash
set -euo pipefail

TOPIC=${1:-"nextjs static generation"}
SITE=${2:-"vercel.com"}
PORT=${PORT:-8787}

# Check daemon health
curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null || { echo "Daemon not healthy on ${PORT}"; exit 1; }

# Search & pick
node ./cli/src/index.js search "$TOPIC" --site "$SITE" | head -n 5 > .grail-cache/last-search.jsonl
node ./cli/src/index.js pick "$TOPIC" --site "$SITE" --n 3 > .grail-cache/last-picks.jsonl

# Docs bundle
node ./cli/src/index.js docs "$TOPIC" --site "$SITE" --n 3 --pretty | tee .grail-cache/last-bundle.out

echo "Smoke run complete. See .grail-cache/ for artifacts."
