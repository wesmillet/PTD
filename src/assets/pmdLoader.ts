/**
 * Phaser side of PMDCollab sprite support.
 *
 * Usage, inside a Scene:
 *
 *   preload() { queuePokemon(this, '0387', ['Idle', 'Walk']); }
 *   create()  { registerAnims(this, '0387');
 *               const s = createPmdSprite(this, '0387', x, y);
 *               playAnim(s, 'Walk', Direction.Left); }
 *
 * `AnimData.xml` is fetched first; once it arrives the sprite sheets it
 * describes are queued on the still-running loader (Phaser processes files
 * added mid-load). Each action is its own texture because frame sizes differ
 * per action. Shadow sheets are not registered yet (deferred to Phase 1).
 */
import Phaser from 'phaser';
import { DIRECTION_ROWS, parseAnimData, ticksToMs, type AnimData, type AnimEntry } from './animData';
import { ALL_DIRECTIONS, type Direction } from './direction';

/** Folder that `scripts/fetch-sprites.sh` fills, relative to the site root. */
export const SPRITE_ROOT = 'assets/sprites';

/** Actions that loop forever. Everything else plays once and holds. */
const LOOPING_ACTIONS: ReadonlySet<string> = new Set(['Idle', 'Walk', 'Sleep', 'EventSleep', 'Float']);

/** Phaser frame rate used as the fallback; per-frame durations override it. */
const FALLBACK_FRAME_RATE = 60;

/** Data key under which a sprite remembers its dex folder and current state. */
const DATA_DEX = 'pmdDex';
const DATA_ACTION = 'pmdAction';
const DATA_DIRECTION = 'pmdDirection';

interface LoadedSet {
  dex: string;
  animData: AnimData;
  actions: Set<string>;
}

const loadedSets = new Map<string, LoadedSet>();
const pendingActions = new Map<string, Set<string>>();

export function animDataKey(dex: string): string {
  return `pmd-${dex}-animdata`;
}

export function sheetKey(dex: string, sheet: string): string {
  return `pmd-${dex}-${sheet}`;
}

export function animKey(dex: string, action: string, direction: Direction): string {
  return `pmd-${dex}-${action}-${direction}`;
}

/** The parsed AnimData for a Pokémon that has been queued and loaded. */
export function getAnimData(dex: string): AnimData {
  const set = loadedSets.get(dex);
  if (!set) throw new Error(`pmdLoader: ${dex} has not been loaded (call queuePokemon in preload)`);
  return set.animData;
}

function entryFor(dex: string, action: string): AnimEntry {
  const entry = getAnimData(dex).anims[action];
  if (!entry) throw new Error(`pmdLoader: ${dex} has no action "${action}"`);
  return entry;
}

/**
 * Queues `AnimData.xml` and the sprite sheets for `actions`. Call from
 * `Scene.preload`. Safe to call again for more actions; already-loaded
 * textures are skipped.
 */
export function queuePokemon(scene: Phaser.Scene, dex: string, actions: readonly string[]): void {
  const existing = loadedSets.get(dex);
  if (existing) {
    queueSheets(scene, existing, actions);
    return;
  }

  // AnimData.xml may already be in flight from an earlier call in this
  // preload; just widen the set of actions it will queue when it lands.
  const pending = pendingActions.get(dex);
  if (pending) {
    for (const action of actions) pending.add(action);
    return;
  }
  pendingActions.set(dex, new Set(actions));

  const key = animDataKey(dex);
  scene.load.text(key, `${SPRITE_ROOT}/${dex}/AnimData.xml`);
  scene.load.once(`filecomplete-text-${key}`, (_key: string, _type: string, xml: string) => {
    const set: LoadedSet = { dex, animData: parseAnimData(xml), actions: new Set() };
    loadedSets.set(dex, set);
    const wanted = pendingActions.get(dex) ?? new Set(actions);
    pendingActions.delete(dex);
    queueSheets(scene, set, [...wanted]);
  });
}

