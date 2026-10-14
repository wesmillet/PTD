#!/usr/bin/env bash
# Fetch Gen 5 (Black/White) box icons from github.com/PokeAPI/sprites for the
# given species ids, via a sparse checkout (never the whole repo).
# Usage: scripts/fetch-icons.sh <id> [<id>...]   e.g. 387 390 393
#
# Copies into public/assets/icons/:
#   <id>.png        static 32x32 icon (generation-v/icons, falling back to
#                   generation-viii/icons for forms without a Gen 5 icon)
#   <id>-anim.png   the two-frame APNG, used as-is by DOM screens
#   <id>-f0.png / <id>-f1.png   the APNG split into frames for the canvas
set -euo pipefail
if [ "$#" -lt 1 ]; then
  echo "usage: $0 <id> [<id>...]" >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${POKEAPI_SPRITES_DIR:-/tmp/pokeapi-sprites}"
REPO="https://github.com/PokeAPI/sprites"
GEN5="sprites/pokemon/versions/generation-v/icons"
GEN8="sprites/pokemon/versions/generation-viii/icons"

if [ ! -d "$WORK/.git" ]; then
  GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --filter=blob:none --sparse --no-checkout "$REPO" "$WORK"
fi
cd "$WORK"
paths=(/README.md)
for id in "$@"; do
  paths+=("/$GEN5/$id.png" "/$GEN5/$id-*.png" "/$GEN5/animated/$id.png" "/$GEN5/animated/$id-*.png" "/$GEN8/$id.png" "/$GEN8/$id-*.png")
done
git sparse-checkout set --no-cone "${paths[@]}"
git checkout -q HEAD

dest="$ROOT/public/assets/icons"
mkdir -p "$dest"
for id in "$@"; do
  for src in "$WORK/$GEN5/$id.png" "$WORK/$GEN5/$id"-*.png; do
    [ -f "$src" ] || continue
    name="$(basename "$src" .png)"
    cp -f "$src" "$dest/$name.png"
    anim="$WORK/$GEN5/animated/$name.png"
    if [ -f "$anim" ]; then
      cp -f "$anim" "$dest/$name-anim.png"
      node "$ROOT/scripts/split-apng.mjs" "$anim" "$dest/$name" > /dev/null
    fi
  done
  if [ ! -f "$dest/$id.png" ]; then
    # No Gen 5 icon (Hisuian forms and later species): use the Gen 8 icon, static only.
    for src in "$WORK/$GEN8/$id.png" "$WORK/$GEN8/$id"-*.png; do
      [ -f "$src" ] || continue
      cp -f "$src" "$dest/$(basename "$src")"
      echo "gen-viii fallback for $(basename "$src")"
    done
  fi
  [ -f "$dest/$id.png" ] || echo "no icon for $id" >&2
done
echo "icons in $dest: $(ls "$dest" | wc -l) files"
