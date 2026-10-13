#!/usr/bin/env bash
# Sparse-checkout only data/v2/csv/ from the PokeAPI repository (never the
# whole repo). Then run `node scripts/build-pokedata.ts` to emit src/data/*.json.
set -euo pipefail
WORK="${POKEAPI_DIR:-/tmp/pokeapi}"
REPO="https://github.com/PokeAPI/pokeapi"
if [ ! -d "$WORK/.git" ]; then
  git clone --depth 1 --filter=blob:none --sparse "$REPO" "$WORK"
fi
cd "$WORK"
git sparse-checkout set --no-cone '/data/v2/csv/*'
echo "PokeAPI CSVs in $WORK/data/v2/csv"
