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
export function showSummary(scene: Phaser.Scene, summary: LevelSummary & { money?: number }, callbacks: SummaryCallbacks): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0).setDepth(2000);
  container.add(scene.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0).setInteractive());
  const panelW = 440;
  const lines = summary.party.length + summary.caught.length + (summary.caught.length ? 1 : 0);
  const panelH = 150 + lines * 26;
  const px = width / 2;
  const py = height / 2;
  const frame = scene.add.graphics();
  frame.fillStyle(COLORS.borderOuter, 1).fillRoundedRect(px - panelW / 2 - 3, py - panelH / 2 - 3, panelW + 6, panelH + 6, 12);
  frame.fillStyle(COLORS.panel, 1).fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 10);
  frame.lineStyle(2, COLORS.panelBorder, 1).strokeRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 10);
  container.add(frame);
  container.add(scene.add.text(px, py - panelH / 2 + 24, TITLES[summary.outcome] ?? summary.outcome, TEXT_BIG).setOrigin(0.5));
  container.add(
    scene.add
      .text(px, py - panelH / 2 + 54, `Waves cleared ${summary.wavesCleared}   KOs ${summary.kos}   Leaks ${summary.leaks}${summary.money ? `   +$${summary.money}` : ''}`, TEXT_DIM)
      .setOrigin(0.5),
  );
  let y = py - panelH / 2 + 90;
  const portrait = (species: number, x: number, cy: number) => {
    const key = `portrait-${String(species).padStart(4, '0')}`;
    if (scene.textures.exists(key)) container.add(scene.add.image(x, cy, key).setScale(0.6));
  };
  for (const p of summary.party) {
    const name = p.name.charAt(0).toUpperCase() + p.name.slice(1);
    const levelText = p.levelTo > p.levelFrom ? `Lv ${p.levelFrom} -> ${p.levelTo}` : `Lv ${p.levelTo}`;
    portrait(p.species, px - panelW / 2 + 30, y + 10);
    container.add(scene.add.text(px - panelW / 2 + 50, y, `${name}   +${p.expGained} EXP   ${levelText}`, TEXT));
    y += 26;
  }
  if (summary.caught.length) {
    container.add(scene.add.text(px - panelW / 2 + 24, y, 'Caught:', TEXT_DIM));
    y += 22;
    for (const c of summary.caught) {
      const name = c.name.charAt(0).toUpperCase() + c.name.slice(1);
      portrait(c.species, px - panelW / 2 + 30, y + 10);
      container.add(scene.add.text(px - panelW / 2 + 50, y, `${c.shiny ? '★ ' : ''}${name}   Lv ${c.level}`, TEXT));
      y += 26;
    }
  }
  container.add(new Button(scene, px - 80, py + panelH / 2 - 30, 'Retry', callbacks.onRetry));
  container.add(new Button(scene, px + 80, py + panelH / 2 - 30, 'Level select', callbacks.onLevelSelect));
  return container;
}
