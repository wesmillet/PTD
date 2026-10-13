import Phaser from 'phaser';
import type { LevelState } from '../sim/level';
import { Button } from './button';
import { COLORS, TEXT, TEXT_BIG, TEXT_DIM } from './styles';

export interface HudCallbacks {
  onStartWave: () => void;
  onToggleSpeed: () => void;
  onLeave: () => void;
}

/** Top strip: level name, wave, lives, speed toggle, start/leave buttons. */
export class Hud {
  static readonly HEIGHT = 92;
  private readonly title: Phaser.GameObjects.Text;
  private readonly wave: Phaser.GameObjects.Text;
  private readonly lives: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly startButton: Button;
  private readonly speedButton: Button;
  private readonly leaveButton: Button | undefined;

  constructor(scene: Phaser.Scene, state: LevelState, callbacks: HudCallbacks) {
    const width = scene.scale.width;
    scene.add.rectangle(0, 0, width, Hud.HEIGHT, COLORS.hudBg).setOrigin(0).setDepth(1000);
    this.title = scene.add.text(16, 10, state.def.name, TEXT_BIG).setDepth(1001);
    this.wave = scene.add.text(16, 42, '', TEXT).setDepth(1001);
    this.lives = scene.add.text(16, 62, '', TEXT).setDepth(1001);
    this.hint = scene.add.text(width / 2, 70, '', TEXT_DIM).setOrigin(0.5).setDepth(1001);
    this.startButton = new Button(scene, width - 80, 24, 'Start wave', callbacks.onStartWave).setDepth(1001);
    this.speedButton = new Button(scene, width - 80, 60, '1x', callbacks.onToggleSpeed, 60).setDepth(1001);
    if (state.def.objective === 'free') {
      this.leaveButton = new Button(scene, width - 220, 24, 'Leave route', callbacks.onLeave).setDepth(1001);
    }
    this.update(state, 1);
  }

  update(state: LevelState, gameSpeed: number): void {
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
    if (state.phase === 'build') {
      this.hint.setText(
        state.towers.length === 0 ? 'Click a blue tile to place your Pokémon' : 'Click your Pokémon, then a blue tile, to move it. Start when ready.',
      );
    } else if (state.phase === 'wave') {
      this.hint.setText(`${state.enemies.length} on the path, ${state.pending.length} to come`);
    } else {
      this.hint.setText('');
    }
    this.leaveButton?.setEnabled(state.phase === 'build' || state.phase === 'wave');
  }
}
