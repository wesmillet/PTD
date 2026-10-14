/**
 * In-game map editor (DOM panel plus a Phaser overlay), opened from the debug
 * panel. Edits a copy of the level's MapModel live through the MapRenderer;
 * "Play" hands the draft back to the scene, Export downloads Tiled JSON,
 * Import loads one. See docs/maps.md.
 */
import Phaser from 'phaser';
import { entryAtIndex, stampIndex, terrains, tileEntries, tileset, tilesets, type Layer, type TerrainEntry, type TileEntry } from './catalogue';
import { cloneModel, createModel, fromTiled, inBounds, resizeModel, serializeTiled, toMapDef, TILE_SIZE, type MapModel } from './tiled';
import type { MapRenderer } from './renderer';
import { validateMap, type Tile } from '../sim/map';
import { isolateFromGame } from '../ui/domOverlay';

export interface MapEditorHooks {
  scene: Phaser.Scene;
  renderer: MapRenderer;
  /** Pixel offset of the map's top edge. */
  offsetY: number;
  /** Pointer position to tile, or null outside the map. */
  tileAt: (px: number, py: number) => Tile | null;
  /** Restart the level with this draft. */
  onPlay: (model: MapModel) => void;
  /** Close without keeping the draft. */
  onDiscard: () => void;
  /** Forget the draft and go back to the shipped map. */
  onReset: () => void;
}

type Tool = 'ground' | 'decoration' | 'terrain' | 'erase' | 'path' | 'placeable' | 'spawn' | 'exit';

const TOOLS: { id: Tool; label: string; help: string }[] = [
  { id: 'ground', label: 'Ground', help: 'Click to paint the selected ground tile. Drag paints 1x1 tiles. Right click erases.' },
  { id: 'decoration', label: 'Decoration', help: 'Click to place the selected decoration (trees, rocks, flowers). Right click removes a whole stamp.' },
  { id: 'terrain', label: 'Terrain', help: 'Click or drag to paint an autotile terrain; edges are drawn from the neighbours. Right click erases.' },
  { id: 'erase', label: 'Erase', help: 'Click or drag to erase the chosen layer.' },
  { id: 'path', label: 'Path', help: 'Click tiles in order to add waypoints; a bend is inserted when a segment is not straight.' },
  { id: 'placeable', label: 'Placeable', help: 'Click a tile to toggle whether Pokémon can be placed there.' },
  { id: 'spawn', label: 'Spawn', help: 'Click a tile to move the path start (where enemies appear).' },
  { id: 'exit', label: 'Exit', help: 'Click a tile to move the path end.' },
];

const PANEL_ID = 'ptd-map-editor';

export class MapEditor {
  readonly root: HTMLDivElement;
  active = true;
  private model: MapModel;
  private tool: Tool = 'ground';
  private eraseLayer: Layer | 'terrain' = 'decoration';
  private selectedTile: TileEntry | undefined;
  private selectedTerrain: TerrainEntry | undefined;
  private group = '';
  private hover: Tile | null = null;
  private painting = false;
  private paintButton = 0;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly refreshers: (() => void)[] = [];
  private status!: HTMLDivElement;
  private palette!: HTMLDivElement;
  private groupSelect!: HTMLSelectElement;
  private help!: HTMLDivElement;

  constructor(private readonly hooks: MapEditorHooks) {
    this.model = cloneModel(hooks.renderer.currentModel);
    this.overlay = hooks.scene.add.graphics().setDepth(950);
    document.getElementById(PANEL_ID)?.remove();
    this.root = document.createElement('div');
    this.root.id = PANEL_ID;
    this.root.style.cssText = [
      'position:fixed', 'left:8px', 'top:8px', 'width:300px', 'max-height:calc(100vh - 16px)', 'overflow:auto',
      'background:rgba(16,16,28,0.95)', 'color:#e8e8f0', 'font:12px monospace', 'padding:10px', 'border:1px solid #5a5a80',
      'border-radius:4px', 'z-index:11',
    ].join(';');
    this.build();
    isolateFromGame(this.root);
    document.body.appendChild(this.root);
    const firstGround = this.entriesFor('ground')[0];
    this.selectedTile = firstGround;
    this.selectedTerrain = terrains()[0];
    this.refresh();
    this.drawOverlay();
  }

