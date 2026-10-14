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
/** Texture keys of sheets whose download may fail without failing the Pokémon: optional actions and every shadow sheet. */
const optionalKeys = new Map<string, { dex: string; action: string; shadow: boolean }>();
const warned = new Set<string>();

/** Whether a loader file key belongs to an optional sheet (a failed download drops the action, nothing else). */
export function isOptionalSheetKey(key: string): boolean {
  return optionalKeys.has(key);
}

/** Forgets an optional action whose sheet failed to download, so playAnim callers fall back; returns whether it was one. */
export function dropFailedSheet(key: string): boolean {
  const info = optionalKeys.get(key);
  if (!info) return false;
  if (!info.shadow) loadedSets.get(info.dex)?.actions.delete(info.action);
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`pmdLoader: ${key} did not download; ${info.shadow ? 'shadow' : `action ${info.action}`} skipped for ${info.dex}`);
  }
  return true;
}

export function animDataKey(dex: string): string {
  return `pmd-${dex}-animdata`;
}

export function sheetKey(dex: string, sheet: string): string {
  return `pmd-${dex}-${sheet}`;
}

export function shadowSheetKey(dex: string, sheet: string): string {
  return `pmd-${dex}-${sheet}-shadow`;
}

function rawShadowSheetKey(dex: string, sheet: string): string {
  return `pmd-${dex}-${sheet}-shadow-raw`;
}

/** Alpha of the rendered shadow (0..255). */
const SHADOW_ALPHA = 110;

/**
 * SpriteCollab shadow sheets encode three nested shadow sizes by color:
 * red pixels form the small shadow, green adds the medium ring and blue the
 * large ring (a white pixel marks the center). `ShadowSize` in AnimData.xml
 * picks which rings apply. This converts the raw sheet into a translucent
 * black spritesheet for that size.
 */
function buildShadowTexture(scene: Phaser.Scene, rawKey: string, outKey: string, shadowSize: number, entry: AnimEntry): void {
  if (scene.textures.exists(outKey)) return;
  const raw = scene.textures.get(rawKey);
  const source = raw.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const width = source.width;
  const height = source.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('pmdLoader: no 2d canvas context for shadows');
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] as number;
    const g = px[i + 1] as number;
    const b = px[i + 2] as number;
    const a = px[i + 3] as number;
    const white = r > 200 && g > 200 && b > 200;
    const keep = a > 0 && (white || r > 200 || (shadowSize >= 1 && g > 200) || (shadowSize >= 2 && b > 200));
    px[i] = 0;
    px[i + 1] = 0;
    px[i + 2] = 0;
    px[i + 3] = keep ? SHADOW_ALPHA : 0;
  }
  ctx.putImageData(image, 0, 0);
  const texture = scene.textures.addCanvas(outKey, canvas);
  if (!texture) throw new Error(`pmdLoader: could not create shadow texture ${outKey}`);
  const columns = Math.floor(width / entry.frameWidth);
  const rows = Math.floor(height / entry.frameHeight);
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      texture.add(index++, 0, col * entry.frameWidth, row * entry.frameHeight, entry.frameWidth, entry.frameHeight);
    }
  }
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
  // If the download fails, forget the pending entry so a later preload (the
  // scene's automatic reload) requests the file again instead of skipping it.
  const onError = (file: Phaser.Loader.File) => {
    if (file.key !== key) return;
    pendingActions.delete(dex);
    scene.load.off('loaderror', onError);
  };
  scene.load.on('loaderror', onError);
  scene.load.once(`filecomplete-text-${key}`, (_key: string, _type: string, xml: string) => {
    scene.load.off('loaderror', onError);
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
    if (optional.has(action)) optionalKeys.set(texKey, { dex: set.dex, action, shadow: false });
    if (!scene.textures.exists(texKey)) {
      scene.load.spritesheet(texKey, `${SPRITE_ROOT}/${set.dex}/${entry.sheet}-Anim.png`, {
        frameWidth: entry.frameWidth,
        frameHeight: entry.frameHeight,
      });
    }
    const rawShadowKey = rawShadowSheetKey(set.dex, entry.sheet);
    optionalKeys.set(rawShadowKey, { dex: set.dex, action, shadow: true });
    if (shadows && !scene.textures.exists(rawShadowKey) && !scene.textures.exists(shadowSheetKey(set.dex, entry.sheet))) {
      scene.load.spritesheet(rawShadowKey, `${SPRITE_ROOT}/${set.dex}/${entry.sheet}-Shadow.png`, {
        frameWidth: entry.frameWidth,
        frameHeight: entry.frameHeight,
      });
    }
  }
}

/** Whether `dex` has finished loading (AnimData parsed and sheets queued). */
export function isLoaded(dex: string): boolean {
  return loadedSets.has(dex);
}

/**
 * Loads a Pokémon at runtime (outside preload) if it is not loaded yet,
 * then registers its animations. Resolves when ready; rejects on a load
 * error. Safe to call while another runtime load is in progress.
 */
export function ensureLoaded(scene: Phaser.Scene, dex: string, actions: readonly string[], options: QueueOptions = {}): Promise<void> {
  if (isLoaded(dex) && actions.every((a) => hasAction(dex, a) || options.optional?.includes(a))) {
    registerAnims(scene, dex);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    queuePokemon(scene, dex, actions, options);
    const done = () => {
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, failed);
      try {
        registerAnims(scene, dex);
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    const failed = (file: Phaser.Loader.File) => {
      if (dropFailedSheet(file.key)) return; // an optional sheet: the action is skipped, the load goes on
      if (file.key.includes(dex)) {
        scene.load.off(Phaser.Loader.Events.COMPLETE, done);
        reject(new Error(`failed to load ${file.src}`));
      }
    };
    scene.load.once(Phaser.Loader.Events.COMPLETE, done);
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, failed);
    if (!scene.load.isLoading()) scene.load.start();
  });
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
    if (!scene.textures.exists(texKey)) {
      // The sheet never arrived (a failed optional download): drop the action quietly.
      set.actions.delete(action);
      continue;
    }
    const texture = scene.textures.get(texKey);
    const columns = entry.durations.length;
    const expectedFrames = columns * DIRECTION_ROWS;
    // frameTotal counts the special __BASE frame as well.
    if (texture.frameTotal - 1 !== expectedFrames) {
      // A malformed sheet (Primal Dialga's Faint has 28 frames for a 224-frame AnimData entry):
      // drop the action instead of failing the whole Pokémon; callers fall back to Idle or Hurt.
      console.warn(`pmdLoader: ${dex}/${entry.sheet}-Anim.png has ${texture.frameTotal - 1} frames, expected ${expectedFrames}; action ${action} skipped`);
      set.actions.delete(action);
      continue;
    }
    const shadowKey = shadowSheetKey(dex, entry.sheet);
    const rawShadowKey = rawShadowSheetKey(dex, entry.sheet);
    if (!scene.textures.exists(shadowKey) && scene.textures.exists(rawShadowKey)) {
      buildShadowTexture(scene, rawShadowKey, shadowKey, set.animData.shadowSize, entry);
      scene.textures.remove(rawShadowKey);
    }
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
