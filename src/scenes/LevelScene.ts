import Phaser from 'phaser';
import { Direction, directionFromVector } from '../assets/direction';
import { createPmdSprite, pickAction, playAnim, spriteDex, spriteDirection, syncShadow } from '../assets/pmdLoader';
import { getLevel } from '../data/levels';
import { getMap } from '../data/maps';
import { portraitUrl, runtime, runtimeConfig, spriteFolder, urlParam } from '../game/runtime';
import { getGame, loadDebugPartyIfRequested } from '../game/session';
import { addPokemon, recordLevelResult } from '../sim/game';
import { BALLS } from '../sim/catch';
import { EvolutionDialog } from '../ui/evolutionDialog';
import {
  createLevel,
  isOver,
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
  step,
  summarize,
  towerAt,
  towerMove,
  type Enemy,
  type LevelEvent,
  type LevelState,
  type Tower,
} from '../sim/level';
import { isPlaceable, pointAlongPath, tileKey } from '../sim/map';
import { DebugPanel } from '../ui/debugPanel';
import { Hud } from '../ui/hud';
import { LearnDialog } from '../ui/learnDialog';
import { PokemonPanel } from '../ui/pokemonPanel';
import { capitalize } from '../ui/domOverlay';
import { getMove } from '../data/pokedata';
import type { Monster } from '../sim/monster';
import { COLORS, TEXT, TEXT_DIM } from '../ui/styles';
import { showSummary } from '../ui/summary';

const SIM_STEP = 1 / 60;
const MAX_FRAME_SECONDS = 0.25;
/** Sprites sit a little above the tile center so their feet land on the tile. */
const SPRITE_Y_OFFSET = -4;

const BALL_COLORS_UI: Record<string, number> = {
  poke: 0xe03030,
  great: 0x3070e0,
  ultra: 0xe0c030,
  dusk: 0x40a060,
  net: 0x30b0c0,
  quick: 0x60c0f0,
  master: 0xa040c0,
};

const STATUS_COLORS: Record<string, number | undefined> = {
  poison: 0xa040a0,
  burn: 0xf08030,
  paralysis: 0xf8d030,
  sleep: 0x6890f0,
  freeze: 0x98d8d8,
  confusion: 0xf85888,
};

interface EnemyView {
  sprite: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
  shiny: boolean;
  /** Caught: frozen in place while the ball animation plays. */
  captured: boolean;
  /** Playing Hurt or Faint; Walk must not override it. */
  busy: boolean;
  dying: boolean;
}

interface TowerView {
  sprite: Phaser.GameObjects.Sprite;
  busy: boolean;
}

