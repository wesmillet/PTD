# Decisions log

One line each. Made during the unattended run; the rule was to pick what is
closest to Pokémon Tower Defense when the spec was ambiguous.

- Placements per level are 6 from the start (PTD lets you place the whole
  party), replacing the "N starts at 1" rule.
- A free level counts as completed for unlocking once at least one wave has
  been cleared when you leave it (PTD unlocks the next level after a win;
  free levels have no win, so one cleared wave is the equivalent).
- The debug party (Turtwig, Piplup, Chimchar, shiny Darkrai) is no longer the
  default; the real party comes from the starter choice and catches. Open a
  level with `?party=debug` to load it for testing.
- Caught Pokémon join the party immediately (if there is room) and can be
  placed in the same level, as in PTD; past 6 they go to the PC box.
- KO EXP is split evenly (floored) among every placed Pokémon that damaged
  the enemy; the small per-hit EXP stays per hit.
- Quick Ball counts as "first turn" when the target has taken no damage;
  Dusk Ball triggers in cave-themed maps or at night; Net Ball on Bug or
  Water types.
- Evolution prompts pause the simulation like the move-replace dialog; a
  cancelled evolution is offered again at the next level-up (PTD behaviour,
  no "Everstone" memory).
- New placeholder maps for Lake Verity, Route 202, Route 203 and Oreburgh
  Gate use the existing map format untouched (the maps branch owns the
  format and tilesets).
- The starter is chosen once before Route 201; Pokémon Tower Defense gave
  the three Sinnoh starters at level 5 the same way.
