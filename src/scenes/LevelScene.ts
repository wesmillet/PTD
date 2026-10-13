import Phaser from 'phaser';
import { Direction, directionFromVector } from '../assets/direction';
import { createPmdSprite, pickAction, playAnim, spriteDirection, syncShadow } from '../assets/pmdLoader';
import { getLevel } from '../data/levels';
import { getMap } from '../data/maps';
import { createDebugParty, dexFolder, runtime, runtimeConfig, urlParam } from '../game/runtime';
import {
  createLevel,
  leaveLevel,
  moveTower,
  placeTower,
  setPartyLevel,
  setTimeOfDay,
  startWave,
  step,
  summarize,
  towerAt,
  type Enemy,
  type LevelEvent,
  type LevelState,
  type Tower,
} from '../sim/level';
import { isPlaceable, pointAlongPath, tileKey } from '../sim/map';
import { DebugPanel } from '../ui/debugPanel';
import { Hud } from '../ui/hud';
import { COLORS, TEXT, TEXT_DIM } from '../ui/styles';
import { showSummary } from '../ui/summary';

const SIM_STEP = 1 / 60;
const MAX_FRAME_SECONDS = 0.25;
/** Sprites sit a little above the tile center so their feet land on the tile. */
const SPRITE_Y_OFFSET = -4;