export interface LevelSceneData {
  levelId?: string;
  seed?: number;
}

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
  private accumulator = 0;
  private ended = false;
  private overlay!: Phaser.GameObjects.Graphics;
  private hoverTile: [number, number] | null = null;
  private toast?: Phaser.GameObjects.Text;
  private debugPanel?: DebugPanel;
  private panel?: PokemonPanel;
  private learnDialog?: LearnDialog;
  private evolutionDialog?: EvolutionDialog;
  private paused = false;
  private selectedBall: string | null = null;
  private drag: { towerId: number; startX: number; startY: number; moved: boolean } | null = null;
  private dragGfx!: Phaser.GameObjects.Graphics;
  private levelSynced = false;

  constructor() {
    super('Level');
  }

  init(data: LevelSceneData): void {
    this.levelId = data.levelId ?? urlParam('level') ?? 'route-201';
    const urlSeed = Number(urlParam('seed'));
    this.seed = data.seed ?? (Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : (Date.now() % 1_000_000) + 1);
    this.enemyViews.clear();
    this.towerViews.clear();
    this.selectedTowerId = null;
    this.selectedPartyIndex = null;
    this.selectedBall = null;
    this.drag = null;
    this.levelSynced = false;
    this.accumulator = 0;
    this.ended = false;
    this.hoverTile = null;
  }

  create(): void {
    const def = getLevel(this.levelId);
    const map = getMap(def.map);
    loadDebugPartyIfRequested();
    const game = getGame();
    if (game.party.length === 0) {
      this.scene.start('LevelSelect');
      return;
    }
    this.state = createLevel(def, map, { seed: this.seed, party: game.party, config: runtimeConfig, items: game.items });
    this.drawMap();
    this.overlay = this.add.graphics().setDepth(900);
    this.dragGfx = this.add.graphics().setDepth(901);
    this.hud = new Hud(this, this.state, {
      onStartWave: () => this.tryStartWave(),
      onToggleSpeed: () => this.toggleSpeed(),
      onLeave: () => this.leave(),
      onPartySlot: (i) => this.handlePartySlot(i),
      onBall: (id) => this.selectBall(id),
    });
    this.panel = new PokemonPanel({
      portraitUrl: (species) => portraitUrl(species),
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
        this.towerViews.get(tower.id)?.sprite.destroy();
        this.towerViews.delete(tower.id);
        if (this.selectedTowerId === tower.id) this.selectedTowerId = null;
        return true;
      },
      onClose: () => undefined,
    });
    this.learnDialog = new LearnDialog();
    this.evolutionDialog = new EvolutionDialog();
    this.add.text(this.scale.width / 2, Hud.HEIGHT - 86, `seed ${this.seed}`, TEXT_DIM).setOrigin(0.5, 0).setDepth(1001);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));
    this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => this.onPointerUp(pointer));
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.panel?.isOpen) this.panel.hide();
      else if (this.selectedBall !== null || this.selectedTowerId !== null || this.selectedPartyIndex !== null) {
        this.selectedBall = null;
        this.selectedTowerId = null;
        this.selectedPartyIndex = null;
      } else this.scene.start('LevelSelect');
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
    });

    // Debug hook for automated checks.
    (window as unknown as { __ptd?: unknown }).__ptd = {
      scene: this,
      state: this.state,
      runtime,
      runtimeConfig,
      debugPanel: this.debugPanel,
      sim: { setPartyLevel, setTimeOfDay, resolveLearn, resolveEvolution, setActiveMove, moveTower, placeTower, throwBall },
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.debugPanel?.destroy();
      this.debugPanel = undefined;
      this.panel?.destroy();
      this.panel = undefined;
      this.learnDialog?.close();
      this.learnDialog = undefined;
      this.evolutionDialog?.close();
      this.evolutionDialog = undefined;
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

  private drawMap(): void {
    const { map, path } = this.state;
    const size = map.tileSize;
    const cave = map.theme === 'cave';
    const gfx = this.add.graphics().setDepth(0);
    const blocked = new Set((map.blocked ?? []).map(([x, y]) => tileKey(x, y)));
    const placeable = new Set(map.placeable.map(([x, y]) => tileKey(x, y)));
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const key = tileKey(x, y);
        let color: number;
        if (path.tiles.has(key)) color = cave ? COLORS.pathCave : COLORS.pathGrass;
        else if (blocked.has(key)) color = cave ? COLORS.blockedCave : COLORS.blockedGrass;
        else if ((x + y) % 2 === 0) color = cave ? COLORS.cave : COLORS.grass;
        else color = cave ? COLORS.caveAlt : COLORS.grassAlt;
        gfx.fillStyle(color, 1).fillRect(x * size, Hud.HEIGHT + y * size, size, size);
        if (placeable.has(key)) {
          gfx.lineStyle(2, COLORS.placeable, 0.9).strokeRect(x * size + 3, Hud.HEIGHT + y * size + 3, size - 6, size - 6);
        }
      }
    }
    // Path entrance and exit markers.
    const first = map.path[0]!;
    const last = map.path[map.path.length - 1]!;
    const a = this.tilePixel(first[0], first[1]);
    const b = this.tilePixel(last[0], last[1]);
    this.add.text(a.px, a.py - 22, 'IN', TEXT_DIM).setOrigin(0.5).setDepth(1);
    this.add.text(b.px, b.py - 22, 'OUT', TEXT_DIM).setOrigin(0.5).setDepth(1);
  }

  private drawOverlay(): void {
    const gfx = this.overlay;
    gfx.clear();
    const size = this.state.map.tileSize;
    if (this.state.phase === 'build' && this.hoverTile) {
      const [x, y] = this.hoverTile;
      if (isPlaceable(this.state.map, x, y) && !towerAt(this.state, x, y)) {
        gfx.lineStyle(2, COLORS.placeableHover, 1).strokeRect(x * size + 2, Hud.HEIGHT + y * size + 2, size - 4, size - 4);
      }
    }
    if (this.drag?.moved) {
      for (const [tx, ty] of this.state.map.placeable) {
        if (towerAt(this.state, tx, ty)) continue;
        gfx.fillStyle(COLORS.placeableHover, 0.25).fillRect(tx * size + 2, Hud.HEIGHT + ty * size + 2, size - 4, size - 4);
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
      if (view.dying || view.captured) continue;
      const d = Math.hypot(view.sprite.x - px, view.sprite.y - py);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.ended || this.paused) return;
    const tile = this.tileAt(pointer.x, pointer.y);
    if (!tile) return;
    if (this.selectedBall) {
      const enemyId = this.enemyNear(pointer.x, pointer.y);
      if (enemyId === null) {
        this.showToast('Click a wild Pokémon on the path');
        return;
      }
      const reason = canThrow(this.state, this.selectedBall, enemyId);
      if (reason) {
        this.showToast(reason);
        return;
      }
      this.handleEvents(throwBall(this.state, this.selectedBall, enemyId));
      if ((this.state.items.balls[this.selectedBall] ?? 0) <= 0) this.selectedBall = null;
      return;
    }
    const tower = towerAt(this.state, tile[0], tile[1]);
    if (tower) {
      this.drag = { towerId: tower.id, startX: pointer.x, startY: pointer.y, moved: false };
      return;
    }
    this.handleTileClick(tile[0], tile[1]);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    this.hoverTile = this.tileAt(pointer.x, pointer.y);
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
        if (partyIndex < 0 || state.towers.length >= state.def.placements) {
          this.showToast(
            state.def.placements === 1
              ? 'Only one Pokémon can be placed here; open the placed one and press Return to party'
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

  /** Party strip click: open the panel for a placed member, or pick an unplaced one to place next. */
  private handlePartySlot(index: number): void {
    const entry = this.state.party[index];
    if (!entry || this.ended) return;
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
    this.showToast(`Click a blue tile to place ${capitalize(entry.mon.name)} (click the slot again for its panel)`);
  }

  private openPanelFor(mon: Monster | undefined): void {
    if (!mon || !this.panel) return;
    const placed = this.state.towers.some((t) => t.mon === mon);
    this.panel.show(mon, placed);
  }

  private tryStartWave(): void {
    if (this.ended || this.state.phase !== 'build') return;
    if (this.state.towers.length === 0) {
      this.showToast('Place your Pokémon first');
      return;
    }
    this.selectedTowerId = null;
    this.handleEvents(startWave(this.state));
  }

  private toggleSpeed(): void {
    const speeds = [1, 2];
    const i = speeds.indexOf(runtime.gameSpeed);
    runtime.gameSpeed = speeds[(i + 1) % speeds.length] ?? 1;
  }

  private leave(): void {
    if (this.ended || this.state.def.objective !== 'free') return;
    this.handleEvents(leaveLevel(this.state));
  }

  private showToast(text: string): void {
    this.toast?.destroy();
    this.toast = this.add
      .text(this.scale.width / 2, Hud.HEIGHT + 12, text, { ...TEXT, backgroundColor: '#000000aa', padding: { x: 8, y: 4 } })
      .setOrigin(0.5, 0)
      .setDepth(1500);
    this.time.delayedCall(1800, () => this.toast?.destroy());
  }

  // ----------------------------------------------------------------- loop

  override update(_time: number, delta: number): void {
    if (this.ended) return;
    if (!this.paused) {
      this.accumulator += Math.min(delta / 1000, MAX_FRAME_SECONDS) * runtime.gameSpeed;
      while (this.accumulator >= SIM_STEP && !this.ended && !this.paused) {
        this.accumulator -= SIM_STEP;
        this.handleEvents(step(this.state, SIM_STEP));
      }
    }
    this.syncViews();
    this.drawOverlay();
    this.hud.setPaused(this.paused);
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
    });
  }

  private handleEvents(events: LevelEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'spawn':
          this.createEnemyView(e.enemyId as number, e.shiny ?? false);
          break;
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
          this.animateBall(e.enemyId as number, e.ball ?? 'poke', e.shakes ?? 0, e.caught ?? false);
          break;
        case 'caught':
          break;
        case 'evolutionPrompt':
          if (e.towerId !== undefined && e.species !== undefined) this.promptEvolution(e.towerId, e.species);
          break;
        case 'evolved': {
          const tower = this.state.towers.find((t) => t.id === e.towerId);
          if (tower) {
            this.towerViews.get(tower.id)?.sprite.destroy();
            this.towerViews.delete(tower.id);
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
          break;
        case 'leak':
          this.removeEnemyView(e.enemyId as number);
          break;
        case 'levelUp':
          if (e.towerId !== undefined) this.floatText(this.towerPixel(e.towerId), `Lv ${e.level}!`, '#ffe066');
          break;
        case 'waveStart':
          this.showToast(`Wave ${e.wave}`);
          break;
        case 'waveEnd':
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

  private animateBall(enemyId: number, ballId: string, shakes: number, caught: boolean): void {
    const view = this.enemyViews.get(enemyId);
    const target = this.enemyPixel(enemyId);
    if (caught && view) {
      view.captured = true;
      view.busy = true;
      view.sprite.anims.stop();
      view.hpBar.clear();
    }
    const ball = this.add.circle(this.scale.width / 2, this.scale.height + 10, 7, BALL_COLORS_UI[ballId] ?? 0xff0000).setStrokeStyle(2, 0x202020).setDepth(2600);
    const follow = () => (view ? { x: view.sprite.x, y: view.sprite.y } : { x: target.px, y: target.py });
    this.tweens.add({
      targets: ball,
      x: follow().x,
      y: follow().y - 10,
      duration: 350,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        if (!caught) {
          const p = follow();
          ball.x = Phaser.Math.Linear(ball.x, p.x, 0.2);
        }
      },
      onComplete: () => {
        if (caught && view) view.sprite.setVisible(false);
        const p = follow();
        ball.setPosition(p.x, p.y - 6);
        let n = 0;
        const shake = () => {
          if (n >= shakes || (!caught && n >= shakes)) return finish();
          n++;
          this.tweens.add({ targets: ball, angle: { from: -25, to: 25 }, duration: 160, yoyo: true, onComplete: () => this.time.delayedCall(220, shake) });
        };
        const finish = () => {
          if (caught) {
            this.floatText({ px: p.x, py: p.y }, 'Gotcha!', '#fff5a0');
            this.tweens.add({ targets: ball, alpha: 0, scale: 1.6, duration: 400, onComplete: () => ball.destroy() });
            this.removeEnemyView(enemyId);
          } else {
            this.floatText({ px: p.x, py: p.y }, 'Broke free!', '#cccccc');
            ball.destroy();
          }
        };
        if (shakes === 0) finish();
        else shake();
      },
    });
  }

  private syncGame(): void {
    if (this.levelSynced || !this.state) return;
    this.levelSynced = true;
    const game = getGame();
    for (const mon of this.state.caught) {
      if (!game.party.includes(mon) && !game.box.includes(mon)) {
        if (this.state.party.some((p) => p.mon === mon) && game.party.length < this.state.maxParty) game.party.push(mon);
        else addPokemon(game, mon);
      }
    }
    if (isOver(this.state)) recordLevelResult(game, this.levelId, this.state.phase as 'won' | 'lost' | 'left', this.state.wavesCleared);
  }

  private endLevel(): void {
    this.ended = true;
    this.syncGame();
    for (const id of [...this.enemyViews.keys()]) this.removeEnemyView(id);
    this.hud.update(this.state, runtime.gameSpeed);
    showSummary(this, summarize(this.state), {
      onRetry: () => this.scene.restart({ levelId: this.levelId, seed: this.seed + 1 }),
      onLevelSelect: () => this.scene.start('LevelSelect'),
    });
  }

  // ---------------------------------------------------------------- views

  private createTowerView(tower: Tower): void {
    const dex = spriteFolder(tower.mon.species, tower.mon.shiny);
    const { px, py } = this.tilePixel(tower.tile[0], tower.tile[1]);
    const sprite = createPmdSprite(this, dex, px, py + SPRITE_Y_OFFSET, 'Idle', Direction.Down);
    this.towerViews.set(tower.id, { sprite, busy: false });
  }

  private createEnemyView(enemyId: number, shiny: boolean): void {
    const enemy = this.state.enemies.find((e) => e.id === enemyId);
    if (!enemy) return;
    const dex = spriteFolder(enemy.mon.species, shiny);
    const point = pointAlongPath(this.state.path, enemy.distance);
    const { px, py } = this.tilePixel(point.x, point.y);
    const dir = directionFromVector(point.dx, point.dy, Direction.Right);
    const sprite = createPmdSprite(this, dex, px, py + SPRITE_Y_OFFSET, 'Walk', dir);
    const hpBar = this.add.graphics().setDepth(800);
    this.enemyViews.set(enemyId, { sprite, hpBar, busy: false, dying: false, shiny, captured: false });
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
    this.enemyViews.delete(enemyId);
  }

  private enemyPixel(enemyId: number): { px: number; py: number } {
    const view = this.enemyViews.get(enemyId);
    if (view) return { px: view.sprite.x, py: view.sprite.y };
    const enemy = this.state.enemies.find((e) => e.id === enemyId);
    if (!enemy) return { px: -100, py: -100 };
    const p = pointAlongPath(this.state.path, enemy.distance);
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
      if (this.drag?.moved && this.drag.towerId === tower.id) continue;
      const { px, py } = this.tilePixel(tower.tile[0], tower.tile[1]);
      view.sprite.setPosition(px, py + SPRITE_Y_OFFSET).setDepth(py);
      syncShadow(view.sprite);
    }
    const alive = new Set<number>();
    for (const enemy of state.enemies) {
      alive.add(enemy.id);
      const view = this.enemyViews.get(enemy.id);
      if (!view) continue;
      const point = pointAlongPath(state.path, enemy.distance);
      const { px, py } = this.tilePixel(point.x, point.y);
      view.sprite.setPosition(px, py + SPRITE_Y_OFFSET).setDepth(py);
      if (!view.busy) playAnim(view.sprite, 'Walk', directionFromVector(point.dx, point.dy, Direction.Right));
      syncShadow(view.sprite);
      this.drawHpBar(view.hpBar, enemy, px, py, size, view.shiny);
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
    if (shiny) gfx.lineStyle(1, 0xffd700, 1).strokeRect(x - 1, y - 1, w + 2, 6);
    gfx.fillStyle(COLORS.hpBack, 1).fillRect(x, y, w, 4);
    gfx.fillStyle(color, 1).fillRect(x, y, w * frac, 4);
    const ailment = enemy.mon.status.ailment;
    const dot = STATUS_COLORS[ailment];
    if (dot !== undefined) gfx.fillStyle(dot, 1).fillCircle(x + w + 6, y + 2, 3);
    else if (enemy.mon.status.flinchSeconds > 0) gfx.fillStyle(0xffffff, 1).fillCircle(x + w + 6, y + 2, 2);
  }
}
