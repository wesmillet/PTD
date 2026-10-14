import Phaser from 'phaser';
import { BALL_IDS, BALLS } from '../sim/catch';
import { totalWaves, type LevelState } from '../sim/level';
import type { RuleStatus } from '../sim/rules';
import { getGame } from '../game/session';
import { iconInfo, iconTextureKey, itemTextureKey, portraitTextureKey } from '../game/runtime';
import config from '../data/config.json';
import uiGen4 from '../data/ui-gen4.json';
import { Button, framePanel } from './button';
import { COLORS, TEXT, TEXT_BIG, TEXT_DIM, TEXT_LIGHT, TEXT_LIGHT_BIG } from './styles';

const HPBOX = (uiGen4 as { hpBoxes: Record<string, { width: number; height: number; hpFill: { x: number; y: number; width: number; height: number } | null; lv: { x: number; y: number } | null }> }).hpBoxes;
/** The boss HP box (battle GUI enemy box) is drawn at this scale. */
const BOSS_BOX_SCALE = 2;

export interface HudCallbacks {
  onStartWave: () => void;
  onToggleSpeed: () => void;
  onLeave: () => void;
  onMenu: () => void;
  /** Press on a party slot: the scene starts a drag and treats a release without movement as a tap. */
  onPartySlotDown: (partyIndex: number, pointer: Phaser.Input.Pointer) => void;
  onBall: (ballId: string) => void;
  /** A rule's button was pressed (the generator). */
  onRule?: (ruleId: string) => void;
}

interface Slot {
  species: number;
  shiny: boolean;
  star?: Phaser.GameObjects.Image;
  frame: Phaser.GameObjects.Rectangle;
  image?: Phaser.GameObjects.Image;
  animated: boolean;
  level: Phaser.GameObjects.Text;
  hp: Phaser.GameObjects.Graphics;
  placed: Phaser.GameObjects.Text;
}

interface BallButton {
  id: string;
  frame: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  count: Phaser.GameObjects.Text;
}

export interface BossStatus {
  name: string;
  hp: number;
  maxHp: number;
  /** Legendary in its catch window: a Poké Ball icon shows on the bar. */
  catchable?: boolean;
  /** Phase thresholds as HP fractions (ticks on the bar). */
  phases?: number[];
  /** A noble's stagger meter (0..1) and whether it is staggered right now. */
  stagger?: number;
  staggered?: boolean;
}

/**
 * Top bar (three rows of 26 px text): the level name with the buttons,
 * then wave and lives with the rule status, then money with the hint;
 * the boss bar sits over the middle. Bottom bar (below the map): party
 * slots and the ball bar.
 */
export class Hud {
  /** Height of the top bar; the map starts here. */
  static readonly HEIGHT = 110;
  /** Height of the bottom bar under the map. */
  static readonly BOTTOM = 78;
  /** Party slot pitch and frame size in the bottom bar. */
  private static readonly SLOT_STEP = 62;
  private static readonly SLOT_W = 56;
  private readonly bottomY: number;
  private readonly scene: Phaser.Scene;
  private readonly callbacks: HudCallbacks;
  private readonly wave: Phaser.GameObjects.Text;
  private readonly lives: Phaser.GameObjects.Text;
  private readonly money: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly ruleText: Phaser.GameObjects.Text;
  private ruleButton?: Button;
  private ruleButtonId = '';
  private readonly startButton: Button;
  private readonly speedButton: Button;
  private readonly leaveButton: Button | undefined;
  private readonly bossGfx: Phaser.GameObjects.Graphics;
  private bossBall?: Phaser.GameObjects.Image;
  private readonly bossBox?: Phaser.GameObjects.Image;
  private readonly bossName: Phaser.GameObjects.Text;
  private readonly bossLevel?: Phaser.GameObjects.Text;
  private readonly bossHp: Phaser.GameObjects.Text;
  private bossShown = false;
  private slots: Slot[] = [];
  private readonly balls: BallButton[] = [];
  private paused = false;
  private iconFrame: 0 | 1 = 0;
  private iconTimer = 0;
  /** Box icons alternate frames at the Gen 5 rate (170 ms). */
  private static readonly ICON_FRAME_MS = 170;