function queueSheets(scene: Phaser.Scene, set: LoadedSet, actions: readonly string[]): void {
  for (const action of actions) {
    const entry = set.animData.anims[action];
    if (!entry) throw new Error(`pmdLoader: ${set.dex} has no action "${action}" in AnimData.xml`);
    set.actions.add(action);
    const texKey = sheetKey(set.dex, entry.sheet);
    if (scene.textures.exists(texKey)) continue;
    scene.load.spritesheet(texKey, `${SPRITE_ROOT}/${set.dex}/${entry.sheet}-Anim.png`, {
      frameWidth: entry.frameWidth,
      frameHeight: entry.frameHeight,
    });
  }
}

/**
 * Creates one Phaser animation per queued action per direction. Call from
 * `Scene.create` after the loader has finished. Idempotent.
 */
export function registerAnims(scene: Phaser.Scene, dex: string): void {
  const set = loadedSets.get(dex);
  if (!set) throw new Error(`pmdLoader: ${dex} was never queued`);
  for (const action of set.actions) {
    const entry = entryFor(dex, action);
    const texKey = sheetKey(dex, entry.sheet);
    const texture = scene.textures.get(texKey);
    const columns = entry.durations.length;
    const expectedFrames = columns * DIRECTION_ROWS;
    // frameTotal counts the special __BASE frame as well.
    if (texture.frameTotal - 1 !== expectedFrames) {
      throw new Error(
        `pmdLoader: ${dex}/${entry.sheet}-Anim.png has ${texture.frameTotal - 1} frames, expected ${expectedFrames}`,
      );
    }
    for (const direction of ALL_DIRECTIONS) {
      const key = animKey(dex, action, direction);
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frameRate: FALLBACK_FRAME_RATE,
        repeat: LOOPING_ACTIONS.has(action) ? -1 : 0,
        frames: entry.durations.map((ticks, column) => ({
          key: texKey,
          frame: direction * columns + column,
          duration: ticksToMs(ticks),
        })),
      });
    }
  }
}

/** A sprite bound to a dex folder, showing the first frame of `action`. */
export function createPmdSprite(
  scene: Phaser.Scene,
  dex: string,
  x: number,
  y: number,
  action = 'Idle',
  direction: Direction = 0,
): Phaser.GameObjects.Sprite {
  const entry = entryFor(dex, action);
  const sprite = scene.add.sprite(x, y, sheetKey(dex, entry.sheet), direction * entry.durations.length);
  sprite.setData(DATA_DEX, dex);
  playAnim(sprite, action, direction);
  return sprite;
}

/** Dex folder a sprite was created with via `createPmdSprite`. */
export function spriteDex(sprite: Phaser.GameObjects.Sprite): string {
  const dex = sprite.getData(DATA_DEX) as string | undefined;
  if (!dex) throw new Error('pmdLoader: sprite was not created with createPmdSprite');
  return dex;
}

export function spriteAction(sprite: Phaser.GameObjects.Sprite): string | undefined {
  return sprite.getData(DATA_ACTION) as string | undefined;
}

export function spriteDirection(sprite: Phaser.GameObjects.Sprite): Direction | undefined {
  return sprite.getData(DATA_DIRECTION) as Direction | undefined;
}

/**
 * Plays `action` facing `direction`. Re-playing the current action and
 * direction is a no-op. Turning while keeping the same action keeps the
 * animation's progress so a walking sprite does not stutter when it turns.
 */
export function playAnim(sprite: Phaser.GameObjects.Sprite, action: string, direction: Direction): void {
  const dex = spriteDex(sprite);
  const prevAction = spriteAction(sprite);
  const prevDirection = spriteDirection(sprite);
  if (prevAction === action && prevDirection === direction && sprite.anims.isPlaying) return;

  const key = animKey(dex, action, direction);
  if (!sprite.anims.animationManager.exists(key)) {
    throw new Error(`pmdLoader: animation ${key} is not registered (call registerAnims)`);
  }
  const keepProgress = prevAction === action && sprite.anims.isPlaying;
  const progress = keepProgress ? sprite.anims.getProgress() : 0;
  sprite.play(key);
  if (keepProgress) sprite.anims.setProgress(progress);
  sprite.setData(DATA_ACTION, action);
  sprite.setData(DATA_DIRECTION, direction);
}
