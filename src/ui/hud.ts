import Phaser from 'phaser';
import { BALL_IDS, BALLS } from '../sim/catch';
import type { LevelState } from '../sim/level';
import { getGame } from '../game/session';
import { iconInfo, iconTextureKey, itemTextureKey } from '../game/runtime';
import config from '../data/config.json';
import { Button } from './button';
import { COLORS, TEXT, TEXT_BIG, TEXT_DIM } from './styles';

export interface HudCallbacks {
  onStartWave: () => void;
  onToggleSpeed: () => void;
  onLeave: () => void;
  onMenu: () => void;
  onPartySlot: (partyIndex: number) => void;
  onBall: (ballId: string) => void;
}

interface Slot {
  species: number;
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
}

/**
 * Top bar: level name, wave, lives, money, speed, Start / Leave, boss bar.
 * Bottom bar (below the map): party slots and the ball bar.
 */
export class Hud {
  /** Height of the top bar; the map starts here. */
  static readonly HEIGHT = 92;
  /** Height of the bottom bar under the map. */
  static readonly BOTTOM = 60;
  private readonly bottomY: number;
  private readonly scene: Phaser.Scene;
  private readonly callbacks: HudCallbacks;
  private readonly wave: Phaser.GameObjects.Text;
  private readonly lives: Phaser.GameObjects.Text;
  private readonly money: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly startButton: Button;
  private readonly speedButton: Button;
  private readonly leaveButton: Button | undefined;
  private readonly bossGfx: Phaser.GameObjects.Graphics;
  private readonly bossName: Phaser.GameObjects.Text;
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
    const bar = scene.add.graphics().setDepth(1000);
    bar.fillStyle(COLORS.hudBg, 1).fillRect(0, 0, width, Hud.HEIGHT);
    bar.fillStyle(COLORS.borderOuter, 1).fillRect(0, Hud.HEIGHT - 3, width, 3);
    bar.fillStyle(COLORS.hudBg, 1).fillRect(0, this.bottomY, width, Hud.BOTTOM);
    bar.fillStyle(COLORS.borderOuter, 1).fillRect(0, this.bottomY, width, 3);
    scene.add.text(16, 8, state.def.name, TEXT_BIG).setDepth(1001);
    this.wave = scene.add.text(16, 42, '', TEXT).setDepth(1001);
    this.lives = scene.add.text(16, 62, '', TEXT).setDepth(1001);
    this.money = scene.add.text(250, 42, '', { ...TEXT, color: '#ffe066' }).setDepth(1001);
    this.hint = scene.add.text(width / 2, 70, '', TEXT_DIM).setOrigin(0.5).setDepth(1001);
    this.bossGfx = scene.add.graphics().setDepth(1002);
    this.bossName = scene.add.text(width / 2, 58, '', { ...TEXT_DIM, color: '#ffb3b3' }).setOrigin(0.5, 1).setDepth(1003).setVisible(false);
    this.startButton = new Button(scene, width - 80, 22, 'Start wave', callbacks.onStartWave, 130, 30).setDepth(1001);
    this.speedButton = new Button(scene, width - 185, 22, '1x', callbacks.onToggleSpeed, 60, 30).setDepth(1001);
    if (state.def.objective === 'free') {
      this.leaveButton = new Button(scene, width - 300, 22, 'Leave route', callbacks.onLeave, 130, 30).setDepth(1001);
    }
    new Button(scene, width - (state.def.objective === 'free' ? 415 : 300), 22, 'Menu', callbacks.onMenu, 80, 30).setDepth(1001);
    scene.add.text(16, this.bottomY + 24, 'Party', { ...TEXT_DIM, fontSize: '11px' }).setOrigin(0, 0.5).setDepth(1001);
    this.rebuildSlots(state);