  get draft(): MapModel {
    return this.model;
  }

  destroy(): void {
    this.active = false;
    this.root.remove();
    this.overlay.destroy();
    for (const l of this.labels) l.destroy();
    this.labels.length = 0;
  }

  // ---------------------------------------------------------------- pointer input (from the scene)

  onPointerDown(pointer: Phaser.Input.Pointer): void {
    const tile = this.hooks.tileAt(pointer.x, pointer.y);
    if (!tile) return;
    this.paintButton = pointer.rightButtonDown() ? 2 : 0;
    this.painting = true;
    this.apply(tile, this.paintButton === 2, true);
  }

  onPointerMove(pointer: Phaser.Input.Pointer): void {
    const tile = this.hooks.tileAt(pointer.x, pointer.y);
    const changed = (tile?.[0] !== this.hover?.[0] || tile?.[1] !== this.hover?.[1]);
    this.hover = tile;
    if (this.painting && pointer.isDown && tile && changed) this.apply(tile, this.paintButton === 2, false);
    if (changed) this.drawOverlay();
  }

  onPointerUp(): void {
    this.painting = false;
  }

  // ---------------------------------------------------------------- editing

  private idx(x: number, y: number): number {
    return y * this.model.width + x;
  }

  private apply(tile: Tile, erase: boolean, click: boolean): void {
    const [x, y] = tile;
    const tool = erase && this.tool !== 'erase' ? 'erase' : this.tool;
    const eraseLayer: Layer | 'terrain' = erase && this.tool !== 'erase'
      ? (this.tool === 'terrain' ? 'terrain' : this.tool === 'decoration' ? 'decoration' : this.tool === 'ground' ? 'ground' : this.eraseLayer)
      : this.eraseLayer;
    switch (tool) {
      case 'ground':
      case 'decoration': {
        const entry = this.selectedTile;
        if (!entry || entry.layer !== tool) return;
        if (!click && (entry.w > 1 || entry.h > 1)) return; // stamps only on click
        this.stamp(entry, x, y);
        break;
      }
      case 'terrain': {
        const t = this.selectedTerrain;
        if (!t) return;
        if (this.model.terrain[this.idx(x, y)] === t.id) return;
        this.hooks.renderer.setTerrain(x, y, t.id);
        this.model.terrain[this.idx(x, y)] = t.id;
        this.hooks.renderer.redrawTerrain();
        break;
      }
      case 'erase':
        this.erase(eraseLayer, x, y);
        break;
      case 'path':
        if (!click) return;
        this.addWaypoint(tile);
        break;
      case 'placeable': {
        if (!click) return;
        const i = this.model.placeable.findIndex(([px, py]) => px === x && py === y);
        if (i >= 0) this.model.placeable.splice(i, 1);
        else this.model.placeable.push([x, y]);
        break;
      }
      case 'spawn':
        if (!click) return;
        this.setSpawn(tile);
        break;
      case 'exit':
        if (!click) return;
        this.setExit(tile);
        break;
    }
    this.refresh();
    this.drawOverlay();
  }

  private stamp(entry: TileEntry, x0: number, y0: number): void {
    const r = this.hooks.renderer;
    for (let dy = 0; dy < entry.h; dy++) {
      for (let dx = 0; dx < entry.w; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (!inBounds(this.model, x, y)) continue;
        const value = stampIndex(entry, dx, dy) + 1;
        if (entry.layer === 'ground') r.setGround(x, y, value);
        else r.setDecoration(x, y, value);
        (entry.layer === 'ground' ? this.model.ground : this.model.decoration)[this.idx(x, y)] = value;
      }
    }
  }

