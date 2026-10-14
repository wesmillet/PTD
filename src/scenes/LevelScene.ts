import Phaser from 'phaser';
import { SPOT_ELLIPSE, spotTexture } from '../ui/spotMarker';
import { Direction, directionFromVector } from '../assets/direction';
import { createPmdSprite, ensureLoaded, isLoaded, pickAction, playAnim, queuePokemon, registerAnims, spriteDex, spriteDirection, syncShadow } from '../assets/pmdLoader';
import { ALL_ACTIONS, OPTIONAL_ACTIONS, levelSpriteFolders } from '../game/assets';
import { getLevel } from '../data/levels';
import { getMapModel } from '../data/maps';
import { MapEditor } from '../map/editor';
import { editorStore } from '../map/editorStore';
import { MapRenderer } from '../map/renderer';
import { cloneModel, toMapDef, type MapModel } from '../map/tiled';
import config from '../data/config.json';
import { iconTextureKey, iconUrl, itemTextureKey, portraitUrl, runtime, runtimeConfig, spriteFolder, trainerTextureKey, urlParam } from '../game/runtime';
import { getGame, loadDebugPartyIfRequested, saveGame } from '../game/session';
import { addPokemon, markSeen, placementLimit, recordLevelResult } from '../sim/game';
import { usePotion } from '../sim/items';
import { BALLS } from '../sim/catch';
import { advance, createClock, type Clock } from '../sim/clock';
import { EvolutionDialog } from '../ui/evolutionDialog';
import { DialogueBox } from '../ui/dialogue';
import { showLocationPopup } from '../ui/locationPopup';
import { VsIntro } from '../ui/vsIntro';
import { MenuPages } from '../ui/menuPages';
import { SavePanel } from '../ui/savePanel';
import { StartMenu, startMenuEntries, type StartMenuId } from '../ui/startMenu';
import { currentSaveCode, importSaveCode, resetGame } from '../game/session';
import {
  activeBoss,
  createLevel,
  isOver,
  TRAINER_BLOCK_MESSAGE,
  leaveLevel,
  moveTower,
  placeTower,
  removeTower,
  resolveEvolution,
  resolveLearn,
  setActiveMove,
  throwBall,
  canThrow,
  setPartyLevel,
  setTimeOfDay,
  startWave,
  summarize,
  towerAt,
  towerMove,
  enemyPoint,
  isCatchable,
  placementBlock,
  playerTowers,
  ruleStatus,
  useRule,
  type Enemy,
  type LevelEvent,
  type LevelState,
  type Tower,
} from '../sim/level';
import { isPlaceable, pointAlongPath, validateMap, type MapDef } from '../sim/map';
import { DebugPanel } from '../ui/debugPanel';
import { Button } from '../ui/button';
import { Hud } from '../ui/hud';
import { LearnDialog } from '../ui/learnDialog';
import { PokemonPanel } from '../ui/pokemonPanel';
import { capitalize } from '../ui/domOverlay';
import { findPokemonId, getMove } from '../data/pokedata';
import { counterStarter, levelPopup, type DialogueLine } from '../sim/waves';
import type { Monster } from '../sim/monster';
import { COLORS, TEXT, TEXT_BIG, TEXT_DIM } from '../ui/styles';
import { STATUS_BADGE } from '../ui/domOverlay';
import { showSummary } from '../ui/summary';

/** Sprites sit a little above the tile center so their feet land on the tile. */
const SPRITE_Y_OFFSET = -4;
/** The trainer card name shown on the start menu and trainer card page. */
const PLAYER_NAME = 'Trainer';

interface EnemyView {
  sprite: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  badge?: Phaser.GameObjects.Image;
  shiny: boolean;
  /** Caught: frozen in place while the ball animation plays. */
  captured: boolean;
  /** Inside a thrown ball (hidden) until it clicks or bursts. */
  inBall: boolean;
  /** Playing Hurt or Faint; Walk must not override it. */
  busy: boolean;
  dying: boolean;
}

interface TowerView {
  sprite: Phaser.GameObjects.Sprite;
  busy: boolean;
  /** Battle-GUI HP bar and status badge under the placed Pokémon (no level: that stays in the panel). */
  hpBar: Phaser.GameObjects.Graphics;
  badge?: Phaser.GameObjects.Image;
}

export interface LevelSceneData {
  levelId?: string;
  seed?: number;
  /** Automatic reload attempts so far after a failed asset download. */
  retry?: number;
}

/** Delays before each automatic reload after a download failure (a redeploy or a dropped connection). */
const RELOAD_DELAYS_MS = [2000, 4000, 8000];

/**
 * Renders a LevelState and animates the events `step` returns. Owns no game
 * rules: everything it shows comes from the sim.
 */
export class LevelScene extends Phaser.Scene {
  private levelId = 'route-201';
  private seed = 1;
  private state!: LevelState;
  private hud!: Hud;
  private readonly enemyViews = new Map<number, EnemyView>();
  private readonly towerViews = new Map<number, TowerView>();
  private selectedTowerId: number | null = null;
  /** Party member chosen from the strip to be placed on the next tile click. */
  private selectedPartyIndex: number | null = null;
  private clock: Clock = createClock();
  private ended = false;
  private overlay!: Phaser.GameObjects.Graphics;
  private hoverTile: [number, number] | null = null;
  private toast?: Phaser.GameObjects.Text;
  private debugPanel?: DebugPanel;
  private mapRenderer?: MapRenderer;
  private mapEditor?: MapEditor;
  private mapModel!: MapModel;
  private placeableGfx?: Phaser.GameObjects.Container;
  private panel?: PokemonPanel;
  private learnDialog?: LearnDialog;
  private evolutionDialog?: EvolutionDialog;
  private startMenu?: StartMenu;
  private menuPages?: MenuPages;
  private savePanel?: SavePanel;
  private dialogue?: DialogueBox;
  private vsIntro?: VsIntro;
  private escortView?: Phaser.GameObjects.Sprite;
  /** Trainers whose VS intro and opening lines have played this level (later waves of theirs skip them). */
  private readonly introduced = new Set<string>();
  /** The trainer's throwing pose beside the entrance while their wave is being sent. */
  private trainerSprite?: Phaser.GameObjects.Image;
  private paused = false;
  /** A party-strip Pokémon being dragged onto the map. */
  private stripDrag: { partyIndex: number; startX: number; startY: number; moved: boolean; sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null } | null = null;
  private selectedBall: string | null = null;
  private drag: { towerId: number; startX: number; startY: number; moved: boolean } | null = null;
  private dragGfx!: Phaser.GameObjects.Graphics;
  private levelSynced = false;
  private moneyEarned = 0;

  constructor() {
    super('Level');
  }

  init(data: LevelSceneData): void {
    this.levelId = data.levelId ?? urlParam('level') ?? 'route-201';
    this.retry = data.retry ?? 0;
    this.loadFailed = false;
    this.failedFiles = [];
    const urlSeed = Number(urlParam('seed'));
    this.seed = data.seed ?? (Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : (Date.now() % 1_000_000) + 1);
    this.enemyViews.clear();
    this.towerViews.clear();
    this.selectedTowerId = null;
    this.selectedPartyIndex = null;
    this.selectedBall = null;
    this.drag = null;
    this.levelSynced = false;
    this.clock = createClock();
    this.ended = false;
    this.hoverTile = null;
  }

  private loadFailed = false;
  private failedFiles: string[] = [];
  private retry = 0;
  private loadedFolders: string[] = [];

