#!/usr/bin/env bash
# Fetch PMDCollab SpriteCollab sprite folders via a sparse checkout.
# Usage: scripts/fetch-sprites.sh <dexnum> [<dexnum>...]   e.g. 0387 0390
#
# Never clones the whole repo (see GAME_DESIGN.md, "Sprites and assets").
# Copies the top-level files of each sprite folder (AnimData.xml, the
# *-Anim.png / *-Shadow.png / *-Offsets.png sheets and credits.txt), the base
# form's shiny folder into <dex>/shiny/, and the portrait PNGs the game uses.
# Other forms are left for a later phase. credits.txt files are copied verbatim.
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <dexnum> [<dexnum>...]" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${SPRITECOLLAB_DIR:-/tmp/spritecollab}"
REPO="https://github.com/PMDCollab/SpriteCollab"

if [ ! -d "$WORK/.git" ]; then
  GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --filter=blob:none --sparse "$REPO" "$WORK"
fi

cd "$WORK"
paths=(/tracker.json /sprite_config.json /credit_names.txt)
for dex in "$@"; do
  paths+=("/sprite/$dex/*" "/portrait/$dex/*")
done
git sparse-checkout set --no-cone "${paths[@]}"

PORTRAITS=(Normal Happy Sad Angry Surprised)

for dex in "$@"; do
  src="$WORK/sprite/$dex"
  dest="$ROOT/public/assets/sprites/$dex"
  if [ ! -d "$src" ]; then
    echo "no sprite folder for $dex in SpriteCollab" >&2
    exit 1
  fi
  mkdir -p "$dest"
  find "$src" -maxdepth 1 -type f -exec cp -f {} "$dest/" \;
  echo "copied sprite/$dex -> public/assets/sprites/$dex"

  # Shiny of the base form lives at sprite/<dex>/0000/0001 (tracker.json subgroups).
  shiny="$src/0000/0001"
  if [ -f "$shiny/AnimData.xml" ]; then
    mkdir -p "$dest/shiny"
    find "$shiny" -maxdepth 1 -type f -exec cp -f {} "$dest/shiny/" \;
    echo "copied sprite/$dex/0000/0001 -> public/assets/sprites/$dex/shiny"
  else
    echo "no shiny sprites for $dex (skipped)"
  fi

  # Portraits: one 40x40 PNG per emotion.
  pdest="$ROOT/public/assets/portraits/$dex"
  if [ -d "$WORK/portrait/$dex" ]; then
    mkdir -p "$pdest"
    for emotion in "${PORTRAITS[@]}"; do
      if [ -f "$WORK/portrait/$dex/$emotion.png" ]; then cp -f "$WORK/portrait/$dex/$emotion.png" "$pdest/"; fi
    done
    [ -f "$WORK/portrait/$dex/credits.txt" ] && cp -f "$WORK/portrait/$dex/credits.txt" "$pdest/"
    echo "copied portraits for $dex: $(ls "$pdest" | tr '\n' ' ')"
  else
    echo "no portraits for $dex (skipped)"
  fi
done

cp -f "$WORK/credit_names.txt" "$ROOT/assets-src/spritecollab/credit_names.txt"
node "$ROOT/scripts/build-sprite-index.mjs" "$WORK/tracker.json" "$ROOT/src/data/spriteIndex.json" "$ROOT/assets-src/spritecollab/credit_names.txt"