    // Ball bar, right side of the bottom bar, with the Gen 5 item sprites.
    const obtainable = BALL_IDS.filter((id) => BALLS[id]?.obtainable !== false);
    const startX = width - 16 - obtainable.length * 46 + 22;
    scene.add.text(startX - 30, this.bottomY + 30, 'Balls', { ...TEXT_DIM, fontSize: '11px' }).setOrigin(1, 0.5).setDepth(1001);
    obtainable.forEach((id, i) => {
      const x = startX + i * 46;
      const y = this.bottomY + 30;
      const frame = scene.add.rectangle(x, y, 42, 46, COLORS.panel2).setStrokeStyle(2, COLORS.borderOuter).setDepth(1001).setInteractive({ useHandCursor: true });
      frame.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        callbacks.onBall(id);
      });
      const key = itemTextureKey(BALLS[id]?.sprite ?? 'poke-ball');
      const icon = scene.textures.exists(key)
        ? scene.add.image(x, y - 7, key).setDepth(1002)
        : scene.add.circle(x, y - 8, 9, 0xe03030).setStrokeStyle(2, 0x202020).setDepth(1002);
      const count = scene.add.text(x, y + 13, '', { ...TEXT_DIM, fontSize: '11px', color: '#f4ecd8' }).setOrigin(0.5).setDepth(1003);
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
      s.level.destroy();
      s.hp.destroy();
      s.placed.destroy();
    }
    this.slots = [];
    state.party.forEach((entry, i) => {
      const x = 86 + i * 54;
      const y = this.bottomY + 24;
      const species = entry.mon.species;
      const frame = this.scene.add.rectangle(x, y + 6, 46, 46, COLORS.panel2).setStrokeStyle(2, COLORS.borderOuter).setDepth(1001).setInteractive({ useHandCursor: true });
      frame.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.callbacks.onPartySlot(i);
      });
      // Gen 5 box icon (PokeAPI sprites); falls back to the SpriteCollab portrait.
      const info = iconInfo(species);
      const iconKey = iconTextureKey(species, this.iconFrame);
      const portraitKey = `portrait-${String(species).padStart(4, '0')}`;
      const image = this.scene.textures.exists(iconKey)
        ? this.scene.add.image(x, y + 4, iconKey).setDepth(1002)
        : this.scene.textures.exists(portraitKey)
          ? this.scene.add.image(x, y + 6, portraitKey).setDepth(1002)
          : undefined;
      const level = this.scene.add.text(x + 22, y - 17, '', { ...TEXT_DIM, fontSize: '10px', color: '#f4ecd8' }).setOrigin(1, 0).setDepth(1003);
      const placed = this.scene.add.text(x - 22, y - 17, '', { ...TEXT_DIM, fontSize: '10px', color: '#9ad0ff' }).setOrigin(0, 0).setDepth(1003);
      const hp = this.scene.add.graphics().setDepth(1003);
      const slot: Slot = { species, frame, level, hp, placed, animated: info.animatedIcon && this.scene.textures.exists(iconKey) };
      if (image) slot.image = image;
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

  /** Boss HP bar across the top bar; null hides it. */
  setBoss(boss: BossStatus | null): void {
    this.bossGfx.clear();
    if (!boss) {
      this.bossName.setVisible(false);
      return;
    }
    const width = this.scene.scale.width;
    const w = Math.min(520, width - 300);
    const x = width / 2 - w / 2;
    const y = 62;
    const frac = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0;
    this.bossGfx.fillStyle(COLORS.borderOuter, 1).fillRoundedRect(x - 2, y - 2, w + 4, 16, 5);
    this.bossGfx.fillStyle(COLORS.hpBack, 1).fillRoundedRect(x, y, w, 12, 4);
    if (frac > 0) this.bossGfx.fillStyle(frac > 0.5 ? 0xd35a5a : frac > 0.2 ? 0xd3b05a : 0xff7b7b, 1).fillRoundedRect(x, y, Math.max(8, w * frac), 12, 4);
    this.bossName.setText(`${boss.name}   ${boss.hp} / ${boss.maxHp}`).setVisible(true);
  }

  update(state: LevelState, gameSpeed: number, selectedPartyIndex: number | null = null, selectedBall: string | null = null): void {
    const def = state.def;
    if (def.objective === 'defend') {
      this.wave.setText(`Wave ${state.wave} / ${def.waves}`);
      this.lives.setText(`Lives ${state.lives}`);
    } else {
      this.wave.setText(state.wave === 0 ? 'Free roam' : `Free roam, wave ${state.wave}`);
      this.lives.setText(`KOs ${state.kos}   Caught ${state.caught.length}`);
    }
    this.speedButton.setText(`${gameSpeed}x`);
    this.money.setText(`$${getGame().money}${state.kos > 0 ? `  +$${state.kos * config.money.perKo}` : ''}`);
    const canStart = state.phase === 'build' && state.towers.length > 0;
    this.startButton.setEnabled(canStart);
    const nextIn = def.objective === 'free' && state.phase === 'build' && state.towers.length > 0 ? ` (auto in ${Math.ceil(state.buildTimer)}s)` : '';
    this.startButton.setText(state.phase === 'build' ? `Start wave${nextIn}` : 'Wave running');
    const bossShown = this.bossName.visible;
    if (this.paused) {
      this.hint.setText('Paused');
    } else if (selectedBall) {
      this.hint.setText(`${BALLS[selectedBall]?.name ?? selectedBall}: click a wild Pokémon to throw (Esc cancels)`);
    } else if (state.phase === 'build') {
      this.hint.setText(state.towers.length === 0 ? 'Click a blue tile to place your Pokémon' : 'Drag a Pokémon to move it. Tap it for its panel. Start when ready.');
    } else if (state.phase === 'wave') {
      this.hint.setText(`${state.enemies.length} on the path, ${state.pending.length} to come`);
    } else {
      this.hint.setText('');
    }
    this.hint.setVisible(!bossShown || this.paused || selectedBall !== null);
    this.hint.setY(bossShown ? 84 : 70);
    this.leaveButton?.setEnabled(state.phase === 'build' || state.phase === 'wave');

    if (this.slots.length !== state.party.length || this.slots.some((s, i) => s.species !== state.party[i]?.mon.species)) {
      this.rebuildSlots(state);
    }
    state.party.forEach((entry, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      slot.level.setText(`${entry.mon.shiny ? '★' : ''}L${entry.mon.level}`);
      const isPlaced = state.towers.some((t) => t.mon === entry.mon);
      slot.frame.setStrokeStyle(2, i === selectedPartyIndex ? COLORS.selected : isPlaced ? COLORS.placeable : COLORS.borderOuter);
      slot.placed.setText(isPlaced ? '●' : '');
      const frac = entry.mon.stats.hp > 0 ? entry.mon.hp / entry.mon.stats.hp : 0;
      slot.hp.clear();
      slot.hp.fillStyle(COLORS.hpBack, 1).fillRect(slot.frame.x - 20, slot.frame.y + 18, 40, 3);
      slot.hp.fillStyle(frac > 0.5 ? COLORS.hpFront : frac > 0.2 ? COLORS.hpLow : COLORS.hpCritical, 1).fillRect(slot.frame.x - 20, slot.frame.y + 18, 40 * frac, 3);
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