  preload(): void {
    loadDebugPartyIfRequested();
    const game = getGame();
    if (game.party.length === 0) return;
    const def = getLevel(this.levelId);
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2 - 20, `Loading ${def.name}…`, TEXT_BIG).setOrigin(0.5);
    const bar = this.add.graphics();
    this.load.on('progress', (value: number) => {
      bar.clear();
      bar.fillStyle(COLORS.borderOuter, 1).fillRoundedRect(width / 2 - 150, height / 2, 300, 12, 6);
      bar.fillStyle(COLORS.exp, 1).fillRoundedRect(width / 2 - 150, height / 2, Math.max(12, 300 * value), 12, 6);
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.loadFailed = true;
      this.failedFiles.push(file.src);
      label.setText(`Could not load ${file.src}`).setColor('#ff7b7b');
    });
    MapRenderer.queueAssets(this);
    this.loadedFolders = levelSpriteFolders(def, game);
    for (const dex of this.loadedFolders) queuePokemon(this, dex, ALL_ACTIONS, { optional: OPTIONAL_ACTIONS });
    // Debug hook for the automated load checks.
    (window as unknown as { __ptdLoad?: unknown }).__ptdLoad = { retry: this.retry, failed: () => this.failedFiles, phase: () => this.loadPhase };
    this.loadPhase = 'preload';
  }

  private loadPhase = 'init';

  create(): void {
    const def = getLevel(this.levelId);
    const game = getGame();
    if (game.party.length === 0) {
      this.scene.start('LevelSelect');
      return;
    }
    this.loadPhase = this.loadFailed ? 'failed' : 'create';
    if (this.loadFailed) {
      const { width, height } = this.scale;
      const delay = RELOAD_DELAYS_MS[this.retry];
      if (delay !== undefined) {
        // A download failed (often a redeploy in progress or a dropped connection): reload on our own first.
        const note = this.add.text(width / 2, height / 2 + 40, `${this.failedFiles.length} file(s) did not download. Retrying in ${Math.round(delay / 1000)} s…`, TEXT_DIM).setOrigin(0.5);
        this.time.delayedCall(delay, () => {
          note.destroy();
          this.scene.restart({ levelId: this.levelId, seed: this.seed, retry: this.retry + 1 });
        });
        return;
      }
      this.add.text(width / 2, height / 2 + 40, 'Some sprites did not download. Check your connection and retry.', TEXT_DIM).setOrigin(0.5);
      new Button(this, width / 2 - 80, height / 2 + 84, 'Retry', () => this.scene.restart({ levelId: this.levelId, seed: this.seed, retry: 0 }), 140, 32);
      new Button(this, width / 2 + 80, height / 2 + 84, 'Level select', () => this.scene.start('LevelSelect'), 140, 32);
      return;
    }
    for (const dex of this.loadedFolders) registerAnims(this, dex);
    this.children.removeAll(true);
    const { model, map, error } = this.resolveMap(def.map);
    this.mapModel = model;
    this.state = createLevel(def, map, {
      seed: this.seed,
      party: game.party,
      config: runtimeConfig,
      items: game.items,
      placements: placementLimit(game, def),
      flags: game.flags,
      ...(game.starter !== undefined ? { starter: game.starter } : {}),
    });
    // The renderer gets its own copy: the editor paints into it, and Discard restores from this.mapModel.
    this.mapRenderer = new MapRenderer(this, cloneModel(model), Hud.HEIGHT);
    this.drawMap();
    if (error) this.showToast(`Edited map rejected (${error}); using the shipped map`);
    this.overlay = this.add.graphics().setDepth(900);
    this.dragGfx = this.add.graphics().setDepth(901);
    this.hud = new Hud(this, this.state, {
      onStartWave: () => this.tryStartWave(),
      onToggleSpeed: () => this.toggleSpeed(),
      onLeave: () => this.leave(),
      onMenu: () => this.openMenu(),
      onPartySlotDown: (i, pointer) => this.onPartySlotDown(i, pointer),
      onBall: (id) => this.selectBall(id),
      onRule: (id) => this.handleEvents(useRule(this.state, id)),
    });
    this.panel = new PokemonPanel({
      portraitUrl: (species, shiny) => portraitUrl(species, 'Normal', shiny),
      iconUrl: (species, shiny) => iconUrl(species, true, shiny),
      setActiveMove: (mon, index) => {
        const tower = this.state.towers.find((t) => t.mon === mon);
        if (tower) setActiveMove(this.state, tower.id, index);
        else mon.activeMove = index;
      },
      returnToParty: (mon) => {
        const tower = this.state.towers.find((t) => t.mon === mon);
        if (!tower) return false;
        if (this.state.phase !== 'build') {
          this.showToast('Pokémon can only return to the party between waves');
          return false;
        }
        removeTower(this.state, tower.id);
        this.destroyTowerView(tower.id);
        if (this.selectedTowerId === tower.id) this.selectedTowerId = null;
        return true;
      },
      usePotion: (mon) => {
        const game = getGame();
        if (game.items.potions <= 0 || this.state.phase !== 'build' || mon.hp >= mon.stats.hp) {
          this.showToast(this.state.phase !== 'build' ? 'Potions work between waves' : 'No Potion to use');
          return null;
        }
        game.items.potions--;
        const healed = usePotion(mon);
        this.floatText(this.towerPixel(this.state.towers.find((t) => t.mon === mon)?.id ?? -1), `+${healed} HP`, '#9affc0');
        saveGame();
        return game.items.potions;
      },
      potionCount: () => getGame().items.potions,
      onClose: () => undefined,
    });
    this.learnDialog = new LearnDialog();
    this.evolutionDialog = new EvolutionDialog();
    this.dialogue = new DialogueBox(this, { bottom: this.scale.height - Hud.BOTTOM - 4 });
    this.vsIntro = new VsIntro(this);
    showLocationPopup(this, levelPopup(def), def.name, Hud.HEIGHT + 8);
    this.menuPages = new MenuPages({
      game: getGame(),
      party: () => this.state.party.map((p) => p.mon),
      isPlaced: (mon) => this.state.towers.some((t) => t.mon === mon),
      openPokemon: (mon) => {
        this.closeMenu();
        this.openPanelFor(mon);
      },
      getSpeed: () => runtime.gameSpeed,
      setSpeed: (speed) => {
        runtime.gameSpeed = speed;
        saveGame();
      },
      onClose: () => this.startMenu?.setLocked(false),
    });
    this.savePanel = new SavePanel({
      getCode: () => currentSaveCode(),
      importCode: (code) => importSaveCode(code),
      newGame: () => {
        resetGame();
        this.scene.start('Title');
      },
      onClose: () => this.startMenu?.setLocked(false),
    });
    this.startMenu = new StartMenu(this, startMenuEntries(PLAYER_NAME), {
      onSelect: (id) => this.onMenuSelect(id),
      onClose: () => {
        if (!this.learnDialog?.isOpen && !this.evolutionDialog?.isOpen && !this.dialogue?.isOpen) this.paused = false;
      },
    });
    this.add.text(this.scale.width / 2, Hud.HEIGHT - 86, `seed ${this.seed}`, TEXT_DIM).setOrigin(0.5, 0).setDepth(1001);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.menuPages?.isOpen || this.savePanel?.isOpen) return; // the page handles Esc itself
      if (this.startMenu?.isOpen) return; // the menu handles Esc itself
      if (this.dialogue?.isOpen) return;
      if (this.panel?.isOpen) this.panel.hide();
      else if (this.selectedBall !== null || this.selectedTowerId !== null || this.selectedPartyIndex !== null) {
        this.selectedBall = null;
        this.selectedTowerId = null;
        this.selectedPartyIndex = null;
      } else this.openMenu();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.tryStartWave());

    this.debugPanel = new DebugPanel({
      getState: () => this.state,
      setPartyLevel: (level) => {
        setPartyLevel(this.state, 0, level);
        runtime.partyLevelOverride = level;
      },
      setTimeOfDay: (time) => setTimeOfDay(this.state, time),
      reroll: () => this.scene.restart({ levelId: this.levelId, seed: (Date.now() % 1_000_000) + 1 }),
      openMapEditor: () => this.openMapEditor(),
    });

    // Debug hook for automated checks.
    (window as unknown as { __ptd?: unknown }).__ptd = {
      scene: this,
      state: this.state,
      runtime,
      runtimeConfig,
      debugPanel: this.debugPanel,
      mapEditor: () => this.mapEditor,
      mapRenderer: () => this.mapRenderer,
      sim: { setPartyLevel, setTimeOfDay, resolveLearn, resolveEvolution, setActiveMove, moveTower, placeTower, throwBall, startWave, activeBoss },
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.debugPanel?.destroy();
      this.debugPanel = undefined;
      this.mapEditor?.destroy();
      this.mapEditor = undefined;
      this.mapRenderer?.destroy();
      this.mapRenderer = undefined;
      this.panel?.destroy();
      this.panel = undefined;
      this.learnDialog?.close();
      this.learnDialog = undefined;
      this.evolutionDialog?.close();
      this.evolutionDialog = undefined;
      this.startMenu?.destroy();
      this.startMenu = undefined;
      this.menuPages?.close(false);
      this.menuPages = undefined;
      this.savePanel?.close();
      this.savePanel = undefined;
      this.dialogue?.destroy();
      this.dialogue = undefined;
      this.stripDrag?.sprite?.destroy();
      this.stripDrag = null;
      this.syncGame();
      (window as unknown as { __ptd?: unknown }).__ptd = undefined;
    });
  }

  get levelState(): LevelState {
    return this.state;
  }

  // ------------------------------------------------------------------ map

  private tilePixel(x: number, y: number): { px: number; py: number } {
    const size = this.state.map.tileSize;
    return { px: x * size + size / 2, py: Hud.HEIGHT + y * size + size / 2 };
  }

  private tileAt(px: number, py: number): [number, number] | null {
    const size = this.state.map.tileSize;
    const x = Math.floor(px / size);
    const y = Math.floor((py - Hud.HEIGHT) / size);
    if (py < Hud.HEIGHT || x < 0 || y < 0 || x >= this.state.map.width || y >= this.state.map.height) return null;
    return [x, y];
  }

  /**
   * The map to play: the editor's draft for this level when there is one and
   * it is valid, else the shipped map.
   */
  private resolveMap(mapName: string): { model: MapModel; map: MapDef; error?: string } {
    const draft = editorStore.get(this.levelId);
    if (draft) {
      try {
        const map = toMapDef(draft);
        validateMap(map);
        return { model: draft, map };
      } catch (err) {
        editorStore.clear(this.levelId);
        const model = getMapModel(mapName);
        return { model, map: toMapDef(model), error: err instanceof Error ? err.message : String(err) };
      }
    }
    const model = getMapModel(mapName);
    return { model, map: toMapDef(model) };
  }

  /** Placeable outlines and the path entrance and exit markers; the tiles themselves come from MapRenderer. */
  private drawMap(): void {
    const { map } = this.state;
    const size = map.tileSize;
    const spots = this.add.container(0, 0).setDepth(1);
    const key = spotTexture(this, map.theme);
    for (const [x, y] of map.placeable) {
      spots.add(this.add.image(x * size + size / 2, Hud.HEIGHT + y * size + size / 2, key));
    }
    this.placeableGfx = spots;
    const first = map.path[0]!;
    const last = map.path[map.path.length - 1]!;
    const a = this.tilePixel(first[0], first[1]);
    const b = this.tilePixel(last[0], last[1]);
    this.add.text(a.px, a.py - 22, 'IN', TEXT_DIM).setOrigin(0.5).setDepth(1);
    this.add.text(b.px, b.py - 22, 'OUT', TEXT_DIM).setOrigin(0.5).setDepth(1);
  }

  // ------------------------------------------------------------- map editor

  private openMapEditor(): void {
    if (this.mapEditor || !this.mapRenderer || this.ended) return;
    const wasPaused = this.paused;
    this.paused = true;
    this.selectedBall = null;
    this.selectedTowerId = null;
    this.selectedPartyIndex = null;
    this.drag = null;
    this.placeableGfx?.setVisible(false);
    const close = () => {
      this.mapEditor?.destroy();
      this.mapEditor = undefined;
      this.paused = wasPaused;
      this.placeableGfx?.setVisible(true);
    };
    this.mapEditor = new MapEditor({
      scene: this,
      renderer: this.mapRenderer,
      offsetY: Hud.HEIGHT,
      tileAt: (px, py) => this.tileAt(px, py),
      onPlay: (model) => {
        editorStore.set(this.levelId, model);
        close();
        this.scene.restart({ levelId: this.levelId, seed: this.seed });
      },
      onDiscard: () => {
        // Put the tiles back the way the running level has them.
        this.mapRenderer?.setModel(this.mapModel);
        close();
      },
      onReset: () => {
        editorStore.clear(this.levelId);
        close();
        this.scene.restart({ levelId: this.levelId, seed: this.seed });
      },
    });
  }

  private drawOverlay(): void {
    const gfx = this.overlay;
    gfx.clear();
    const size = this.state.map.tileSize;
    if (this.state.phase === 'build' && this.hoverTile) {
      const [x, y] = this.hoverTile;
      if (isPlaceable(this.state.map, x, y) && !towerAt(this.state, x, y)) {
        const c = this.tilePixel(x, y);
        gfx.lineStyle(2, COLORS.placeableHover, 1).strokeEllipse(c.px + SPOT_ELLIPSE.dx, c.py + SPOT_ELLIPSE.dy, SPOT_ELLIPSE.w + 4, SPOT_ELLIPSE.h + 4);
      }
    }
    if (this.drag?.moved || this.stripDrag?.moved) {
      for (const [tx, ty] of this.state.map.placeable) {
        if (towerAt(this.state, tx, ty)) continue;
        const c = this.tilePixel(tx, ty);
        gfx.fillStyle(COLORS.placeableHover, 0.35).fillEllipse(c.px + SPOT_ELLIPSE.dx, c.py + SPOT_ELLIPSE.dy, SPOT_ELLIPSE.w + 2, SPOT_ELLIPSE.h + 2);
      }
    }
    const selected = this.selectedTowerId !== null ? this.state.towers.find((t) => t.id === this.selectedTowerId) : undefined;
    for (const tower of this.state.towers) {
      const { px, py } = this.tilePixel(tower.tile[0], tower.tile[1]);
      if (tower === selected) {
        gfx.lineStyle(2, COLORS.selected, 1).strokeRect(tower.tile[0] * size + 2, Hud.HEIGHT + tower.tile[1] * size + 2, size - 4, size - 4);
      }
      if (tower === selected || this.state.phase === 'build') {
        gfx.lineStyle(1, COLORS.range, 0.35).strokeCircle(px, py, (towerMove(tower)?.range ?? 0) * size);
      }
    }
  }

  // ---------------------------------------------------------------- input

  private selectBall(id: string): void {
    if (this.ended) return;
    this.selectedBall = this.selectedBall === id ? null : id;
    if (this.selectedBall && (this.state.items.balls[id] ?? 0) <= 0) {
      this.showToast(`No ${BALLS[id]?.name ?? id} left`);
      this.selectedBall = null;
    }
    this.selectedPartyIndex = null;
    this.selectedTowerId = null;
  }

  /** Nearest enemy sprite within reach of a pointer, if any. */
  private enemyNear(px: number, py: number, radius = 26): number | null {
    let best: number | null = null;
    let bestD = radius;
    for (const [id, view] of this.enemyViews) {
      if (view.dying || view.captured || view.inBall) continue;
      const d = Math.hypot(view.sprite.x - px, view.sprite.y - py);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.mapEditor?.active) {
      this.mapEditor.onPointerDown(pointer);
      return;
    }
    if (this.ended || this.paused) return;
    const tile = this.tileAt(pointer.x, pointer.y);
    if (!tile) return;
    if (this.selectedBall) {
      // One throw per selection; any other click drops the ball and acts normally.
      const ballId = this.selectedBall;
      this.selectedBall = null;
      const enemyId = this.enemyNear(pointer.x, pointer.y);
      if (enemyId !== null) {
        const reason = canThrow(this.state, ballId, enemyId);
        if (reason) this.showToast(reason);
        else this.handleEvents(throwBall(this.state, ballId, enemyId));
        return;
      }
    }
    const tower = towerAt(this.state, tile[0], tile[1]);
    if (tower) {
      this.drag = { towerId: tower.id, startX: pointer.x, startY: pointer.y, moved: false };
      return;
    }
    this.handleTileClick(tile[0], tile[1]);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.mapEditor?.active) {
      this.mapEditor.onPointerMove(pointer);
      return;
    }
    this.hoverTile = this.tileAt(pointer.x, pointer.y);
    const strip = this.stripDrag;
    if (strip && pointer.isDown) {
      if (!strip.moved && Math.hypot(pointer.x - strip.startX, pointer.y - strip.startY) > 6) {
        strip.moved = true;
        const placed = this.state.towers.some((t) => t.mon === this.state.party[strip.partyIndex]?.mon);
        strip.sprite = placed ? null : this.stripDragSprite(strip.partyIndex, pointer.x, pointer.y - 8);
      }
      if (strip.sprite) {
        strip.sprite.setPosition(pointer.x, pointer.y - 8);
        if (strip.sprite instanceof Phaser.GameObjects.Sprite) syncShadow(strip.sprite);
      }
      return;
    }
    const drag = this.drag;
    if (!drag || !pointer.isDown) return;
    if (!drag.moved && Math.hypot(pointer.x - drag.startX, pointer.y - drag.startY) > 6) drag.moved = true;
    if (drag.moved) {
      const view = this.towerViews.get(drag.towerId);
      if (view) {
        view.sprite.setPosition(pointer.x, pointer.y - 8).setDepth(5000);
        syncShadow(view.sprite);
      }
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.mapEditor?.active) {
      this.mapEditor.onPointerUp();
      return;
    }
    const strip = this.stripDrag;
    if (strip) {
      this.stripDrag = null;
      strip.sprite?.destroy();
      if (!strip.moved) {
        this.handlePartySlot(strip.partyIndex);
        return;
      }
      const tile = this.tileAt(pointer.x, pointer.y);
      const entry = this.state.party[strip.partyIndex];
      if (!tile || !entry || this.ended) return;
      if (this.state.towers.some((t) => t.mon === entry.mon)) return;
      if (isPlaceable(this.state.map, tile[0], tile[1]) && !towerAt(this.state, tile[0], tile[1])) {
        const reason = placementBlock(this.state, entry.mon, tile[0], tile[1]);
        if (reason) {
          this.showToast(reason);
          return;
        }
        try {
          const tower = placeTower(this.state, strip.partyIndex, tile[0], tile[1]);
          this.selectedPartyIndex = null;
          this.createTowerView(tower);
        } catch (err) {
          this.showToast(err instanceof Error ? err.message : String(err));
        }
      }
      return;
    }
    const drag = this.drag;
    this.drag = null;
    this.dragGfx.clear();
    if (!drag) return;
    const tower = this.state.towers.find((t) => t.id === drag.towerId);
    if (!tower) return;
    if (!drag.moved) {
      this.selectedTowerId = null;
      this.openPanelFor(tower.mon);
      return;
    }
    const tile = this.tileAt(pointer.x, pointer.y);
    if (tile && isPlaceable(this.state.map, tile[0], tile[1]) && !towerAt(this.state, tile[0], tile[1]) && !isOver(this.state)) {
      try {
        moveTower(this.state, tower.id, tile[0], tile[1]);
      } catch (err) {
        this.showToast(err instanceof Error ? err.message : String(err));
      }
    }
    // syncViews snaps the sprite to its tile either way.
    const view = this.towerViews.get(tower.id);
    if (view) view.sprite.setDepth(0);
  }

  private handleTileClick(x: number, y: number): void {
    if (this.ended) return;
    const state = this.state;
    const clicked = towerAt(state, x, y);
    if (clicked) {
      if (this.selectedTowerId === clicked.id) {
        this.selectedTowerId = null;
      } else {
        this.selectedTowerId = null;
        this.openPanelFor(clicked.mon);
      }
      return;
    }
    if (!isPlaceable(state.map, x, y)) {
      this.selectedTowerId = null;
      return;
    }
    try {
      if (this.selectedTowerId !== null) {
        moveTower(state, this.selectedTowerId, x, y);
        this.selectedTowerId = null;
      } else {
        const placed = new Set(state.towers.map((t) => t.mon));
        const partyIndex = this.selectedPartyIndex ?? state.party.findIndex((p) => !placed.has(p.mon));
        if (partyIndex < 0 || playerTowers(state).length >= state.placements) {
          this.showToast(
            state.placements === 1
              ? 'Only one Pokémon can be placed here; open the placed one and press Return to party'
              : playerTowers(state).length >= state.placements
                ? `Only ${state.placements} Pokémon can be placed here`
                : 'No more Pokémon to place; open one and press Move',
          );
          this.selectedPartyIndex = null;
          return;
        }
        const tower = placeTower(state, partyIndex, x, y);
        this.selectedPartyIndex = null;
        this.createTowerView(tower);
      }
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Press on a party slot: an unplaced Pokémon can be dragged straight onto a
   * free spot (its sprite follows the pointer and the spots light up); a
   * release without movement is the old tap (select, then tap a spot).
   */
  private onPartySlotDown(index: number, pointer: Phaser.Input.Pointer): void {
    if (this.ended || this.paused) return;
    const entry = this.state.party[index];
    if (!entry) return;
    this.stripDrag?.sprite?.destroy();
    this.stripDrag = { partyIndex: index, startX: pointer.x, startY: pointer.y, moved: false, sprite: null };
  }

  private stripDragSprite(partyIndex: number, x: number, y: number): Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null {
    const entry = this.state.party[partyIndex];
    if (!entry) return null;
    const dex = spriteFolder(entry.mon.species, entry.mon.shiny);
    if (isLoaded(dex)) return createPmdSprite(this, dex, x, y, 'Idle', Direction.Down).setDepth(5000).setAlpha(0.9);
    const icon = iconTextureKey(entry.mon.species, 0, entry.mon.shiny);
    return this.textures.exists(icon) ? this.add.image(x, y, icon).setDepth(5000) : null;
  }

  /** Party strip tap: open the panel for a placed member, or pick an unplaced one to place next. */
  private handlePartySlot(index: number): void {
    const entry = this.state.party[index];
    if (!entry || this.ended) return;
    this.selectedBall = null;
    const placed = this.state.towers.some((t) => t.mon === entry.mon);
    if (placed) {
      this.selectedPartyIndex = null;
      this.openPanelFor(entry.mon);
      return;
    }
    if (this.selectedPartyIndex === index) {
      this.selectedPartyIndex = null;
      this.openPanelFor(entry.mon);
      return;
    }
    this.selectedPartyIndex = index;
    this.selectedTowerId = null;
    this.panel?.hide();
    this.showToast(`Click a worn patch beside the path to place ${capitalize(entry.mon.name)} (click the slot again for its panel)`);
  }

  private openPanelFor(mon: Monster | undefined): void {
    if (!mon || !this.panel) return;
    const placed = this.state.towers.some((t) => t.mon === mon);
    this.panel.show(mon, placed);
  }

  private openMenu(): void {
    if (this.ended || !this.startMenu || this.mapEditor?.active || this.dialogue?.isOpen) return;
    this.selectedBall = null;
    this.selectedTowerId = null;
    this.selectedPartyIndex = null;
    this.panel?.hide();
    this.paused = true;
    this.startMenu.show();
  }

  private closeMenu(): void {
    this.menuPages?.close(false);
    this.savePanel?.close();
    this.startMenu?.close();
  }

  /** A start-menu entry was chosen: open its page (the menu stays behind it, locked). */
  private onMenuSelect(id: StartMenuId): void {
    if (!this.menuPages || !this.startMenu) return;
    this.startMenu.setLocked(true);
    switch (id) {
      case 'pokedex':
        this.menuPages.pokedex();
        break;
      case 'party':
        this.menuPages.party();
        break;
      case 'bag':
        this.menuPages.bag();
        break;
      case 'card':
        this.menuPages.trainerCard(PLAYER_NAME);
        break;
      case 'save':
        this.savePanel?.show();
        break;
      case 'options':
        this.menuPages.options();
        break;
      case 'leave': {
        this.startMenu.setLocked(false);
        const free = this.state.def.objective === 'free';
        const message = free ? 'Leave the route now? EXP and caught Pokémon are kept.' : 'Exit this level? Progress on it is lost; caught Pokémon are kept.';
        if (window.confirm(message)) {
          this.startMenu.close();
          this.exitLevel();
        }
        break;
      }
      default:
        this.startMenu.setLocked(false);
    }
  }

  /** Exit from the pause menu: free levels leave with the summary, defend levels abandon the run. */
  private exitLevel(): void {
    if (this.ended) return;
    if (this.state.def.objective === 'free') {
      this.paused = false;
      this.handleEvents(leaveLevel(this.state));
      return;
    }
    this.scene.start('LevelSelect');
  }

  private tryStartWave(): void {
    if (this.ended || this.state.phase !== 'build' || this.mapEditor?.active) return;
    this.selectedBall = null;
    if (this.state.towers.length === 0) {
      this.showToast('Place your Pokémon first');
      return;
    }
    this.selectedTowerId = null;
    this.handleEvents(startWave(this.state));
  }

  /** Cycles 1x, 2x, 4x (config.gameSpeeds): more fixed steps per frame, never a bigger step. */
  private toggleSpeed(): void {
    const speeds: number[] = config.gameSpeeds;
    const i = speeds.indexOf(runtime.gameSpeed);
    runtime.gameSpeed = speeds[(i + 1) % speeds.length] ?? 1;
    saveGame();
  }

  private leave(): void {
    if (this.ended || this.state.def.objective !== 'free') return;
    this.handleEvents(leaveLevel(this.state));
  }

  private showToast(text: string): void {
    this.toast?.destroy();
    this.toast = this.add
      .text(this.scale.width / 2, Hud.HEIGHT + 12, text, { ...TEXT, backgroundColor: '#f8f8f8ee', padding: { x: 10, y: 5 } })
      .setOrigin(0.5, 0)
      .setDepth(1500);
    this.time.delayedCall(1800, () => this.toast?.destroy());
  }

  // ----------------------------------------------------------------- loop

  override update(_time: number, delta: number): void {
    // No state yet: the loader failed and the retry screen (or the automatic reload timer) is showing.
    if (this.ended || !this.state) return;
    this.mapRenderer?.update(delta);
    if (!this.paused) {
      // Events are handled per step so a dialog opened mid-frame stops the rest of the frame.
      advance(this.clock, this.state, delta / 1000, runtime.gameSpeed, (events) => {
        this.handleEvents(events);
        return this.ended || this.paused;
      });
    }
    this.syncViews();
    this.drawOverlay();
    const boss = activeBoss(this.state);
    this.hud.setBoss(boss ? { name: capitalize(boss.mon.name), hp: boss.mon.hp, maxHp: boss.mon.stats.hp, level: boss.mon.level, catchable: isCatchable(boss), phases: boss.boss?.phases.map((p) => p.at) ?? [] } : null);
    this.hud.setRules(ruleStatus(this.state));
    this.dialogue?.update(delta);
    this.hud.setPaused(this.paused);
    this.hud.tick(delta);
    this.hud.update(this.state, runtime.gameSpeed, this.selectedPartyIndex, this.selectedBall);
    this.panel?.refresh();
  }

  private promptLearn(towerId: number, moveId: number): void {
    const tower = this.state.towers.find((t) => t.id === towerId);
    if (!tower || !this.learnDialog) return;
    this.paused = true;
    this.learnDialog.show(tower.mon, moveId, (replaceIndex) => {
      this.handleEvents(resolveLearn(this.state, towerId, moveId, replaceIndex));
      if (replaceIndex === null) this.showToast(`${capitalize(tower.mon.name)} did not learn ${capitalize(getMove(moveId).name)}`);
      const next = this.state.pendingLearns[0];
      if (next) this.promptLearn(next.towerId, next.moveId);
      else this.paused = false;
    }, (s) => portraitUrl(s));
  }

  private handleEvents(events: LevelEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'spawn': {
          this.createEnemyView(e.enemyId as number, e.shiny ?? false);
          const enemy = this.state.enemies.find((en) => en.id === e.enemyId);
          if (enemy) markSeen(getGame(), enemy.mon.species);
          break;
        }
        case 'status':
          if (e.enemyId !== undefined) this.floatText(this.enemyPixel(e.enemyId), e.block === 'flinch' ? 'Flinch!' : `${capitalize(e.ailment ?? '')}!`, '#e0a0ff');
          if (e.towerId !== undefined) this.floatText(this.towerPixel(e.towerId), `${capitalize(e.ailment ?? '')}!`, '#e0a0ff');
          break;
        case 'statusDamage':
          if (e.enemyId !== undefined) this.floatText(this.enemyPixel(e.enemyId), `${e.amount}`, '#c080ff');
          if (e.towerId !== undefined) this.floatText(this.towerPixel(e.towerId), `${e.amount}`, '#c080ff');
          break;
        case 'statusEnd':
          break;
        case 'stages': {
          const text = (e.changes ?? []).map((c) => `${c.change > 0 ? '+' : ''}${c.change} ${c.stat.toUpperCase()}`).join(' ');
          if (e.enemyId !== undefined) this.floatText(this.enemyPixel(e.enemyId), text, '#ffb3b3');
          if (e.towerId !== undefined) this.floatText(this.towerPixel(e.towerId), text, '#b3ffb3');
          break;
        }
        case 'heal':
          if (e.towerId !== undefined) this.floatText(this.towerPixel(e.towerId), `${(e.amount ?? 0) >= 0 ? '+' : ''}${e.amount} HP`, '#9affc0');
          break;
        case 'blocked':
          if (e.towerId !== undefined && e.block !== 'flinch') this.floatText(this.towerPixel(e.towerId), `${capitalize(e.block ?? '')}...`, '#cccccc');
          break;
        case 'moveLearned':
          if (e.towerId !== undefined) this.showToast(`${capitalize(this.state.towers.find((t) => t.id === e.towerId)?.mon.name ?? '')} learned ${capitalize(getMove(e.moveId ?? 0).name)}!`);
          break;
        case 'moveLearnPrompt':
          if (e.towerId !== undefined && e.moveId !== undefined && !this.paused) this.promptLearn(e.towerId, e.moveId);
          break;
        case 'ballThrow':
          this.animateBall(e.enemyId as number, e.ball ?? 'poke', e.shakes ?? 0, e.caught ?? false, false);
          break;
        case 'ballBlocked':
          this.animateBall(e.enemyId as number, e.ball ?? 'poke', 0, false, true);
          break;
        case 'caught':
          break;
        case 'trainerStart':
          if (e.trainer) this.showTrainer(e.trainer, e.boss ?? false);
          break;
        case 'bossMove':
          this.animateBossMove(e.enemyId as number);
          break;
        case 'towerHit':
          if (e.towerId !== undefined) {
            this.floatText(this.towerPixel(e.towerId), `-${e.damage?.damage ?? 0}`, '#ff7b7b');
            const view = this.towerViews.get(e.towerId);
            if (view) this.tweens.add({ targets: view.sprite, x: view.sprite.x + 4, duration: 40, yoyo: true, repeat: 3 });
          }
          break;
        case 'bossRetry':
          this.showToast(`Out of lives! The boss wave restarts once. Get ready for wave ${e.wave}.`);
          for (const id of [...this.enemyViews.keys()]) this.removeEnemyView(id);
          break;
        case 'evolutionPrompt':
          if (e.towerId !== undefined && e.species !== undefined) this.promptEvolution(e.towerId, e.species);
          break;
        case 'evolved': {
          const tower = this.state.towers.find((t) => t.id === e.towerId);
          if (tower) {
            this.destroyTowerView(tower.id);
            this.createTowerView(tower);
            this.floatText(this.towerPixel(tower.id), `Evolved into ${capitalize(tower.mon.name)}!`, '#ffe066');
          }
          break;
        }
        case 'attack':
          this.animateAttack(e.towerId as number, e.enemyId);
          break;
        case 'hit':
          this.animateHit(e.enemyId as number, e.damage?.damage ?? 0, e.damage?.crit ?? false, e.damage?.effectiveness ?? 1);
          break;
        case 'miss':
          this.floatText(this.enemyPixel(e.enemyId as number), 'Miss', '#cccccc');
          break;
        case 'ko':
          this.animateKo(e.enemyId as number);
          if (e.towerId !== undefined && e.exp) this.floatText(this.towerPixel(e.towerId), `+${e.exp} EXP`, '#9ad0ff');
          if (e.boss) this.showToast('The boss went down!');
          break;
        case 'leak':
          this.removeEnemyView(e.enemyId as number);
          break;
        case 'levelUp':
          if (e.towerId !== undefined) this.floatText(this.towerPixel(e.towerId), `Lv ${e.level}!`, '#ffe066');
          break;
        case 'waveStart':
          this.showToast(e.trainer ? `Wave ${e.wave}: ${e.trainer.name}` : `Wave ${e.wave}`);
          if (e.trainer) this.showTrainerOnField(e.trainer.id);
          break;
        case 'waveEnd':
          this.trainerSprite?.destroy();
          this.trainerSprite = undefined;
          break;
        case 'cutscene':
          if (e.lines?.length) this.showLines(e.lines);
          break;
        case 'rule':
        case 'lanesReversed':
        case 'drop':
        case 'flee':
        case 'bossPhase':
          if (e.text) this.showToast(e.text);
          if (e.type === 'flee' && e.enemyId !== undefined) this.removeEnemyView(e.enemyId);
          break;
        case 'banner':
          if (e.text) this.showToast(e.text);
          break;
        case 'allyPlaced':
          if (e.text) this.showToast(`${e.text} joins the fight!`);
          break;
        case 'allyLeft':
          if (e.towerId !== undefined) this.destroyTowerView(e.towerId);
          if (e.text) this.showToast(`${e.text} leaves.`);
          break;
        case 'phase':
          if (e.phase === 'won' || e.phase === 'lost' || e.phase === 'left') this.endLevel();
          break;
      }
    }
  }

  private promptEvolution(towerId: number, to: number): void {
    const tower = this.state.towers.find((t) => t.id === towerId);
    if (!tower || !this.evolutionDialog) return;
    const open = () => {
      this.paused = true;
      this.evolutionDialog?.show(tower.mon, to, (s) => portraitUrl(s), (accept) => {
        this.handleEvents(resolveEvolution(this.state, towerId, accept));
        const next = this.state.pendingEvolutions[0];
        if (next) this.promptEvolution(next.towerId, next.to);
        else if (this.state.pendingLearns.length === 0) this.paused = false;
        else {
          const learn = this.state.pendingLearns[0]!;
          this.promptLearn(learn.towerId, learn.moveId);
        }
      });
    };
    if (this.learnDialog?.isOpen) this.time.delayedCall(100, () => this.promptEvolution(towerId, to));
    else open();
  }

  /**
   * Pauses the sim, plays the VS intro for trainers with a mugshot (gym
   * leaders, the Elite Four, Cynthia) and runs the trainer intro in the
   * bottom text box with their standing pose; play resumes after the last page.
   */
  private showTrainer(trainer: NonNullable<LevelEvent['trainer']>, boss: boolean): void {
    if (!this.dialogue) return;
    if (this.introduced.has(trainer.id) && !trainer.intro) return; // the same trainer's next wave: no new speech
    this.introduced.add(trainer.id);
    this.paused = true;
    this.selectedBall = null;
    const portrait = trainerTextureKey(trainer.id);
    const icons = trainer.party.map((p) => iconTextureKey(p.species === 'counter-starter' ? counterStarter(this.state.starter) : (findPokemonId(p.species) ?? 0), 0));
    const pages = [
      { text: boss ? `${trainer.name} wants to battle! Beat the boss to earn the badge.` : `${trainer.name} wants to battle!`, portrait, icons },
      ...(trainer.intro ? [{ text: trainer.intro, portrait }] : []),
    ];
    const talk = () =>
      this.dialogue?.show(pages, () => {
        if (!this.learnDialog?.isOpen && !this.evolutionDialog?.isOpen && !this.startMenu?.isOpen) this.paused = false;
      });
    if (this.vsIntro?.canPlay(trainer.id)) this.vsIntro.play(trainer.id, trainer.name, talk);
    else talk();
  }

  /** Shows scripted dialogue lines in the bottom box; the sim pauses until the last one is dismissed. */
  private showLines(lines: DialogueLine[]): void {
    if (!this.dialogue) return;
    this.paused = true;
    this.selectedBall = null;
    const pages = lines.map((line) => ({
      text: line.text,
      ...(line.speaker ? { portrait: trainerTextureKey(line.speaker) } : {}),
      ...(line.options
        ? {
            choices: line.options,
            onChoice: (i: number) => {
              if (line.answer !== undefined && i === line.answer && line.onCorrect) this.handleEvents(useRule(this.state, line.onCorrect.rule, line.onCorrect.action));
              else if (line.answer !== undefined) this.showToast('Not quite.');
            },
          }
        : {}),
    }));
    this.dialogue.show(pages, () => {
      if (!this.learnDialog?.isOpen && !this.evolutionDialog?.isOpen && !this.startMenu?.isOpen && !this.vsIntro?.isOpen) this.paused = false;
    });
  }

  /** The escort (Cheryl's Chansey walks the path for her): one sprite following state.escort. */
  private syncEscort(): void {
    const escort = this.state.escort;
    if (!escort) return;
    const dex = spriteFolder(escort.species, false);
    if (!this.escortView) {
      if (!isLoaded(dex)) return;
      const p = pointAlongPath(this.state.path, escort.distance);
      const { px, py } = this.tilePixel(p.x, p.y);
      this.escortView = createPmdSprite(this, dex, px, py + SPRITE_Y_OFFSET, 'Walk', Direction.Right).setDepth(py);
    }
    const p = pointAlongPath(this.state.path, escort.distance);
    const { px, py } = this.tilePixel(p.x, p.y);
    this.escortView.setPosition(px, py + SPRITE_Y_OFFSET).setDepth(py);
    playAnim(this.escortView, this.state.phase === 'wave' && escort.hp > 0 ? 'Walk' : 'Idle', directionFromVector(p.dx, p.dy, Direction.Right));
    syncShadow(this.escortView);
  }

  /** The trainer's throwing pose beside the path entrance for the length of their wave. */
  private showTrainerOnField(trainerId: string): void {
    this.trainerSprite?.destroy();
    const key = this.textures.exists(trainerTextureKey(trainerId, true)) ? trainerTextureKey(trainerId, true) : trainerTextureKey(trainerId);
    if (!this.textures.exists(key)) return;
    const first = this.state.map.path[0]!;
    const { px, py } = this.tilePixel(first[0], first[1]);
    const size = this.state.map.tileSize;
    // Stand just off the entrance tile, on whichever side has room.
    const x = Phaser.Math.Clamp(px + (px < this.scale.width / 2 ? size * 1.5 : -size * 1.5), 40, this.scale.width - 40);
    const y = Phaser.Math.Clamp(py - size, Hud.HEIGHT + 40, this.scale.height - Hud.BOTTOM - 40);
    this.trainerSprite = this.add.image(x, y, key).setDepth(850).setAlpha(0);
    this.tweens.add({ targets: this.trainerSprite, alpha: 1, duration: 200 });
  }

  private animateBossMove(enemyId: number): void {
    const view = this.enemyViews.get(enemyId);
    if (!view || view.dying) return;
    const dex = spriteDex(view.sprite);
    const action = pickAction(dex, ['Attack']);
    const dir = spriteDirection(view.sprite) ?? Direction.Down;
    this.floatText(this.enemyPixel(enemyId), 'Boss attack!', '#ffb3b3');
    if (!action || view.busy) return;
    view.busy = true;
    playAnim(view.sprite, action, dir);
    view.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      view.busy = false;
    });
  }

  /** A short white sparkle (the "click" of a catch). */
  private clickFlash(x: number, y: number): void {
    if (!this.textures.exists('star')) return;
    const emitter = this.add.particles(x, y, 'star', {
      speed: { min: 40, max: 120 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 500,
      tint: [0xffffff, 0xfff5a0],
      emitting: false,
    }).setDepth(2650);
    emitter.explode(12, 0, 0);
    this.time.delayedCall(700, () => emitter.destroy());
  }

  /** The ball bursting open: a flash ring and a puff. */
  private burst(x: number, y: number): void {
    const ring = this.add.circle(x, y, 6, 0xffffff, 0.9).setDepth(2640);
    this.tweens.add({ targets: ring, radius: 26, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    if (!this.textures.exists('star')) return;
    const emitter = this.add.particles(x, y, 'star', {
      speed: { min: 60, max: 160 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 350,
      tint: [0xffffff],
      emitting: false,
    }).setDepth(2650);
    emitter.explode(8, 0, 0);
    this.time.delayedCall(500, () => emitter.destroy());
  }

  /**
   * The thrown ball: its item sprite arcs from the ball bar to the target.
   * A trainer's Pokémon bounces it off. Otherwise the Pokémon goes inside,
   * the ball wiggles (three times on a catch, else once per successful
   * shake) and then clicks with a sparkle or bursts open.
   */
  private animateBall(enemyId: number, ballId: string, shakes: number, caught: boolean, blocked: boolean): void {
    const view = this.enemyViews.get(enemyId);
    if (caught && view) {
      // The sim already removed the enemy: keep its view frozen in place until the ball lands.
      view.captured = true;
      view.busy = true;
      view.sprite.anims.stop();
      view.hpBar.clear();
    }
    const origin = this.hud.ballOrigin(ballId);
    const key = itemTextureKey(BALLS[ballId]?.sprite ?? 'poke-ball');
    const ball = this.textures.exists(key)
      ? this.add.image(origin.x, origin.y, key).setDepth(2600)
      : this.add.circle(origin.x, origin.y, 7, 0xe03030).setStrokeStyle(2, 0x202020).setDepth(2600);
    const target = () => {
      if (view && view.sprite.active) return { x: view.sprite.x, y: view.sprite.y };
      const p = this.enemyPixel(enemyId);
      return { x: p.px, y: p.py };
    };
    const start = { x: origin.x, y: origin.y };
    const flight = { t: 0 };
    this.tweens.add({
      targets: flight,
      t: 1,
      duration: 520,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const p = target();
        const t = flight.t;
        ball.x = start.x + (p.x - start.x) * t;
        ball.y = start.y + (p.y - 12 - start.y) * t - Math.sin(t * Math.PI) * 110;
        ball.angle = t * 540;
      },
      onComplete: () => {
        const p = target();
        if (blocked) {
          this.showToast(TRAINER_BLOCK_MESSAGE);
          this.floatText({ px: p.x, py: p.y }, 'Blocked!', '#ffb3b3');
          const back = start.x < p.x ? -70 : 70;
          this.tweens.add({
            targets: ball,
            x: p.x + back,
            y: p.y - 46,
            angle: ball.angle - 360,
            duration: 260,
            ease: 'Quad.easeOut',
            onComplete: () => this.tweens.add({ targets: ball, y: p.y + 12, alpha: 0, duration: 280, ease: 'Quad.easeIn', onComplete: () => ball.destroy() }),
          });
          return;
        }
        // The Pokémon goes into the ball.
        if (view && view.sprite.active) {
          view.inBall = true;
          view.sprite.setVisible(false);
          syncShadow(view.sprite);
          view.hpBar.clear();
        }
        ball.setAngle(0).setPosition(p.x, p.y - 6);
        const wiggles = caught ? 3 : shakes;
        let n = 0;
        const finish = () => {
          const at = { px: ball.x, py: ball.y };
          if (caught) {
            this.clickFlash(ball.x, ball.y);
            this.floatText(at, 'Gotcha!', '#fff5a0');
            this.tweens.add({
              targets: ball,
              alpha: 0,
              duration: 450,
              delay: 350,
              onComplete: () => {
                ball.destroy();
                this.removeEnemyView(enemyId);
              },
            });
          } else {
            this.burst(ball.x, ball.y);
            this.tweens.add({ targets: ball, scale: 1.8, alpha: 0, duration: 180, onComplete: () => ball.destroy() });
            if (view && view.sprite.active) {
              view.inBall = false;
              view.sprite.setVisible(true);
              syncShadow(view.sprite);
            }
            this.floatText(at, 'Broke free!', '#cccccc');
          }
        };
        const wiggle = () => {
          if (!ball.active) return;
          if (n >= wiggles) return finish();
          n++;
          this.tweens.add({ targets: ball, angle: { from: -24, to: 24 }, duration: 130, yoyo: true, repeat: 1, onComplete: () => this.time.delayedCall(280, wiggle) });
        };
        this.time.delayedCall(220, wiggle);
      },
    });
  }

  private syncGame(): void {
    if (this.levelSynced || !this.state) return;
    this.levelSynced = true;
    const game = getGame();
    for (const { mon } of this.state.caught) {
      if (!game.party.includes(mon) && !game.boxes.some((b) => b.slots.includes(mon))) {
        if (this.state.party.some((p) => p.mon === mon) && game.party.length < this.state.maxParty) game.party.push(mon);
        else addPokemon(game, mon);
      }
    }
    if (isOver(this.state)) {
      const before = game.money;
      recordLevelResult(game, this.levelId, this.state.phase as 'won' | 'lost' | 'left', this.state.wavesCleared, this.state.kos);
      this.moneyEarned = game.money - before;
    }
    saveGame();
  }

  private endLevel(): void {
    this.ended = true;
    const badge = this.state.def.badge;
    const hadBadge = badge ? getGame().badges.includes(badge.id) : false;
    this.syncGame();
    for (const id of [...this.enemyViews.keys()]) this.removeEnemyView(id);
    this.hud.setBoss(null);
    this.hud.update(this.state, runtime.gameSpeed);
    showSummary(this, { ...summarize(this.state), money: this.moneyEarned, newBadge: !hadBadge }, {
      onRetry: () => this.scene.restart({ levelId: this.levelId, seed: this.seed + 1 }),
      onLevelSelect: () => this.scene.start('LevelSelect'),
    });
  }

  // ---------------------------------------------------------------- views

  private createTowerView(tower: Tower): void {
    const dex = spriteFolder(tower.mon.species, tower.mon.shiny);
    if (!isLoaded(dex)) {
      // Not preloaded (a surprise evolution or debug change): fetch it now.
      ensureLoaded(this, dex, ALL_ACTIONS, { optional: OPTIONAL_ACTIONS })
        .then(() => {
          if (this.state.towers.includes(tower) && !this.towerViews.has(tower.id)) this.createTowerView(tower);
        })
        .catch((err: Error) => this.showToast(err.message));
      return;
    }
    const { px, py } = this.tilePixel(tower.tile[0], tower.tile[1]);
    const sprite = createPmdSprite(this, dex, px, py + SPRITE_Y_OFFSET, 'Idle', Direction.Down);
    const view: TowerView = { sprite, busy: false, hpBar: this.add.graphics().setDepth(800) };
    this.towerViews.set(tower.id, view);
  }

  private destroyTowerView(towerId: number): void {
    const view = this.towerViews.get(towerId);
    if (!view) return;
    view.sprite.destroy();
    view.hpBar.destroy();
    view.badge?.destroy();
    this.towerViews.delete(towerId);
  }

  /** Shows or hides the battle-GUI status badge beside a bar. */
  private syncBadge(owner: { badge?: Phaser.GameObjects.Image }, ailment: string, x: number, y: number): void {
    const name = STATUS_BADGE[ailment];
    const key = name ? `ui-status-${name}` : undefined;
    if (!key || !this.textures.exists(key)) {
      owner.badge?.destroy();
      delete owner.badge;
      return;
    }
    if (!owner.badge || owner.badge.texture.key !== key) {
      owner.badge?.destroy();
      owner.badge = this.add.image(x, y, key).setOrigin(0, 0.5).setDepth(802);
    }
    owner.badge.setPosition(x, y);
  }

  private createEnemyView(enemyId: number, shiny: boolean): void {
    const enemy = this.state.enemies.find((e) => e.id === enemyId);
    if (!enemy) return;
    const dex = spriteFolder(enemy.mon.species, shiny);
    if (!isLoaded(dex)) {
      ensureLoaded(this, dex, ALL_ACTIONS, { optional: OPTIONAL_ACTIONS })
        .then(() => {
          if (this.state.enemies.includes(enemy) && !this.enemyViews.has(enemyId)) this.createEnemyView(enemyId, shiny);
        })
        .catch((err: Error) => this.showToast(err.message));
      return;
    }
    const point = enemyPoint(this.state, enemy);
    const { px, py } = this.tilePixel(point.x, point.y);
    const dir = directionFromVector(point.dx, point.dy, Direction.Right);
    const sprite = createPmdSprite(this, dex, px, py + SPRITE_Y_OFFSET, 'Walk', dir);
    if (enemy.boss) {
      sprite.setScale(runtimeConfig.bosses.spriteScale);
      syncShadow(sprite);
    }
    if (enemy.alpha) {
      sprite.setScale(1.5).setTint(0xffb0a0);
      syncShadow(sprite);
    }
    if (enemy.dynamax) {
      sprite.setScale(2.5).setTint(0xff7070);
      syncShadow(sprite);
    }
    if (enemy.shadow) sprite.setTint(0xb080e0);
    const hpBar = this.add.graphics().setDepth(800);
    this.enemyViews.set(enemyId, { sprite, hpBar, busy: false, dying: false, shiny, captured: false, inBall: false });
    if (shiny) this.sparkle(px + 32, py + SPRITE_Y_OFFSET);
  }

  private sparkle(x: number, y: number): void {
    if (!this.textures.exists('star')) return;
    const emitter = this.add.particles(x, y, 'star', {
      speed: { min: 30, max: 90 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 700,
      quantity: 14,
      tint: [0xfff5a0, 0xffffff, 0x9ad0ff],
      emitting: false,
    }).setDepth(2500);
    emitter.explode(14, 0, 0);
    this.time.delayedCall(900, () => emitter.destroy());
    this.floatText({ px: x, py: y }, '★ Shiny!', '#fff5a0');
  }

  private removeEnemyView(enemyId: number): void {
    const view = this.enemyViews.get(enemyId);
    if (!view) return;
    view.sprite.destroy();
    view.hpBar.destroy();
    view.badge?.destroy();
    this.enemyViews.delete(enemyId);
  }

  private enemyPixel(enemyId: number): { px: number; py: number } {
    const view = this.enemyViews.get(enemyId);
    if (view) return { px: view.sprite.x, py: view.sprite.y };
    const enemy = this.state.enemies.find((e) => e.id === enemyId);
    if (!enemy) return { px: -100, py: -100 };
    const p = enemyPoint(this.state, enemy);
    return this.tilePixel(p.x, p.y);
  }

  private towerPixel(towerId: number): { px: number; py: number } {
    const tower = this.state.towers.find((t) => t.id === towerId);
    return tower ? this.tilePixel(tower.tile[0], tower.tile[1]) : { px: -100, py: -100 };
  }

  private animateAttack(towerId: number, enemyId: number | undefined): void {
    const view = this.towerViews.get(towerId);
    if (!view) return;
    const from = this.towerPixel(towerId);
    const to = enemyId === undefined ? from : this.enemyPixel(enemyId);
    const dir = directionFromVector(to.px - from.px, to.py - from.py, spriteDirection(view.sprite) ?? Direction.Down);
    const dex = spriteDex(view.sprite);
    const action = pickAction(dex, ['Attack']);
    if (!action || view.busy) {
      if (!view.busy) playAnim(view.sprite, 'Idle', dir);
      return;
    }
    view.busy = true;
    playAnim(view.sprite, action, dir);
    view.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      view.busy = false;
      if (view.sprite.active) playAnim(view.sprite, 'Idle', dir);
    });
  }

  private animateHit(enemyId: number, damage: number, crit: boolean, effectiveness: number): void {
    const view = this.enemyViews.get(enemyId);
    const pos = this.enemyPixel(enemyId);
    const color = crit ? '#ff6b6b' : effectiveness > 1 ? '#ffb347' : effectiveness < 1 ? '#a0a0c0' : '#ffffff';
    this.floatText(pos, crit ? `${damage}!` : `${damage}`, color);
    if (!view || view.dying || view.busy) return;
    const dex = spriteDex(view.sprite);
    const action = pickAction(dex, ['Hurt']);
    if (!action) return;
    view.busy = true;
    const dir = spriteDirection(view.sprite) ?? Direction.Down;
    playAnim(view.sprite, action, dir);
    view.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      view.busy = false;
    });
  }

  private animateKo(enemyId: number): void {
    const view = this.enemyViews.get(enemyId);
    if (!view) return;
    view.dying = true;
    view.busy = true;
    view.hpBar.clear();
    // The sim already removed the enemy; the sprite remembers its folder.
    const dex = spriteDex(view.sprite);
    const action = pickAction(dex, ['Faint', 'Hurt']);
    const dir = spriteDirection(view.sprite) ?? Direction.Down;
    if (!action) {
      this.removeEnemyView(enemyId);
      return;
    }
    view.sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    playAnim(view.sprite, action, dir);
    const finish = () => {
      this.tweens.add({ targets: view.sprite, alpha: 0, duration: 250, onComplete: () => this.removeEnemyView(enemyId) });
    };
    if (view.sprite.anims.isPlaying) view.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, finish);
    else finish();
  }

  private floatText(pos: { px: number; py: number }, text: string, color: string): void {
    const t = this.add.text(pos.px, pos.py - 20, text, { ...TEXT, color, stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(3000);
    this.tweens.add({ targets: t, y: pos.py - 48, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  private syncViews(): void {
    const state = this.state;
    const size = state.map.tileSize;
    for (const tower of state.towers) {
      let view = this.towerViews.get(tower.id);
      if (!view) {
        this.createTowerView(tower);
        view = this.towerViews.get(tower.id);
        if (!view) continue;
      }
      if (this.drag?.moved && this.drag.towerId === tower.id) {
        view.hpBar.clear();
        view.badge?.setVisible(false);
        continue;
      }
      const { px, py } = this.tilePixel(tower.tile[0], tower.tile[1]);
      view.sprite.setPosition(px, py + SPRITE_Y_OFFSET).setDepth(py);
      syncShadow(view.sprite);
      // Battle-GUI bar under the tile, Lv at the top right, status badge beside the bar.
      const w = size - 8;
      const bx = px - w / 2;
      const by = py + size / 2 - 5;
      const frac = Math.max(0, Math.min(1, tower.mon.hp / tower.mon.stats.hp));
      const colour = frac > 0.5 ? COLORS.hpFront : frac > 0.2 ? COLORS.hpLow : COLORS.hpCritical;
      view.hpBar.clear();
      view.hpBar.fillStyle(0xf8f8f8, 1).fillRect(bx - 1, by - 1, w + 2, 5);
      view.hpBar.fillStyle(0x000000, 1).fillRect(bx, by, w, 3);
      view.hpBar.fillStyle(colour, 1).fillRect(bx, by, Math.round(w * frac), 3);
      this.syncBadge(view, tower.mon.status.ailment, bx + w + 3, by + 1);
      view.badge?.setVisible(true);
    }
    for (const [id] of this.towerViews) {
      if (!state.towers.some((t) => t.id === id) && this.drag?.towerId !== id) this.destroyTowerView(id);
    }
    this.syncEscort();
    const alive = new Set<number>();
    for (const enemy of state.enemies) {
      alive.add(enemy.id);
      const view = this.enemyViews.get(enemy.id);
      if (!view) continue;
      view.sprite.setAlpha(enemy.vanish > 0 ? 0.15 : 1);
      const point = enemyPoint(state, enemy);
      const { px, py } = this.tilePixel(point.x, point.y);
      view.sprite.setPosition(px, py + SPRITE_Y_OFFSET).setDepth(py);
      if (!view.busy) playAnim(view.sprite, 'Walk', directionFromVector(point.dx, point.dy, Direction.Right));
      syncShadow(view.sprite);
      if (view.inBall) {
        view.badge?.setVisible(false);
        continue;
      }
      this.drawHpBar(view.hpBar, enemy, px, py, size, view.shiny);
      this.syncBadge(view, enemy.mon.status.ailment, px + (size - 8) / 2 + 3, py - size / 2 - 4);
    }
    for (const [id, view] of this.enemyViews) {
      if (!alive.has(id) && !view.dying && !view.captured) this.removeEnemyView(id);
    }
  }

  private drawHpBar(gfx: Phaser.GameObjects.Graphics, enemy: Enemy, px: number, py: number, size: number, shiny: boolean): void {
    const w = size - 8;
    const x = px - w / 2;
    const y = py - size / 2 - 6;
    const frac = Math.max(0, Math.min(1, enemy.mon.hp / enemy.mon.stats.hp));
    const color = frac > 0.5 ? COLORS.hpFront : frac > 0.2 ? COLORS.hpLow : COLORS.hpCritical;
    gfx.clear();
    // Battle-GUI bar: white outline, black body, coloured fill; trainer, boss and shiny rings outside it.
    if (enemy.boss) gfx.lineStyle(1, 0xff6b6b, 1).strokeRect(x - 2, y - 2, w + 4, 7);
    else if (enemy.trainer) gfx.lineStyle(1, 0x3878e0, 1).strokeRect(x - 2, y - 2, w + 4, 7);
    if (shiny) gfx.lineStyle(1, 0xffd700, 1).strokeRect(x - 2, y - 2, w + 4, 7);
    gfx.fillStyle(0xf8f8f8, 1).fillRect(x - 1, y - 1, w + 2, 5);
    gfx.fillStyle(0x000000, 1).fillRect(x, y, w, 3);
    gfx.fillStyle(color, 1).fillRect(x, y, Math.round(w * frac), 3);
    if (enemy.mon.status.ailment === 'none' && enemy.mon.status.flinchSeconds > 0) gfx.fillStyle(0xffffff, 1).fillCircle(x + w + 5, y + 1, 2);
  }
}
