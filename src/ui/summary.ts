import Phaser from 'phaser';
import type { LevelSummary } from '../sim/level';
import { Button } from './button';
import { COLORS, TEXT, TEXT_BIG, TEXT_DIM } from './styles';

export interface SummaryCallbacks {
  onRetry: () => void;
  onLevelSelect: () => void;
}

const TITLES: Record<string, string> = {
  won: 'Level cleared!',
  lost: 'Out of lives',
  left: 'Left the route',
};

/** End-of-level overlay with EXP per Pokémon and level-ups. */
export function showSummary(scene: Phaser.Scene, summary: LevelSummary, callbacks: SummaryCallbacks): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0).setDepth(2000);
  container.add(scene.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0).setInteractive());
  const panelW = 440;
  const lines = summary.party.length;
  const panelH = 150 + lines * 22;
  const px = width / 2;
  const py = height / 2;
  container.add(scene.add.rectangle(px, py, panelW, panelH, COLORS.panel).setStrokeStyle(2, COLORS.panelBorder));
  container.add(scene.add.text(px, py - panelH / 2 + 24, TITLES[summary.outcome] ?? summary.outcome, TEXT_BIG).setOrigin(0.5));
  container.add(
    scene.add
      .text(px, py - panelH / 2 + 54, `Waves cleared ${summary.wavesCleared}   KOs ${summary.kos}   Leaks ${summary.leaks}`, TEXT_DIM)
      .setOrigin(0.5),
  );
  let y = py - panelH / 2 + 90;
  for (const p of summary.party) {
    const name = p.name.charAt(0).toUpperCase() + p.name.slice(1);
    const levelText = p.levelTo > p.levelFrom ? `Lv ${p.levelFrom} -> ${p.levelTo}` : `Lv ${p.levelTo}`;
    container.add(scene.add.text(px - panelW / 2 + 24, y, `${name}   +${p.expGained} EXP   ${levelText}`, TEXT));
    y += 22;
  }
  container.add(new Button(scene, px - 80, py + panelH / 2 - 30, 'Retry', callbacks.onRetry));
  container.add(new Button(scene, px + 80, py + panelH / 2 - 30, 'Level select', callbacks.onLevelSelect));
  return container;
}