  constructor(scene: Phaser.Scene, state: LevelState, callbacks: HudCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    const width = scene.scale.width;
    const height = scene.scale.height;
    this.bottomY = height - Hud.BOTTOM;
    // Both bars are Platinum text-box frames spanning the width.
    framePanel(scene, width / 2, Hud.HEIGHT / 2, width, Hud.HEIGHT, 'blue').setDepth(1000);
    framePanel(scene, width / 2, this.bottomY + Hud.BOTTOM / 2, width, Hud.BOTTOM, 'blue').setDepth(1000);
    scene.add.text(20, 6, state.def.name, TEXT_BIG).setDepth(1001);
    this.wave = scene.add.text(20, 40, '', TEXT).setDepth(1001);
    this.lives = scene.add.text(230, 40, '', TEXT).setDepth(1001);
    this.money = scene.add.text(20, 72, '', { ...TEXT, color: '#c87818' }).setDepth(1001);
    this.hint = scene.add.text(width / 2 + 40, 85, '', TEXT_DIM).setOrigin(0.5).setDepth(1001);
    this.ruleText = scene.add.text(width - 16, 53, '', { ...TEXT, color: '#3878e0' }).setOrigin(1, 0.5).setDepth(1001);
    // Boss bar: the battle GUI enemy HP box at 2x with the name font, Lv number and HP fill drawn over it.
    this.bossGfx = scene.add.graphics().setDepth(1003);
    const box = HPBOX['enemy'];
    const boxX = width / 2 + 40 - (box ? (box.width * BOSS_BOX_SCALE) / 2 : 128);
    const boxY = 38;
    if (box && scene.textures.exists('ui-hpbox-enemy')) {
      this.bossBox = scene.add.image(boxX, boxY, 'ui-hpbox-enemy').setOrigin(0).setScale(BOSS_BOX_SCALE).setDepth(1002).setVisible(false);
    }
    this.bossName = scene.add.text(boxX + 16, boxY + 8, '', TEXT_LIGHT_BIG).setDepth(1004).setVisible(false);
    if (box?.lv) {
      this.bossLevel = scene.add.text(boxX + (box.lv.x + 13) * BOSS_BOX_SCALE, boxY + box.lv.y * BOSS_BOX_SCALE - 1, '', TEXT_LIGHT).setDepth(1004).setVisible(false);
    }
    this.bossHp = scene.add.text(boxX + (box ? box.width * BOSS_BOX_SCALE : 256) - 20, boxY + 56, '', TEXT_LIGHT).setOrigin(1, 0.5).setDepth(1004).setVisible(false);
    // Buttons on the first row, right to left, each as wide as its label needs.
    const by = 24;
    let bx = width - 12;
    const place = (b: Button) => {
      b.setX(bx - b.frameWidth / 2);
      bx -= b.frameWidth + 8;
      return b.setDepth(1001);
    };
    this.startButton = place(new Button(scene, 0, by, 'Start wave (99s)', callbacks.onStartWave, 120));
    this.speedButton = place(new Button(scene, 0, by, '1x', callbacks.onToggleSpeed, 64));
    if (state.def.objective === 'free') this.leaveButton = place(new Button(scene, 0, by, 'Leave route', callbacks.onLeave, 120));
    place(new Button(scene, 0, by, 'Menu', callbacks.onMenu, 90));
    scene.add.text(14, this.bottomY + 36, 'Party', TEXT_DIM).setOrigin(0, 0.5).setDepth(1001);
    this.rebuildSlots(state);

    // Ball bar, right side of the bottom bar, with the Gen 5 item sprites.
    const obtainable = state.ballsOnly ?? BALL_IDS.filter((id) => BALLS[id]?.obtainable !== false);
    const pitch = 52;
    const startX = width - 14 - obtainable.length * pitch + pitch / 2;
    scene.add.text(startX - pitch / 2 - 10, this.bottomY + 36, 'Balls', TEXT_DIM).setOrigin(1, 0.5).setDepth(1001);
    obtainable.forEach((id, i) => {
      const x = startX + i * pitch;
      const y = this.bottomY + 38;
      const frame = scene.add.rectangle(x, y, pitch - 4, Hud.BOTTOM - 14, COLORS.panel2).setStrokeStyle(2, COLORS.borderOuter).setDepth(1001).setInteractive({ useHandCursor: true });
      frame.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        callbacks.onBall(id);
      });
      const key = itemTextureKey(BALLS[id]?.sprite ?? 'poke-ball');
      const icon = scene.textures.exists(key)
        ? scene.add.image(x, y - 14, key).setDepth(1002)
        : scene.add.circle(x, y - 14, 9, 0xe03030).setStrokeStyle(2, 0x202020).setDepth(1002);
      const count = scene.add.text(x, y + 16, '', TEXT).setOrigin(0.5).setDepth(1003);
      this.balls.push({ id, frame, icon, count });
    });
    this.update(state, 1);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** Screen position of a ball's slot in the bar (where a thrown ball starts). */
  ballOrigin(ballId: string): { x: number; y: number } {
    const b = this.balls.find((bb) => bb.id === ballId);
    return b ? { x: b.icon.x, y: b.icon.y } : { x: this.scene.scale.width / 2, y: this.bottomY + 24 };
  }

  private rebuildSlots(state: LevelState): void {
    for (const s of this.slots) {
      s.frame.destroy();
      s.image?.destroy();
      s.star?.destroy();
      s.level.destroy();
      s.hp.destroy();
      s.placed.destroy();
    }
    this.slots = [];
    state.party.forEach((entry, i) => {
      const x = 120 + i * Hud.SLOT_STEP;
      const y = this.bottomY + 32;
      const species = entry.mon.species;
      const frame = this.scene.add.rectangle(x, y + 6, Hud.SLOT_W, Hud.BOTTOM - 14, COLORS.panel2).setStrokeStyle(2, COLORS.borderOuter).setDepth(1001).setInteractive({ useHandCursor: true });
      frame.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.callbacks.onPartySlotDown(i, p);
      });
      // Gen 5 box icon (PokeAPI sprites); falls back to the SpriteCollab portrait.
      const info = iconInfo(species);
      const shiny = entry.mon.shiny;
      const iconKey = iconTextureKey(species, this.iconFrame, shiny);
      const portraitKey = portraitTextureKey(species, shiny);
      // Top to bottom inside the frame: HP bar, icon, level.
      const image = this.scene.textures.exists(iconKey)
        ? this.scene.add.image(x, y - 2, iconKey).setDepth(1002)
        : this.scene.textures.exists(portraitKey)
          ? this.scene.add.image(x, y - 2, portraitKey).setScale(0.8).setDepth(1002)
          : undefined;
      const level = this.scene.add.text(x, y + 24, '', TEXT).setOrigin(0.5).setDepth(1003);
      // A placed Pokémon shows as the blue frame outline (see update); the text stays for a possible marker.
      const placed = this.scene.add.text(x - Hud.SLOT_W / 2 + 4, y - 14, '', { ...TEXT, color: '#3878e0' }).setOrigin(0, 0.5).setDepth(1003).setVisible(false);
      const hp = this.scene.add.graphics().setDepth(1003);
      const slot: Slot = { species, shiny, frame, level, hp, placed, animated: !shiny && info.animatedIcon && this.scene.textures.exists(iconKey) };
      if (image) slot.image = image;
      if (shiny) slot.star = this.scene.add.image(x + Hud.SLOT_W / 2 - 8, y - 20, 'star').setDepth(1003).setTint(0xf8d030);
      this.slots.push(slot);
    });
  }

  /** Call once per frame with the frame delta so party icons bob. */
  tick(deltaMs: number): void {
    this.iconTimer += deltaMs;
    if (this.iconTimer < Hud.ICON_FRAME_MS) return;
    this.iconTimer -= Hud.ICON_FRAME_MS;
    this.iconFrame = this.iconFrame === 0 ? 1 : 0;
    for (const slot of this.slots) {
      if (slot.animated && slot.image) slot.image.setTexture(iconTextureKey(slot.species, this.iconFrame));
    }
  }

  /** The rules in play: a short status line and, when a rule offers an action, its button. */
  setRules(statuses: RuleStatus[]): void {
    const parts = statuses.map((s) => (s.value !== undefined && s.max !== undefined ? `${s.label} ${Math.ceil(s.value)}/${Math.ceil(s.max)}` : s.label));
    this.ruleText.setText(parts.join('  ·  '));
    const withButton = statuses.find((s) => s.button);
    if (!withButton) {
      this.ruleButton?.destroy();
      this.ruleButton = undefined;
      this.ruleButtonId = '';
      return;
    }
    if (this.ruleButtonId !== withButton.id) {
      this.ruleButton?.destroy();
      this.ruleButtonId = withButton.id;
      const b = new Button(this.scene, 0, 86, withButton.button ?? withButton.label, () => this.callbacks.onRule?.(withButton.id), 120);
      this.ruleButton = b.setX(this.scene.scale.width - 12 - b.frameWidth / 2).setDepth(1001);
    }
  }

  /** Boss HP box across the top bar; null hides it. */
  setBoss(boss: BossStatus & { level?: number } | null): void {
    this.bossGfx.clear();
    this.bossShown = boss !== null;
    this.bossBox?.setVisible(boss !== null);
    if (!boss) this.bossBall?.setVisible(false);
    this.bossName.setVisible(boss !== null);
    this.bossLevel?.setVisible(boss !== null);
    this.bossHp.setVisible(boss !== null);
    if (!boss) return;
    const frac = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0;
    const colour = frac > 0.5 ? COLORS.hpFront : frac > 0.2 ? COLORS.hpLow : COLORS.hpCritical;
    const box = HPBOX['enemy'];
    if (this.bossBox && box?.hpFill) {
      const f = box.hpFill;
      const s = BOSS_BOX_SCALE;
      const bx = this.bossBox.x + f.x * s;
      const by = this.bossBox.y + f.y * s;
      const bw = f.width * s;
      this.bossGfx.fillStyle(colour, 1).fillRect(bx, by, Math.round(bw * frac), f.height * s);
      // Phase ticks: a pale notch at each threshold.
      for (const at of boss.phases ?? []) {
        if (at >= 1 || at <= 0) continue;
        this.bossGfx.fillStyle(0xf8f8f8, 1).fillRect(Math.round(bx + bw * at) - 1, by - 1, 2, f.height * s + 2);
      }
      // A noble's stagger meter: a gold bar under the HP bar.
      if (boss.stagger !== undefined) {
        const sy = by + f.height * s + 3;
        this.bossGfx.fillStyle(0x283028, 1).fillRect(bx - 1, sy - 1, bw + 2, 6);
        this.bossGfx.fillStyle(boss.staggered ? 0xf8f8f8 : 0xf8c020, 1).fillRect(bx, sy, Math.round(bw * Math.max(0, Math.min(1, boss.stagger))), 4);
      }
      if (boss.catchable) {
        const key = this.scene.textures.exists('item-poke-ball') ? 'item-poke-ball' : undefined;
        if (!this.bossBall && key) this.bossBall = this.scene.add.image(bx + bw + 14, by + (f.height * s) / 2, key).setDepth(1004);
        this.bossBall?.setVisible(true).setPosition(bx + bw + 14, by + (f.height * s) / 2);
      } else {
        this.bossBall?.setVisible(false);
      }
    } else {
      const width = this.scene.scale.width;
      const w = Math.min(520, width - 300);
      const x = width / 2 - w / 2;
      this.bossGfx.fillStyle(COLORS.borderOuter, 1).fillRect(x - 1, 79, w + 2, 14);
      this.bossGfx.fillStyle(0x000000, 1).fillRect(x, 80, w, 12);
      this.bossGfx.fillStyle(colour, 1).fillRect(x, 80, Math.round(w * frac), 12);
    }
    this.bossName.setText(boss.staggered ? `${boss.name}  STAGGERED` : boss.name);
    this.bossLevel?.setText(String(boss.level ?? ''));
    this.bossHp.setText(`${boss.hp} / ${boss.maxHp}`);
  }

  update(state: LevelState, gameSpeed: number, selectedPartyIndex: number | null = null, selectedBall: string | null = null): void {
    const def = state.def;
    if (def.objective === 'defend') {
      this.wave.setText(`Wave ${state.wave} / ${totalWaves(state)}`);
      this.lives.setText(`Lives ${state.lives}`);
    } else {
      this.wave.setText(state.wave === 0 ? 'Free roam' : `Free roam, wave ${state.wave}`);
      this.lives.setText(`KOs ${state.kos}   Caught ${state.caught.length}`);
    }
    this.speedButton.setText(`${gameSpeed}x`);
    this.money.setText(`$${getGame().money}${state.kos > 0 ? `  +$${state.kos * config.money.perKo}` : ''}`);
    const canStart = state.phase === 'build' && state.towers.length > 0;
    this.startButton.setEnabled(canStart);
    const nextIn = def.objective === 'free' && state.phase === 'build' && state.towers.length > 0 ? ` (${Math.ceil(state.buildTimer)}s)` : '';
    this.startButton.setText(state.phase === 'build' ? `Start wave${nextIn}` : 'Wave running');
    const bossShown = this.bossShown;
    if (this.paused) {
      this.hint.setText('Paused');
    } else if (selectedBall) {
      this.hint.setText(`${BALLS[selectedBall]?.name ?? selectedBall}: click a wild Pokémon`);
    } else if (state.phase === 'build') {
      this.hint.setText(state.towers.length === 0 ? 'Drag a Pokémon onto a worn patch' : 'Drag to move, tap for the panel');
    } else if (state.phase === 'wave') {
      this.hint.setText(`${state.enemies.length} on the path, ${state.pending.length} to come`);
    } else {
      this.hint.setText('');
    }
    this.hint.setVisible(!bossShown);
    this.leaveButton?.setEnabled(state.phase === 'build' || state.phase === 'wave');

    if (this.slots.length !== state.party.length || this.slots.some((s, i) => s.species !== state.party[i]?.mon.species || s.shiny !== state.party[i]?.mon.shiny)) {
      this.rebuildSlots(state);
    }
    state.party.forEach((entry, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      slot.level.setText(`L${entry.mon.level}`);
      const isPlaced = state.towers.some((t) => t.mon === entry.mon);
      slot.frame.setStrokeStyle(2, i === selectedPartyIndex ? COLORS.selected : isPlaced ? COLORS.placeable : COLORS.borderOuter);
      slot.placed.setText(isPlaced ? '●' : '');
      const frac = entry.mon.stats.hp > 0 ? entry.mon.hp / entry.mon.stats.hp : 0;
      slot.hp.clear();
      // Battle-GUI bar: dark outline, black body, coloured fill.
      const hy = slot.frame.y - Hud.BOTTOM / 2 + 10;
      slot.hp.fillStyle(COLORS.borderOuter, 1).fillRect(slot.frame.x - 23, hy, 46, 5);
      slot.hp.fillStyle(0x000000, 1).fillRect(slot.frame.x - 22, hy + 1, 44, 3);
      slot.hp.fillStyle(frac > 0.5 ? COLORS.hpFront : frac > 0.2 ? COLORS.hpLow : COLORS.hpCritical, 1).fillRect(slot.frame.x - 22, hy + 1, Math.round(44 * frac), 3);
    });
    for (const b of this.balls) {
      const n = state.items.balls[b.id] ?? 0;
      b.count.setText(String(n));
      b.frame.setStrokeStyle(2, b.id === selectedBall ? COLORS.selected : COLORS.borderOuter);
      b.frame.setAlpha(n > 0 ? 1 : 0.4);
      b.icon.setAlpha(n > 0 ? 1 : 0.4);
    }
  }
}
