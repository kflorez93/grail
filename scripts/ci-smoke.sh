#!/usr/bin/env bash
set -euo pipefail

# Doctor
node ./cli/src/index.js doctor --pretty

# Quick docs run (n=1)
node ./cli/src/index.js docs "nextjs static generation" --site vercel.com --n 1 --pretty
