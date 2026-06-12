#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Split the orderly/ folder out of the travel monorepo into its own standalone
# git repository, preserving the file tree (history optional).
#
# Usage (run from anywhere; edit DEST/REMOTE first):
#   bash orderly/scripts/extract-to-own-repo.sh
# ---------------------------------------------------------------------------
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # the orderly/ dir
DEST="${DEST:-$HOME/orderly-standalone}"
REMOTE="${REMOTE:-}"   # e.g. git@github.com:scrobservices-ux/orderly.git

echo "Copying $SRC_DIR -> $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
# Copy everything except node_modules / build output.
rsync -a --exclude node_modules --exclude .next "$SRC_DIR"/ "$DEST"/

cd "$DEST"
git init -b main
git add .
git commit -m "Initial commit: Orderly — AI admin-automation platform"

if [ -n "$REMOTE" ]; then
  git remote add origin "$REMOTE"
  echo "Remote set to $REMOTE. Push with: git push -u origin main"
else
  echo "No REMOTE set. Create an empty 'orderly' repo on GitHub, then:"
  echo "  cd $DEST && git remote add origin <url> && git push -u origin main"
fi
