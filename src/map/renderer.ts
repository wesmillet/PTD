/**
 * Draws a MapModel with Phaser: the ground and decoration layers as tilemap
 * layers, and the terrain layer as autotiles composed into one render
 * texture per animation frame. Cells can be changed live for the editor.
 */
import Phaser from 'phaser';
import { composeCell, FRAME_HEIGHT, FRAME_WIDTH, QUARTER, maskGrid, quadrantOffset, type Quadrant } from './autotile';
import { terrain, terrains, tilesets } from './catalogue';
import { TILE_SIZE, toPhaserTiled, type MapModel } from './tiled';

const DEPTH_GROUND = 0;
const DEPTH_TERRAIN = 0.4;
const DEPTH_DECORATION = 0.8;

let nextMapKey = 0;

export function tilesetTextureKey(tilesetId: string): string {
  return `tileset-${tilesetId}`;
}

export function autotileTextureKey(terrainId: string): string {
  return `autotile-${terrainId}`;
}

export class MapRenderer {
  private readonly scene: Phaser.Scene;
  private readonly offsetY: number;
  private model: MapModel;
  private mapKey = '';
  private tilemap?: Phaser.Tilemaps.Tilemap;
  private ground?: Phaser.Tilemaps.TilemapLayer;
  private decoration?: Phaser.Tilemaps.TilemapLayer;
  private terrainTextures: Phaser.GameObjects.RenderTexture[] = [];
  private frame = 0;
  private frameMs = 250;
  private frameClock = 0;

  /** Queues every shipped tileset and autotile image (they are small). Call from preload. */
  static queueAssets(scene: Phaser.Scene): void {
    const base = import.meta.env.BASE_URL;
    for (const ts of tilesets()) {
      const key = tilesetTextureKey(ts.id);
      if (!scene.textures.exists(key)) scene.load.image(key, `${base}${ts.image}`);
    }
    for (const t of terrains()) {
      const key = autotileTextureKey(t.id);
      if (!scene.textures.exists(key)) scene.load.image(key, `${base}${t.image}`);
    }
  }

  constructor(scene: Phaser.Scene, model: MapModel, offsetY: number) {
    this.scene = scene;
    this.offsetY = offsetY;
    this.model = model;
    this.build();
  }

  get currentModel(): MapModel {
    return this.model;
  }

  /** Replaces the whole map (editor import, resize, tileset change). */
  setModel(model: MapModel): void {
    this.teardown();
    this.model = model;
    this.build();
  }

  setGround(x: number, y: number, value: number): void {
    this.model.ground[y * this.model.width + x] = value;
    this.putTile(this.ground, x, y, value);
  }

  setDecoration(x: number, y: number, value: number): void {
    this.model.decoration[y * this.model.width + x] = value;
    this.putTile(this.decoration, x, y, value);
  }

  setTerrain(x: number, y: number, id: string): void {
    this.model.terrain[y * this.model.width + x] = id;
  }

  /** Recomposes the terrain layer; call after one or more setTerrain calls. */
  redrawTerrain(): void {
    this.drawTerrain();
  }

  /** Advances autotile animation. */
  update(deltaMs: number): void {
    if (this.terrainTextures.length < 2) return;
    this.frameClock += deltaMs;
    if (this.frameClock < this.frameMs) return;
    this.frameClock -= this.frameMs;
    this.frame = (this.frame + 1) % this.terrainTextures.length;
    this.terrainTextures.forEach((rt, i) => rt.setVisible(i === this.frame));
  }

  destroy(): void {
    this.teardown();
  }

  // ---------------------------------------------------------------- internals

  private putTile(layer: Phaser.Tilemaps.TilemapLayer | undefined, x: number, y: number, value: number): void {
    if (!layer) return;
    if (value === 0) layer.removeTileAt(x, y, true, false);
    else layer.putTileAt(value, x, y, false);
  }

