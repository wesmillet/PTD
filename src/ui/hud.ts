import Phaser from 'phaser';
import { BALL_IDS, BALLS } from '../sim/catch';
import type { LevelState } from '../sim/level';
import { Button } from './button';
import { COLORS, TEXT, TEXT_BIG, TEXT_DIM } from './styles';

export interface HudCallbacks {
  onStartWave: () => void;
  onToggleSpeed: () => void;
  onLeave: () => void;
  onPartySlot: (partyIndex: number) => void;
  onBall: (ballId: string) => void;
}

interface Slot {
  species: number;
  frame: Phaser.GameObjects.Rectangle;
  image?: Phaser.GameObjects.Image;
  level: Phaser.GameObjects.Text;
  hp: Phaser.GameObjects.Graphics;
  placed: Phaser.GameObjects.Text;
}

interface BallButton {
  id: string;
  frame: Phaser.GameObjects.Rectangle;
  count: Phaser.GameObjects.Text;
}

export const BALL_COLORS: Record<string, number> = {
  poke: 0xe03030,
  great: 0x3070e0,
  ultra: 0xe0c030,
  dusk: 0x40a060,
  net: 0x30b0c0,
  quick: 0x60c0f0,
  master: 0xa040c0,
};

/** Top strip: level name, wave, lives, speed, start/leave. Bottom row: party slots and ball bar. */
export class Hud {
  static readonly HEIGHT = 116;
  private static readonly STRIP_Y = 92;
  private readonly scene: Phaser.Scene;
  private readonly callbacks: HudCallbacks;
  private readonly wave: Phaser.GameObjects.Text;
  private readonly lives: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly startButton: Button;
  private readonly speedButton: Button;
  private readonly leaveButton: Button | undefined;
  private slots: Slot[] = [];
  private readonly balls: BallButton[] = [];
  private paused = false;