  private erase(layer: Layer | 'terrain', x: number, y: number): void {
    const r = this.hooks.renderer;
    if (layer === 'terrain') {
      if (!this.model.terrain[this.idx(x, y)]) return;
      this.model.terrain[this.idx(x, y)] = '';
      r.setTerrain(x, y, '');
      r.redrawTerrain();
      return;
    }
    if (layer === 'ground') {
      this.model.ground[this.idx(x, y)] = 0;
      r.setGround(x, y, 0);
      return;
    }
    // Decoration: remove the whole stamp the cell belongs to.
    const value = this.model.decoration[this.idx(x, y)]!;
    if (value === 0) return;
    const entry = entryAtIndex(this.model.tileset, value - 1);
    if (!entry) {
      this.model.decoration[this.idx(x, y)] = 0;
      r.setDecoration(x, y, 0);
      return;
    }
    const columns = tileset(entry.tileset).columns;
    const local = value - 1 - entry.index;
    const ox = x - (local % columns);
    const oy = y - Math.floor(local / columns);
    for (let dy = 0; dy < entry.h; dy++) {
      for (let dx = 0; dx < entry.w; dx++) {
        const cx = ox + dx;
        const cy = oy + dy;
        if (!inBounds(this.model, cx, cy)) continue;
        if (this.model.decoration[this.idx(cx, cy)] !== stampIndex(entry, dx, dy) + 1) continue;
        this.model.decoration[this.idx(cx, cy)] = 0;
        r.setDecoration(cx, cy, 0);
      }
    }
  }

  /** Appends a waypoint, inserting a bend so every segment stays axis-aligned. */
  private addWaypoint(tile: Tile): void {
    const path = this.model.path;
    const last = path[path.length - 1];
    if (last && last[0] === tile[0] && last[1] === tile[1]) return;
    if (last && last[0] !== tile[0] && last[1] !== tile[1]) path.push([tile[0], last[1]]);
    path.push([tile[0], tile[1]]);
  }

  private setSpawn(tile: Tile): void {
    const path = this.model.path;
    if (path.length === 0) {
      path.push(tile);
      return;
    }
    const next = path[1];
    path[0] = tile;
    if (next && next[0] !== tile[0] && next[1] !== tile[1]) path.splice(1, 0, [next[0], tile[1]]);
    this.dedupePath();
  }

  private setExit(tile: Tile): void {
    const path = this.model.path;
    if (path.length <= 1) {
      this.addWaypoint(tile);
      return;
    }
    const prev = path[path.length - 2]!;
    path[path.length - 1] = tile;
    if (prev[0] !== tile[0] && prev[1] !== tile[1]) path.splice(path.length - 1, 0, [tile[0], prev[1]]);
    this.dedupePath();
  }

  private dedupePath(): void {
    const out: Tile[] = [];
    for (const p of this.model.path) {
      const last = out[out.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) continue;
      out.push(p);
    }
    this.model.path = out;
  }

