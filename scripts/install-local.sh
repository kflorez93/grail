#!/usr/bin/env bash
set -euo pipefail

PREFIX="${HOME}/.local/bin"
mkdir -p "$PREFIX"

# Link CLI executable
ln -sf "$(pwd)/cli/src/index.js" "$PREFIX/grail"
chmod +x "$PREFIX/grail"

# Link scripts
for f in ai-session ai-watch ai-status ai-tree; do
  ln -sf "$(pwd)/scripts/$f" "$PREFIX/$f"
  chmod +x "$PREFIX/$f"
done

echo "Installed to $PREFIX. Ensure it's on your PATH:"
echo "  export PATH=\"$PREFIX:\$PATH\""