interface EnemyView {
  sprite: Phaser.GameObjects.Sprite;
  hpBar: Phaser.GameObjects.Graphics;
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
  private accumulator = 0;
  private ended = false;
  private overlay!: Phaser.GameObjects.Graphics;
  private hoverTile: [number, number] | null = null;
  private toast?: Phaser.GameObjects.Text;
  private debugPanel?: DebugPanel;

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
    this.accumulator = 0;
    this.ended = false;
    this.hoverTile = null;
  }

  create(): void {
    const def = getLevel(this.levelId);
    const map = getMap(def.map);
    this.state = createLevel(def, map, { seed: this.seed, party: createDebugParty(), config: runtimeConfig });
    this.drawMap();
    this.overlay = this.add.graphics().setDepth(900);
    this.hud = new Hud(this, this.state, {
      onStartWave: () => this.tryStartWave(),
      onToggleSpeed: () => this.toggleSpeed(),
      onLeave: () => this.leave(),
    });
    this.add.text(this.scale.width / 2, Hud.HEIGHT - 86, `seed ${this.seed}`, TEXT_DIM).setOrigin(0.5, 0).setDepth(1001);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const tile = this.tileAt(pointer.x, pointer.y);
      if (tile) this.handleTileClick(tile[0], tile[1]);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.hoverTile = this.tileAt(pointer.x, pointer.y);
    });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('LevelSelect'));
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
    (window as unknown as { __ptd?: unknown }).__ptd = { scene: this, state: this.state, runtime, runtimeConfig, debugPanel: this.debugPanel };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.debugPanel?.destroy();
      this.debugPanel = undefined;
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
    const selected = this.selectedTowerId !== null ? this.state.towers.find((t) => t.id === this.selectedTowerId) : undefined;
    for (const tower of this.state.towers) {
      const { px, py } = this.tilePixel(tower.tile[0], tower.tile[1]);
      if (tower === selected) {
        gfx.lineStyle(2, COLORS.selected, 1).strokeRect(tower.tile[0] * size + 2, Hud.HEIGHT + tower.tile[1] * size + 2, size - 4, size - 4);
      }
      if (tower === selected || this.state.phase === 'build') {
        gfx.lineStyle(1, COLORS.range, 0.35).strokeCircle(px, py, tower.rangeTiles * size);
      }
    }
  }

  // ---------------------------------------------------------------- input

  private handleTileClick(x: number, y: number): void {
    if (this.ended) return;
    const state = this.state;
    const clicked = towerAt(state, x, y);
    if (clicked) {
      this.selectedTowerId = this.selectedTowerId === clicked.id ? null : clicked.id;
      return;
    }
    if (state.phase !== 'build') {
      this.showToast('Pokémon can only be placed or moved between waves');
      return;
    }
    if (!isPlaceable(state.map, x, y)) return;
    try {
      if (this.selectedTowerId !== null) {
        moveTower(state, this.selectedTowerId, x, y);
        this.selectedTowerId = null;
      } else {
        const placed = new Set(state.towers.map((t) => t.mon));
        const partyIndex = state.party.findIndex((p) => !placed.has(p.mon));
        if (partyIndex < 0 || state.towers.length >= state.def.placements) {
          this.showToast('No more Pokémon to place; click one to move it');
          return;
        }
        const tower = placeTower(state, partyIndex, x, y);
        this.createTowerView(tower);
      }
    } catch (err) {
      this.showToast(err instanceof Error ? err.message : String(err));
    }
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
    this.accumulator += Math.min(delta / 1000, MAX_FRAME_SECONDS) * runtime.gameSpeed;
    while (this.accumulator >= SIM_STEP && !this.ended) {
      this.accumulator -= SIM_STEP;
      this.handleEvents(step(this.state, SIM_STEP));
    }
    this.syncViews();
    this.drawOverlay();
    this.hud.update(this.state, runtime.gameSpeed);
  }

  private handleEvents(events: LevelEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'spawn':
          this.createEnemyView(e.enemyId as number);
          break;
        case 'attack':
          this.animateAttack(e.towerId as number, e.enemyId as number);
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

  private endLevel(): void {
    this.ended = true;
    for (const id of [...this.enemyViews.keys()]) this.removeEnemyView(id);
    this.hud.update(this.state, runtime.gameSpeed);
    showSummary(this, summarize(this.state), {
      onRetry: () => this.scene.restart({ levelId: this.levelId, seed: this.seed + 1 }),
      onLevelSelect: () => this.scene.start('LevelSelect'),
    });
  }

  // ---------------------------------------------------------------- views

  private createTowerView(tower: Tower): void {
    const dex = dexFolder(tower.mon.species);
    const { px, py } = this.tilePixel(tower.tile[0], tower.tile[1]);
    const sprite = createPmdSprite(this, dex, px, py + SPRITE_Y_OFFSET, 'Idle', Direction.Down);
    this.towerViews.set(tower.id, { sprite, busy: false });
  }

  private createEnemyView(enemyId: number): void {
    const enemy = this.state.enemies.find((e) => e.id === enemyId);
    if (!enemy) return;
    const dex = dexFolder(enemy.mon.species);
    const point = pointAlongPath(this.state.path, enemy.distance);
    const { px, py } = this.tilePixel(point.x, point.y);
    const dir = directionFromVector(point.dx, point.dy, Direction.Right);
    const sprite = createPmdSprite(this, dex, px, py + SPRITE_Y_OFFSET, 'Walk', dir);
    const hpBar = this.add.graphics().setDepth(800);
    this.enemyViews.set(enemyId, { sprite, hpBar, busy: false, dying: false });
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

  private animateAttack(towerId: number, enemyId: number): void {
    const view = this.towerViews.get(towerId);
    if (!view) return;
    const from = this.towerPixel(towerId);
    const to = this.enemyPixel(enemyId);
    const dir = directionFromVector(to.px - from.px, to.py - from.py, spriteDirection(view.sprite) ?? Direction.Down);
    const dex = dexFolder(this.state.towers.find((t) => t.id === towerId)?.mon.species ?? 0);
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
    const dex = dexFolder(this.state.enemies.find((e) => e.id === enemyId)?.mon.species ?? 0);
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
    // The sim already removed the enemy; use the dex from the sprite's texture key.
    const dex = (view.sprite.texture.key.match(/^pmd-(\d{4})-/) ?? [])[1] ?? '';
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
      this.drawHpBar(view.hpBar, enemy, px, py, size);
    }
    for (const [id, view] of this.enemyViews) {
      if (!alive.has(id) && !view.dying) this.removeEnemyView(id);
    }
  }

  private drawHpBar(gfx: Phaser.GameObjects.Graphics, enemy: Enemy, px: number, py: number, size: number): void {
    const w = size - 8;
    const x = px - w / 2;
    const y = py - size / 2 - 6;
    const frac = Math.max(0, Math.min(1, enemy.mon.hp / enemy.mon.stats.hp));
    const color = frac > 0.5 ? COLORS.hpFront : frac > 0.2 ? COLORS.hpLow : COLORS.hpCritical;
    gfx.clear();
    gfx.fillStyle(COLORS.hpBack, 1).fillRect(x, y, w, 4);
    gfx.fillStyle(color, 1).fillRect(x, y, w * frac, 4);
  }
}
