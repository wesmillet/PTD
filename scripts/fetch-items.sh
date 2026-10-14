#!/usr/bin/env bash
# Fetch Gen 5 item sprites from github.com/PokeAPI/sprites via a sparse
# checkout (never the whole repo). Usage: scripts/fetch-items.sh <name> [...]
# e.g. poke-ball great-ball potion rare-candy
#
# Copies sprites/items/gen5/<name>.png into public/assets/items/<name>.png,
# falling back to sprites/items/<name>.png when the gen5 folder lacks one.
set -euo pipefail
if [ "$#" -lt 1 ]; then
  echo "usage: $0 <name> [<name>...]" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${POKEAPI_SPRITES_DIR:-/tmp/pokeapi-sprites}"
REPO="https://github.com/PokeAPI/sprites"
GEN5="sprites/items/gen5"
ALL="sprites/items"

if [ ! -d "$WORK/.git" ]; then
  GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --filter=blob:none --sparse --no-checkout "$REPO" "$WORK"
fi
cd "$WORK"
# Keep whatever the icon fetch checked out and add the item files.
mapfile -t existing < <(git sparse-checkout list 2>/dev/null || true)
paths=("${existing[@]}" /README.md)
for name in "$@"; do
  paths+=("/$GEN5/$name.png" "/$ALL/$name.png")
done
git sparse-checkout set --no-cone "${paths[@]}"
git checkout -q HEAD

dest="$ROOT/public/assets/items"
mkdir -p "$dest"
for name in "$@"; do
  if [ -f "$WORK/$GEN5/$name.png" ]; then
    cp -f "$WORK/$GEN5/$name.png" "$dest/$name.png"
  elif [ -f "$WORK/$ALL/$name.png" ]; then
    cp -f "$WORK/$ALL/$name.png" "$dest/$name.png"
    echo "no gen5 sprite for $name; used sprites/items/$name.png"
  else
    echo "no item sprite for $name" >&2
    exit 1
  fi
done
echo "items in $dest: $(ls "$dest" | tr '\n' ' ')"
