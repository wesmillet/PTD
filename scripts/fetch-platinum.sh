#!/usr/bin/env bash
# Sparse-checkout the Pokémon Platinum graphics the game reskins with from the
# pret/pokeplatinum decompilation (never the whole repo), then run
# `python3 scripts/build-platinum.py` to convert them into public/assets/.
#
# The decomp stores the game's own art as indexed PNGs (palette index 0 is the
# transparent background) plus NDS tilemaps (.NSCR) for screens such as the
# town map. build-platinum.py keys the PNGs and reassembles the tilemaps.
set -euo pipefail
WORK="${POKEPLATINUM_DIR:-/tmp/pokeplatinum}"
REPO="https://github.com/pret/pokeplatinum"
if [ ! -d "$WORK/.git" ]; then
  git clone --depth 1 --filter=blob:none --sparse --no-checkout "$REPO" "$WORK"
fi
cd "$WORK"
git sparse-checkout set --no-cone \
  '/README.md' \
  '/res/trainers/classes/*' \
  '/res/graphics/field_sprites/npc/*' \
  '/res/graphics/field_sprites/player/*' \
  '/res/graphics/town_map/*' \
  '/res/graphics/windows/*' \
  '/res/graphics/map_popups/*' \
  '/res/graphics/trainer_case/*' \
  '/res/graphics/battle/type_icons/*' \
  '/res/field/maps/texture_sets/*' \
  '/res/field/area_data/*' \
  '/include/data/map_headers.h'
git checkout
echo "Platinum graphics in $WORK/res"
