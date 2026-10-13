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
 * per action. Shadow sheets are loaded alongside and drawn under the body.
 */
import Phaser from 'phaser';
import { DIRECTION_ROWS, parseAnimData, ticksToMs, type AnimData, type AnimEntry } from './animData';
import { ALL_DIRECTIONS, type Direction } from './direction';

/**
 * Folder that `scripts/fetch-sprites.sh` fills, resolved against Vite's
 * `base` so requests work both in `vite dev` and under the GitHub Pages
 * subpath (`/PTD/`).
 */
export const SPRITE_ROOT = `${import.meta.env.BASE_URL}assets/sprites`;

/** Actions that loop forever. Everything else plays once and holds. */
const LOOPING_ACTIONS: ReadonlySet<string> = new Set(['Idle', 'Walk', 'Sleep', 'EventSleep', 'Float']);

/** Phaser frame rate used as the fallback; per-frame durations override it. */
const FALLBACK_FRAME_RATE = 60;

/** Data key under which a sprite remembers its dex folder and current state. */
const DATA_DEX = 'pmdDex';
const DATA_ACTION = 'pmdAction';
const DATA_DIRECTION = 'pmdDirection';
const DATA_SHADOW = 'pmdShadow';

interface LoadedSet {
  dex: string;
  animData: AnimData;
  actions: Set<string>;
}

export interface QueueOptions {
  /** Actions that may be missing from this Pokémon's AnimData without error. */
  optional?: readonly string[];
  /** Also load `<Action>-Shadow.png` sheets (default true). */
  shadows?: boolean;
}

const loadedSets = new Map<string, LoadedSet>();
const pendingActions = new Map<string, { actions: Set<string>; optional: Set<string>; shadows: boolean }>();

export function animDataKey(dex: string): string {
  return `pmd-${dex}-animdata`;
}

export function sheetKey(dex: string, sheet: string): string {
  return `pmd-${dex}-${sheet}`;
}

export function shadowSheetKey(dex: string, sheet: string): string {
  return `pmd-${dex}-${sheet}-shadow`;
}

export function shadowAnimKey(dex: string, action: string, direction: Direction): string {
  return `pmd-${dex}-${action}-${direction}-shadow`;
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
export function queuePokemon(
  scene: Phaser.Scene,
  dex: string,
  actions: readonly string[],
  options: QueueOptions = {},
): void {
  const optional = new Set(options.optional ?? []);
  const shadows = options.shadows ?? true;
  const existing = loadedSets.get(dex);
  if (existing) {
    queueSheets(scene, existing, actions, optional, shadows);
    return;
  }

  // AnimData.xml may already be in flight from an earlier call in this
  // preload; just widen the set of actions it will queue when it lands.
  const pending = pendingActions.get(dex);
  if (pending) {
    for (const action of actions) pending.actions.add(action);
    for (const action of optional) pending.optional.add(action);
    pending.shadows ||= shadows;
    return;
  }
  pendingActions.set(dex, { actions: new Set(actions), optional, shadows });

  const key = animDataKey(dex);
  scene.load.text(key, `${SPRITE_ROOT}/${dex}/AnimData.xml`);
  scene.load.once(`filecomplete-text-${key}`, (_key: string, _type: string, xml: string) => {
    const set: LoadedSet = { dex, animData: parseAnimData(xml), actions: new Set() };
    loadedSets.set(dex, set);
    const wanted = pendingActions.get(dex) ?? { actions: new Set(actions), optional, shadows };
    pendingActions.delete(dex);
    queueSheets(scene, set, [...wanted.actions], wanted.optional, wanted.shadows);
  });
}

function queueSheets(
  scene: Phaser.Scene,
  set: LoadedSet,
  actions: readonly string[],
  optional: ReadonlySet<string>,
  shadows: boolean,
): void {
  for (const action of actions) {
    const entry = set.animData.anims[action];
    if (!entry) {
      if (optional.has(action)) continue;
      throw new Error(`pmdLoader: ${set.dex} has no action "${action}" in AnimData.xml`);
    }
    set.actions.add(action);
    const texKey = sheetKey(set.dex, entry.sheet);
    if (!scene.textures.exists(texKey)) {
      scene.load.spritesheet(texKey, `${SPRITE_ROOT}/${set.dex}/${entry.sheet}-Anim.png`, {
        frameWidth: entry.frameWidth,
        frameHeight: entry.frameHeight,
      });
    }
    const shadowKey = shadowSheetKey(set.dex, entry.sheet);
    if (shadows && !scene.textures.exists(shadowKey)) {
      scene.load.spritesheet(shadowKey, `${SPRITE_ROOT}/${set.dex}/${entry.sheet}-Shadow.png`, {
        frameWidth: entry.frameWidth,
        frameHeight: entry.frameHeight,
      });
    }
  }
}

/** Whether a loaded Pokémon has an animation registered for `action`. */
export function hasAction(dex: string, action: string): boolean {
  return loadedSets.get(dex)?.actions.has(action) ?? false;
}

/** First action of `candidates` that `dex` has, or undefined. */
export function pickAction(dex: string, candidates: readonly string[]): string | undefined {
  return candidates.find((a) => hasAction(dex, a));
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
    const shadowKey = shadowSheetKey(dex, entry.sheet);
    const hasShadow = scene.textures.exists(shadowKey);
    for (const direction of ALL_DIRECTIONS) {
      const key = animKey(dex, action, direction);
      if (!scene.anims.exists(key)) {
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
      const sKey = shadowAnimKey(dex, action, direction);
      if (hasShadow && !scene.anims.exists(sKey)) {
        scene.anims.create({
          key: sKey,
          frameRate: FALLBACK_FRAME_RATE,
          repeat: LOOPING_ACTIONS.has(action) ? -1 : 0,
          frames: entry.durations.map((ticks, column) => ({
            key: shadowKey,
            frame: direction * columns + column,
            duration: ticksToMs(ticks),
          })),
        });
      }
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
  const shadowKey = shadowSheetKey(dex, entry.sheet);
  if (scene.textures.exists(shadowKey)) {
    const shadow = scene.add.sprite(x, y, shadowKey, direction * entry.durations.length);
    shadow.setDepth(sprite.depth - 0.5);
    sprite.setData(DATA_SHADOW, shadow);
    sprite.once(Phaser.GameObjects.Events.DESTROY, () => shadow.destroy());
  }
  playAnim(sprite, action, direction);
  return sprite;
}

/** The shadow sprite created with a PMD sprite, if its sheet exists. */
export function spriteShadow(sprite: Phaser.GameObjects.Sprite): Phaser.GameObjects.Sprite | undefined {
  return sprite.getData(DATA_SHADOW) as Phaser.GameObjects.Sprite | undefined;
}

/** Keeps the shadow under the body; call after moving or scaling the sprite. */
export function syncShadow(sprite: Phaser.GameObjects.Sprite): void {
  const shadow = spriteShadow(sprite);
  if (!shadow) return;
  shadow.setPosition(sprite.x, sprite.y);
  shadow.setScale(sprite.scaleX, sprite.scaleY);
  shadow.setDepth(sprite.depth - 0.5);
  shadow.setVisible(sprite.visible);
  shadow.setAlpha(sprite.alpha);
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
  const shadow = spriteShadow(sprite);
  if (shadow) {
    const sKey = shadowAnimKey(dex, action, direction);
    if (shadow.anims.animationManager.exists(sKey)) {
      shadow.play(sKey);
      if (keepProgress) shadow.anims.setProgress(progress);
    }
    syncShadow(sprite);
  }
}
