import Phaser from 'phaser';
import type { LevelSummary } from '../sim/level';
import { BALLS } from '../sim/catch';
import { badgeTextureKey, iconTextureKey, itemTextureKey, portraitTextureKey } from '../game/runtime';
import { Button, framePanel } from './button';
import { TEXT, TEXT_BIG, TEXT_DIM } from './styles';

export interface SummaryCallbacks {
  onRetry: () => void;
  onLevelSelect: () => void;
}

const TITLES: Record<string, string> = {
  won: 'Level cleared!',
  lost: 'Out of lives',
  left: 'Left the route',
};

/** End-of-level overlay with EXP per Pokémon, level-ups, catches (with the ball used), trainer and badge. */
export function showSummary(scene: Phaser.Scene, summary: LevelSummary & { money?: number; newBadge?: boolean }, callbacks: SummaryCallbacks): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0).setDepth(2000);
  container.add(scene.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0).setInteractive());
  const panelW = 460;
  const extra = (summary.trainer ? 1 : 0) + (summary.badge ? 1 : 0);
  const lines = summary.party.length + summary.caught.length + (summary.caught.length ? 1 : 0) + extra;
  const panelH = Math.min(height - 20, 150 + lines * 26);
  const px = width / 2;
  const py = height / 2;
  container.add(framePanel(scene, px, py, panelW, panelH, summary.outcome === 'won' ? 'green' : 'blue'));
  container.add(scene.add.text(px, py - panelH / 2 + 24, TITLES[summary.outcome] ?? summary.outcome, TEXT_BIG).setOrigin(0.5));
  container.add(
    scene.add
      .text(px, py - panelH / 2 + 54, `Waves cleared ${summary.wavesCleared}   KOs ${summary.kos}   Leaks ${summary.leaks}${summary.money ? `   +$${summary.money}` : ''}`, TEXT_DIM)
      .setOrigin(0.5),
  );
  let y = py - panelH / 2 + 90;
  const left = px - panelW / 2;
  const portrait = (species: number, x: number, cy: number, shiny = false) => {
    const icon = iconTextureKey(species, 0, shiny);
    const key = scene.textures.exists(icon) ? icon : portraitTextureKey(species, shiny);
    if (scene.textures.exists(key)) container.add(scene.add.image(x, cy, key).setScale(key === icon ? 1 : 0.6));
  };
  if (summary.trainer) {
    container.add(scene.add.text(left + 24, y, `Defeated ${summary.trainer}!`, { ...TEXT, color: '#c87818' }));
    y += 26;
  }
  if (summary.badge) {
    const key = badgeTextureKey(summary.badge.id);
    if (scene.textures.exists(key)) container.add(scene.add.image(left + 30, y + 10, key).setScale(0.75));
    container.add(scene.add.text(left + 50, y, summary.newBadge === false ? `${summary.badge.name} (already earned)` : `Earned the ${summary.badge.name}!`, { ...TEXT, color: '#c87818' }));
    y += 26;
  }
  for (const p of summary.party) {
    const name = p.name.charAt(0).toUpperCase() + p.name.slice(1);
    const levelText = p.levelTo > p.levelFrom ? `Lv ${p.levelFrom} -> ${p.levelTo}` : `Lv ${p.levelTo}`;
    portrait(p.species, left + 30, y + 10, p.shiny);
    container.add(scene.add.text(left + 50, y, `${name}   +${p.expGained} EXP   ${levelText}`, TEXT));
    y += 26;
  }
  if (summary.caught.length) {
    container.add(scene.add.text(left + 24, y, 'Caught:', TEXT_DIM));
    y += 22;
    for (const c of summary.caught) {
      const name = c.name.charAt(0).toUpperCase() + c.name.slice(1);
      portrait(c.species, left + 30, y + 10, c.shiny);
      const ballKey = itemTextureKey(BALLS[c.ball]?.sprite ?? 'poke-ball');
      if (scene.textures.exists(ballKey)) container.add(scene.add.image(left + 58, y + 10, ballKey).setScale(0.8));
      container.add(scene.add.text(left + 76, y, `${c.shiny ? '★ ' : ''}${name}   Lv ${c.level}`, TEXT));
      y += 26;
    }
  }
  container.add(new Button(scene, px - 80, py + panelH / 2 - 30, 'Retry', callbacks.onRetry));
  container.add(new Button(scene, px + 80, py + panelH / 2 - 30, 'Level select', callbacks.onLevelSelect));
  return container;
}