  private validationError(): string | null {
    try {
      validateMap(toMapDef(this.model));
      if (this.model.placeable.length === 0) return 'no placeable tiles yet';
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  private replaceModel(model: MapModel): void {
    this.model = model;
    this.hooks.renderer.setModel(cloneModel(model));
    this.refresh();
    this.drawOverlay();
  }

  // ---------------------------------------------------------------- overlay

  private drawOverlay(): void {
    const g = this.overlay;
    const oy = this.hooks.offsetY;
    const s = TILE_SIZE;
    g.clear();
    for (const l of this.labels) l.destroy();
    this.labels.length = 0;
    for (const [x, y] of this.model.placeable) {
      g.lineStyle(2, 0x6fa8dc, 0.9).strokeRect(x * s + 3, oy + y * s + 3, s - 6, s - 6);
    }
    const path = this.model.path;
    if (path.length >= 2) {
      g.lineStyle(3, 0xffe066, 0.8);
      g.beginPath();
      path.forEach(([x, y], i) => {
        const px = x * s + s / 2;
        const py = oy + y * s + s / 2;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.strokePath();
    }
    path.forEach(([x, y], i) => {
      const px = x * s + s / 2;
      const py = oy + y * s + s / 2;
      const colour = i === 0 ? 0x5ad35a : i === path.length - 1 ? 0xd35a5a : 0xffe066;
      g.fillStyle(colour, 1).fillCircle(px, py, 5);
      if (i === 0 || (i === path.length - 1 && path.length > 1)) {
        const text = this.hooks.scene.add.text(px, py - 18, i === 0 ? 'IN' : 'OUT', { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(951);
        this.labels.push(text);
      }
    });
    if (this.hover) {
      const [x, y] = this.hover;
      let w = 1;
      let h = 1;
      if ((this.tool === 'ground' || this.tool === 'decoration') && this.selectedTile?.layer === this.tool) {
        w = this.selectedTile.w;
        h = this.selectedTile.h;
      }
      g.lineStyle(2, 0xffffff, 0.9).strokeRect(x * s + 1, oy + y * s + 1, w * s - 2, h * s - 2);
    }
  }

  // ---------------------------------------------------------------- DOM

  private entriesFor(layer: Layer): TileEntry[] {
    return tileEntries(this.model.tileset).filter((t) => t.layer === layer);
  }

  private build(): void {
    const root = this.root;
    root.appendChild(this.heading('Map editor'));
    this.status = document.createElement('div');
    this.status.style.cssText = 'color:#9a9ab0;margin-bottom:6px;white-space:pre-wrap';
    root.appendChild(this.status);

    // Map settings.
    const settings = document.createElement('div');
    settings.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:4px 6px;align-items:center;margin-bottom:6px';
    const nameInput = this.input('text', this.model.name);
    nameInput.addEventListener('change', () => {
      this.model.name = nameInput.value.trim().replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'map';
      nameInput.value = this.model.name;
      this.refresh();
    });
    const widthInput = this.input('number', String(this.model.width));
    const heightInput = this.input('number', String(this.model.height));
    const resize = this.button('Resize', () => {
      const w = Math.max(4, Math.min(200, Math.round(Number(widthInput.value) || this.model.width)));
      const h = Math.max(4, Math.min(200, Math.round(Number(heightInput.value) || this.model.height)));
      if (w === this.model.width && h === this.model.height) return;
      this.replaceModel(resizeModel(this.model, w, h));
    });
    const themeSelect = this.select(['grass', 'cave'], this.model.theme);
    themeSelect.addEventListener('change', () => {
      this.model.theme = themeSelect.value;
      this.refresh();
    });
    const tilesetSelect = this.select(tilesets().map((t) => t.id), this.model.tileset);
    tilesetSelect.addEventListener('change', () => {
      const id = tilesetSelect.value;
      if (id === this.model.tileset) return;
      if (!window.confirm('Changing the tileset clears the ground and decoration layers. Continue?')) {
        tilesetSelect.value = this.model.tileset;
        return;
      }
      const fresh = createModel(this.model.name, this.model.width, this.model.height, id, this.model.theme);
      fresh.terrain = [...this.model.terrain];
      fresh.path = this.model.path.map((t) => [t[0], t[1]]);
      fresh.placeable = this.model.placeable.map((t) => [t[0], t[1]]);
      const first = tileEntries(id).find((t) => t.layer === 'ground');
      if (first) fresh.ground.fill(first.index + 1);
      this.selectedTile = first;
      this.replaceModel(fresh);
      this.rebuildGroups();
    });
    const sizeRow = document.createElement('div');
    sizeRow.style.cssText = 'display:flex;gap:4px;align-items:center';
    widthInput.style.width = '48px';
    heightInput.style.width = '48px';
    sizeRow.append(widthInput, document.createTextNode('x'), heightInput, resize);
    settings.append(this.label('Name'), nameInput, this.label('Size'), sizeRow, this.label('Theme'), themeSelect, this.label('Tileset'), tilesetSelect);
    root.appendChild(settings);
    this.refreshers.push(() => {
      widthInput.value = String(this.model.width);
      heightInput.value = String(this.model.height);
      nameInput.value = this.model.name;
      themeSelect.value = this.model.theme;
      tilesetSelect.value = this.model.tileset;
    });

    // Tools.
    root.appendChild(this.heading('Tool'));
    const toolRow = document.createElement('div');
    toolRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px';
    const toolButtons = new Map<Tool, HTMLButtonElement>();
    for (const t of TOOLS) {
      const b = this.button(t.label, () => {
        this.tool = t.id;
        if ((t.id === 'ground' || t.id === 'decoration') && this.selectedTile?.layer !== t.id) this.selectedTile = this.entriesFor(t.id)[0];
        this.rebuildGroups();
        this.refresh();
        this.drawOverlay();
      });
      toolButtons.set(t.id, b);
      toolRow.appendChild(b);
    }
    root.appendChild(toolRow);
    const eraseRow = document.createElement('div');
    eraseRow.style.cssText = 'margin-bottom:4px';
    const eraseSelect = this.select(['decoration', 'ground', 'terrain'], this.eraseLayer);
    eraseSelect.addEventListener('change', () => (this.eraseLayer = eraseSelect.value as Layer | 'terrain'));
    eraseRow.append(this.label('Erase layer '), eraseSelect);
    root.appendChild(eraseRow);
    this.help = document.createElement('div');
    this.help.style.cssText = 'color:#9a9ab0;margin-bottom:6px';
    root.appendChild(this.help);
    this.refreshers.push(() => {
      for (const [id, b] of toolButtons) b.style.background = id === this.tool ? '#6fa8dc' : '';
      eraseRow.style.display = this.tool === 'erase' ? 'block' : 'none';
      this.help.textContent = TOOLS.find((t) => t.id === this.tool)?.help ?? '';
    });

    // Path controls.
    const pathRow = document.createElement('div');
    pathRow.style.cssText = 'margin-bottom:6px';
    pathRow.appendChild(this.button('Undo waypoint', () => {
      this.model.path.pop();
      this.refresh();
      this.drawOverlay();
    }));
    pathRow.appendChild(this.button('Clear path', () => {
      this.model.path = [];
      this.refresh();
      this.drawOverlay();
    }));
    pathRow.appendChild(this.button('Clear placeable', () => {
      this.model.placeable = [];
      this.refresh();
      this.drawOverlay();
    }));
    root.appendChild(pathRow);

    // Palette.
    root.appendChild(this.heading('Palette'));
    this.groupSelect = document.createElement('select');
    this.groupSelect.style.cssText = 'font:12px monospace;margin-bottom:4px;max-width:100%';
    this.groupSelect.addEventListener('change', () => {
      this.group = this.groupSelect.value;
      this.rebuildPalette();
    });
    root.appendChild(this.groupSelect);
    this.palette = document.createElement('div');
    this.palette.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;max-height:260px;overflow:auto;border:1px solid #33334a;padding:3px;margin-bottom:6px';
    root.appendChild(this.palette);
    this.rebuildGroups();

    // Actions.
    root.appendChild(this.heading('Map'));
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px';
    const play = this.button('Play edited map', () => {
      const err = this.validationError();
      if (err) {
        this.status.textContent = `Cannot play: ${err}`;
        return;
      }
      this.hooks.onPlay(cloneModel(this.model));
    });
    play.style.fontWeight = 'bold';
    actions.appendChild(play);
    actions.appendChild(this.button('Discard changes', () => this.hooks.onDiscard()));
    actions.appendChild(this.button('Reset to shipped map', () => this.hooks.onReset()));
    actions.appendChild(this.button('Export JSON', () => this.exportJson()));
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      file.text().then((text) => this.importJson(text, file.name)).catch((err: Error) => (this.status.textContent = `Import failed: ${err.message}`));
      fileInput.value = '';
    });
    actions.appendChild(this.button('Import JSON', () => fileInput.click()));
    actions.appendChild(fileInput);
    root.appendChild(actions);
    const note = document.createElement('div');
    note.style.cssText = 'color:#9a9ab0;margin-top:8px';
    note.textContent = 'Play restarts the level with the draft (the simulation is paused while editing). Export writes Tiled JSON; drop the file in src/data/maps/ and register it in src/data/maps.ts to ship it.';
    root.appendChild(note);
  }

  private rebuildGroups(): void {
    const groups = new Set<string>();
    if (this.tool === 'terrain') for (const t of terrains()) groups.add(t.group);
    else for (const t of this.entriesFor(this.tool === 'decoration' ? 'decoration' : 'ground')) groups.add(t.group);
    const list = [...groups];
    this.groupSelect.replaceChildren();
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All groups';
    this.groupSelect.appendChild(all);
    for (const g of list) {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      this.groupSelect.appendChild(opt);
    }
    if (!list.includes(this.group)) this.group = '';
    this.groupSelect.value = this.group;
    this.rebuildPalette();
  }

  private rebuildPalette(): void {
    this.palette.replaceChildren();
    const base = import.meta.env.BASE_URL;
    if (this.tool === 'terrain') {
      for (const t of terrains()) {
        if (this.group && t.group !== this.group) continue;
        const cell = this.paletteCell(t.name, `${base}${t.image}`, 0, 0, 1, 1, t === this.selectedTerrain);
        cell.addEventListener('click', () => {
          this.selectedTerrain = t;
          this.rebuildPalette();
          this.refresh();
        });
        this.palette.appendChild(cell);
      }
      return;
    }
    const layer: Layer = this.tool === 'decoration' ? 'decoration' : 'ground';
    const ts = tileset(this.model.tileset);
    for (const t of this.entriesFor(layer)) {
      if (this.group && t.group !== this.group) continue;
      const col = t.index % ts.columns;
      const row = Math.floor(t.index / ts.columns);
      const cell = this.paletteCell(t.name, `${base}${ts.image}`, col, row, t.w, t.h, t === this.selectedTile);
      cell.addEventListener('click', () => {
        this.selectedTile = t;
        if (this.tool !== 'ground' && this.tool !== 'decoration') this.tool = layer;
        this.rebuildPalette();
        this.refresh();
        this.drawOverlay();
      });
      this.palette.appendChild(cell);
    }
  }

  /** A 40px thumbnail showing a w x h tile stamp from a sheet, scaled to fit. */
  private paletteCell(name: string, image: string, col: number, row: number, w: number, h: number, selected: boolean): HTMLDivElement {
    const size = 40;
    const scale = Math.min(size / (w * TILE_SIZE), size / (h * TILE_SIZE), 1);
    const cell = document.createElement('div');
    cell.title = name;
    cell.style.cssText = `width:${size}px;height:${size}px;cursor:pointer;background:#22223a;border:2px solid ${selected ? '#ffe066' : '#33334a'};display:flex;align-items:center;justify-content:center;overflow:hidden`;
    const img = document.createElement('div');
    img.style.cssText = `width:${w * TILE_SIZE}px;height:${h * TILE_SIZE}px;background-image:url("${image}");background-position:-${col * TILE_SIZE}px -${row * TILE_SIZE}px;transform:scale(${scale});transform-origin:center;image-rendering:pixelated;flex:none`;
    cell.appendChild(img);
    return cell;
  }

  private refresh(): void {
    for (const r of this.refreshers) r();
    const selection = this.tool === 'terrain'
      ? `terrain: ${this.selectedTerrain?.name ?? 'none'}`
      : this.tool === 'ground' || this.tool === 'decoration'
        ? `${this.tool}: ${this.selectedTile?.name ?? 'none'}`
        : this.tool;
    const err = this.validationError();
    this.status.textContent = `${this.model.name}  ${this.model.width}x${this.model.height}  ${this.model.tileset}\n${selection}\n${this.model.path.length} waypoints, ${this.model.placeable.length} placeable\n${err ? `! ${err}` : 'map is valid'}`;
  }

  private exportJson(): void {
    const text = serializeTiled(this.model);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.model.name}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.status.textContent = `Exported ${a.download}`;
  }

  private importJson(text: string, fileName: string): void {
    try {
      const model = fromTiled(JSON.parse(text), fileName.replace(/\.json$/i, ''));
      this.replaceModel(model);
      this.selectedTile = this.entriesFor('ground')[0];
      this.rebuildGroups();
      this.status.textContent = `Imported ${fileName}`;
    } catch (err) {
      this.status.textContent = `Import failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // ---------------------------------------------------------------- DOM helpers

  private heading(text: string): HTMLElement {
    const h = document.createElement('div');
    h.textContent = text;
    h.style.cssText = 'font-weight:bold;margin:8px 0 4px;color:#ffffff';
    return h;
  }

  private label(text: string): HTMLElement {
    const s = document.createElement('span');
    s.textContent = text;
    return s;
  }

  private input(type: string, value: string): HTMLInputElement {
    const i = document.createElement('input');
    i.type = type;
    i.value = value;
    i.style.cssText = 'font:12px monospace;width:100%;box-sizing:border-box';
    return i;
  }

  private select(options: string[], value: string): HTMLSelectElement {
    const s = document.createElement('select');
    s.style.cssText = 'font:12px monospace';
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      s.appendChild(opt);
    }
    s.value = value;
    return s;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:12px monospace;cursor:pointer';
    b.addEventListener('click', onClick);
    return b;
  }
}
