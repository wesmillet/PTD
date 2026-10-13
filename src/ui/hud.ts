import Phaser from 'phaser';
import type { LevelState } from '../sim/level';
import { Button } from './button';
import { COLORS, TEXT, TEXT_BIG, TEXT_DIM } from './styles';

export interface HudCallbacks {
  onStartWave: () => void;
  onToggleSpeed: () => void;
  onLeave: () => void;
  onPartySlot: (partyIndex: number) => void;
}

/** Top strip: level name, wave, lives, speed toggle, start/leave buttons. */
export class Hud {
  static readonly HEIGHT = 116;
  private static readonly STRIP_Y = 92;
  private readonly title: Phaser.GameObjects.Text;
  private readonly wave: Phaser.GameObjects.Text;
  private readonly lives: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly startButton: Button;
  private readonly speedButton: Button;
  private readonly leaveButton: Button | undefined;
  private readonly slots: { frame: Phaser.GameObjects.Rectangle; level: Phaser.GameObjects.Text; hp: Phaser.GameObjects.Graphics; placed: Phaser.GameObjects.Text }[] = [];
  private paused = false;

  constructor(scene: Phaser.Scene, state: LevelState, callbacks: HudCallbacks) {
    const width = scene.scale.width;
    scene.add.rectangle(0, 0, width, Hud.HEIGHT, COLORS.hudBg).setOrigin(0).setDepth(1000);
    this.title = scene.add.text(16, 10, state.def.name, TEXT_BIG).setDepth(1001);
    this.wave = scene.add.text(16, 42, '', TEXT).setDepth(1001);
    this.lives = scene.add.text(16, 62, '', TEXT).setDepth(1001);
    this.hint = scene.add.text(width / 2, 52, '', TEXT_DIM).setOrigin(0.5).setDepth(1001);
    this.startButton = new Button(scene, width - 80, 24, 'Start wave', callbacks.onStartWave).setDepth(1001);
    this.speedButton = new Button(scene, width - 80, 60, '1x', callbacks.onToggleSpeed, 60).setDepth(1001);
    if (state.def.objective === 'free') {
      this.leaveButton = new Button(scene, width - 220, 24, 'Leave route', callbacks.onLeave).setDepth(1001);
    }
    // Party strip: one 40x40 portrait slot per party member along the bottom of the HUD.
    scene.add.text(150, Hud.STRIP_Y - 6, 'Party', { ...TEXT_DIM, fontSize: '10px' }).setOrigin(1, 0.5).setDepth(1001);
    state.party.forEach((entry, i) => {
      const x = 186 + i * 52;
      const y = Hud.STRIP_Y - 10;
      const dex = String(entry.mon.species).padStart(4, '0');
      const frame = scene.add.rectangle(x, y + 6, 44, 44, 0x0d0d16).setStrokeStyle(1, COLORS.panelBorder).setDepth(1001).setInteractive({ useHandCursor: true });
      frame.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        callbacks.onPartySlot(i);
      });
      if (scene.textures.exists(`portrait-${dex}`)) scene.add.image(x, y + 6, `portrait-${dex}`).setDepth(1002);
      const level = scene.add.text(x + 22, y - 16, '', { ...TEXT_DIM, fontSize: '10px' }).setOrigin(1, 0).setDepth(1003);
      const placed = scene.add.text(x - 22, y - 16, '', { ...TEXT_DIM, fontSize: '10px', color: '#9ad0ff' }).setOrigin(0, 0).setDepth(1003);
      const hp = scene.add.graphics().setDepth(1003);
      this.slots.push({ frame, level, hp, placed });
    });
    this.update(state, 1);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  update(state: LevelState, gameSpeed: number, selectedPartyIndex: number | null = null): void {
    const def = state.def;
    if (def.objective === 'defend') {
      this.wave.setText(`Wave ${state.wave} / ${def.waves}`);
      this.lives.setText(`Lives ${state.lives}`);
    } else {
      this.wave.setText(state.wave === 0 ? 'Free roam' : `Free roam, wave ${state.wave}`);
      this.lives.setText(`KOs ${state.kos}`);
    }
    this.speedButton.setText(`${gameSpeed}x`);
    const canStart = state.phase === 'build' && state.towers.length > 0;
    this.startButton.setEnabled(canStart);
    const nextIn = def.objective === 'free' && state.phase === 'build' && state.towers.length > 0 ? ` (auto in ${Math.ceil(state.buildTimer)}s)` : '';
    this.startButton.setText(state.phase === 'build' ? `Start wave${nextIn}` : 'Wave running');
    if (this.paused) {
      this.hint.setText('Paused: choose a move to learn');
    } else if (state.phase === 'build') {
      this.hint.setText(
        state.towers.length === 0 ? 'Click a blue tile to place your Pokémon' : 'Click your Pokémon for its panel, or Move it to another blue tile. Start when ready.',
      );
    } else if (state.phase === 'wave') {
      this.hint.setText(`${state.enemies.length} on the path, ${state.pending.length} to come`);
    } else {
      this.hint.setText('');
    }
    this.leaveButton?.setEnabled(state.phase === 'build' || state.phase === 'wave');
    state.party.forEach((entry, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      slot.level.setText(`L${entry.mon.level}`);
      const isPlaced = state.towers.some((t) => t.mon === entry.mon);
      slot.frame.setStrokeStyle(i === selectedPartyIndex ? 2 : 1, i === selectedPartyIndex ? COLORS.selected : isPlaced ? COLORS.placeable : COLORS.panelBorder);
      slot.placed.setText(isPlaced ? '●' : '');
      if (entry.mon.shiny) slot.level.setText(`★L${entry.mon.level}`);
      const frac = entry.mon.stats.hp > 0 ? entry.mon.hp / entry.mon.stats.hp : 0;
      slot.hp.clear();
      slot.hp.fillStyle(COLORS.hpBack, 1).fillRect(slot.frame.x - 20, slot.frame.y + 18, 40, 3);
      slot.hp.fillStyle(frac > 0.5 ? COLORS.hpFront : frac > 0.2 ? COLORS.hpLow : COLORS.hpCritical, 1).fillRect(slot.frame.x - 20, slot.frame.y + 18, 40 * frac, 3);
    });
  }
}