  private build(): void {
    const scene = this.scene;
    const model = this.model;
    this.mapKey = `map-${model.name}-${nextMapKey++}`;
    scene.cache.tilemap.add(this.mapKey, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: toPhaserTiled(model) });
    const tilemap = scene.make.tilemap({ key: this.mapKey });
    this.tilemap = tilemap;
    const textureKey = tilesetTextureKey(model.tileset);
    const tileset = tilemap.addTilesetImage(model.tileset, textureKey, TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error(`map renderer: tileset ${model.tileset} (${textureKey}) is not loaded`);
    this.ground = tilemap.createLayer('ground', tileset, 0, this.offsetY) ?? undefined;
    this.ground?.setDepth(DEPTH_GROUND);
    this.decoration = tilemap.createLayer('decoration', tileset, 0, this.offsetY) ?? undefined;
    this.decoration?.setDepth(DEPTH_DECORATION);
    this.drawTerrain();
  }

  private teardown(): void {
    for (const rt of this.terrainTextures) rt.destroy();
    this.terrainTextures = [];
    this.ground?.destroy();
    this.decoration?.destroy();
    this.ground = undefined;
    this.decoration = undefined;
    this.tilemap?.destroy();
    this.tilemap = undefined;
    if (this.mapKey && this.scene.cache.tilemap.has(this.mapKey)) this.scene.cache.tilemap.remove(this.mapKey);
    this.mapKey = '';
  }

  /** Registers the 16x16 quarter frames of an autotile texture once. */
  private ensureQuarterFrames(key: string, frames: number): void {
    const texture = this.scene.textures.get(key);
    const marker = 'quarters';
    if (texture.has(marker)) return;
    const columns = (FRAME_WIDTH / QUARTER) * frames;
    const rows = FRAME_HEIGHT / QUARTER;
    for (let qy = 0; qy < rows; qy++) {
      for (let qx = 0; qx < columns; qx++) texture.add(`${qx},${qy}`, 0, qx * QUARTER, qy * QUARTER, QUARTER, QUARTER);
    }
    texture.add(marker, 0, 0, 0, 1, 1);
  }

  private drawTerrain(): void {
    const model = this.model;
    const used = new Set(model.terrain.filter((id) => id !== ''));
    let frameCount = 1;
    let frameMs = Number.POSITIVE_INFINITY;
    for (const id of used) {
      const t = terrain(id);
      frameCount = Math.max(frameCount, t.frames);
      if (t.frames > 1) frameMs = Math.min(frameMs, t.frameMs);
      this.ensureQuarterFrames(autotileTextureKey(id), t.frames);
    }
    this.frameMs = Number.isFinite(frameMs) ? frameMs : 250;
    // Reuse render textures when the frame count is unchanged.
    while (this.terrainTextures.length > frameCount) this.terrainTextures.pop()?.destroy();
    while (this.terrainTextures.length < frameCount) {
      const rt = this.scene.add.renderTexture(0, this.offsetY, model.width * TILE_SIZE, model.height * TILE_SIZE).setOrigin(0, 0).setDepth(DEPTH_TERRAIN);
      this.terrainTextures.push(rt);
    }
    if (this.frame >= frameCount) this.frame = 0;
    const masks = maskGrid(model.terrain, model.width, model.height, { edgesConnect: true });
    this.terrainTextures.forEach((rt, f) => {
      rt.setVisible(f === this.frame);
      if (rt.width !== model.width * TILE_SIZE || rt.height !== model.height * TILE_SIZE) rt.setSize(model.width * TILE_SIZE, model.height * TILE_SIZE);
      rt.clear();
      if (used.size === 0) return;
      rt.beginDraw();
      for (let y = 0; y < model.height; y++) {
        for (let x = 0; x < model.width; x++) {
          const i = y * model.width + x;
          const id = model.terrain[i];
          if (!id) continue;
          const t = terrain(id);
          const frame = f % t.frames;
          const key = autotileTextureKey(id);
          const quarters = composeCell(masks[i]!);
          for (let q = 0; q < 4; q++) {
            const ref = quarters[q]!;
            const off = quadrantOffset(q as Quadrant);
            const qx = (ref.x + frame * FRAME_WIDTH) / QUARTER;
            const qy = ref.y / QUARTER;
            rt.batchDrawFrame(key, `${qx},${qy}`, x * TILE_SIZE + off.x, y * TILE_SIZE + off.y);
          }
        }
      }
      rt.endDraw();
    });
  }
}