  constructor(scene: Phaser.Scene, state: LevelState, callbacks: HudCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    const width = scene.scale.width;
    scene.add.rectangle(0, 0, width, Hud.HEIGHT, COLORS.hudBg).setOrigin(0).setDepth(1000);
    scene.add.text(16, 10, state.def.name, TEXT_BIG).setDepth(1001);
    this.wave = scene.add.text(16, 42, '', TEXT).setDepth(1001);
    this.lives = scene.add.text(16, 62, '', TEXT).setDepth(1001);
    this.hint = scene.add.text(width / 2, 52, '', TEXT_DIM).setOrigin(0.5).setDepth(1001);
    this.startButton = new Button(scene, width - 80, 24, 'Start wave', callbacks.onStartWave).setDepth(1001);
    this.speedButton = new Button(scene, width - 80, 60, '1x', callbacks.onToggleSpeed, 60).setDepth(1001);
    if (state.def.objective === 'free') {
      this.leaveButton = new Button(scene, width - 220, 24, 'Leave route', callbacks.onLeave).setDepth(1001);
    }
    scene.add.text(150, Hud.STRIP_Y - 6, 'Party', { ...TEXT_DIM, fontSize: '10px' }).setOrigin(1, 0.5).setDepth(1001);
    this.rebuildSlots(state);

    // Ball bar, right side of the bottom row.
    const obtainable = BALL_IDS.filter((id) => BALLS[id]?.obtainable !== false);
    const startX = width - 16 - obtainable.length * 46 + 22;
    scene.add.text(startX - 30, Hud.STRIP_Y - 6, 'Balls', { ...TEXT_DIM, fontSize: '10px' }).setOrigin(1, 0.5).setDepth(1001);
    obtainable.forEach((id, i) => {
      const x = startX + i * 46;
      const y = Hud.STRIP_Y - 4;
      const frame = scene.add.rectangle(x, y, 42, 40, 0x0d0d16).setStrokeStyle(1, COLORS.panelBorder).setDepth(1001).setInteractive({ useHandCursor: true });
      frame.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        callbacks.onBall(id);
      });
      scene.add.circle(x, y - 6, 9, BALL_COLORS[id] ?? 0xffffff).setStrokeStyle(2, 0x202020).setDepth(1002);
      scene.add.rectangle(x, y - 6, 18, 2, 0x202020).setDepth(1003);
      scene.add.circle(x, y - 6, 3, 0xffffff).setStrokeStyle(1, 0x202020).setDepth(1003);
      const count = scene.add.text(x, y + 13, '', { ...TEXT_DIM, fontSize: '10px', color: '#ffffff' }).setOrigin(0.5).setDepth(1003);
      this.balls.push({ id, frame, count });
    });
    this.update(state, 1);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
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
      const x = 186 + i * 52;
      const y = Hud.STRIP_Y - 10;
      const dex = String(entry.mon.species).padStart(4, '0');
      const frame = this.scene.add.rectangle(x, y + 6, 44, 44, 0x0d0d16).setStrokeStyle(1, COLORS.panelBorder).setDepth(1001).setInteractive({ useHandCursor: true });
      frame.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.callbacks.onPartySlot(i);
      });
      const image = this.scene.textures.exists(`portrait-${dex}`) ? this.scene.add.image(x, y + 6, `portrait-${dex}`).setDepth(1002) : undefined;
      const level = this.scene.add.text(x + 22, y - 16, '', { ...TEXT_DIM, fontSize: '10px' }).setOrigin(1, 0).setDepth(1003);
      const placed = this.scene.add.text(x - 22, y - 16, '', { ...TEXT_DIM, fontSize: '10px', color: '#9ad0ff' }).setOrigin(0, 0).setDepth(1003);
      const hp = this.scene.add.graphics().setDepth(1003);
      const slot: Slot = { species: entry.mon.species, frame, level, hp, placed };
      if (image) slot.image = image;
      this.slots.push(slot);
    });
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
    const canStart = state.phase === 'build' && state.towers.length > 0;
    this.startButton.setEnabled(canStart);
    const nextIn = def.objective === 'free' && state.phase === 'build' && state.towers.length > 0 ? ` (auto in ${Math.ceil(state.buildTimer)}s)` : '';
    this.startButton.setText(state.phase === 'build' ? `Start wave${nextIn}` : 'Wave running');
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
    this.leaveButton?.setEnabled(state.phase === 'build' || state.phase === 'wave');

    if (this.slots.length !== state.party.length || this.slots.some((s, i) => s.species !== state.party[i]?.mon.species)) {
      this.rebuildSlots(state);
    }
    state.party.forEach((entry, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      slot.level.setText(`${entry.mon.shiny ? '★' : ''}L${entry.mon.level}`);
      const isPlaced = state.towers.some((t) => t.mon === entry.mon);
      slot.frame.setStrokeStyle(i === selectedPartyIndex ? 2 : 1, i === selectedPartyIndex ? COLORS.selected : isPlaced ? COLORS.placeable : COLORS.panelBorder);
      slot.placed.setText(isPlaced ? '●' : '');
      const frac = entry.mon.stats.hp > 0 ? entry.mon.hp / entry.mon.stats.hp : 0;
      slot.hp.clear();
      slot.hp.fillStyle(COLORS.hpBack, 1).fillRect(slot.frame.x - 20, slot.frame.y + 18, 40, 3);
      slot.hp.fillStyle(frac > 0.5 ? COLORS.hpFront : frac > 0.2 ? COLORS.hpLow : COLORS.hpCritical, 1).fillRect(slot.frame.x - 20, slot.frame.y + 18, 40 * frac, 3);
    });
    for (const b of this.balls) {
      const n = state.items.balls[b.id] ?? 0;
      b.count.setText(String(n));
      b.frame.setStrokeStyle(b.id === selectedBall ? 2 : 1, b.id === selectedBall ? COLORS.selected : COLORS.panelBorder);
      b.frame.setAlpha(n > 0 ? 1 : 0.4);
    }
  }
}
