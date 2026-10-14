import Phaser from 'phaser';
import type { LevelSummary } from '../sim/level';
import { BALLS } from '../sim/catch';
import { badgeTextureKey, iconTextureKey, itemTextureKey, portraitTextureKey } from '../game/runtime';
import { summaryStars } from '../sim/stars';
import { Button, framePanel } from './button';

export { summaryStars };
import { TEXT, TEXT_BIG, TEXT_DIM } from './styles';

export interface SummaryCallbacks {
  onRetry: () => void;
  onLevelSelect: () => void;
  /** Runtime levels (Conference rounds) cannot be retried. */
  noRetry?: boolean;
  continueLabel?: string;
  /** The next story level, when one is open. */
  onNext?: () => void;
  nextLabel?: string;
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
  const panelW = Math.min(width - 24, 640);
  const row = 30;
  const extra = (summary.trainer ? 1 : 0) + (summary.badge ? 1 : 0);
  const lines = summary.party.length + summary.caught.length + (summary.caught.length ? 1 : 0) + extra;
  const panelH = Math.min(height - 20, 196 + lines * row);
  const px = width / 2;
  const py = height / 2;
  container.add(framePanel(scene, px, py, panelW, panelH, summary.outcome === 'won' ? 'green' : 'blue'));
  container.add(scene.add.text(px, py - panelH / 2 + 24, TITLES[summary.outcome] ?? summary.outcome, TEXT_BIG).setOrigin(0.5));
  // Stars: cleared, lives kept (or three waves), a catch (or no leaks).
  const stars = summaryStars(summary);
  for (let i = 0; i < 3; i++) {
    container.add(scene.add.text(px - 30 + i * 30, py - panelH / 2 + 48, '★', { ...TEXT_BIG, color: i < stars ? '#f8c020' : '#b0b8c0' }).setOrigin(0.5));
  }
  container.add(
    scene.add
      .text(px, py - panelH / 2 + 80, `Waves ${summary.wavesCleared}  KOs ${summary.kos}  Leaks ${summary.leaks}${summary.money ? `  +$${summary.money}` : ''}`, TEXT_DIM)
      .setOrigin(0.5),
  );
  let y = py - panelH / 2 + 110;
  const left = px - panelW / 2;
  const portrait = (species: number, x: number, cy: number, shiny = false) => {
    const icon = iconTextureKey(species, 0, shiny);
    const key = scene.textures.exists(icon) ? icon : portraitTextureKey(species, shiny);
    if (scene.textures.exists(key)) container.add(scene.add.image(x, cy, key).setScale(key === icon ? 1 : 0.6));
  };
  if (summary.trainer) {
    container.add(scene.add.text(left + 24, y, `Defeated ${summary.trainer}!`, { ...TEXT, color: '#c87818' }));
    y += row;
  }
  if (summary.badge) {
    const key = badgeTextureKey(summary.badge.id);
    if (scene.textures.exists(key)) container.add(scene.add.image(left + 30, y + 10, key).setScale(0.75));
    container.add(scene.add.text(left + 50, y, summary.newBadge === false ? `${summary.badge.name} (already earned)` : `Earned the ${summary.badge.name}!`, { ...TEXT, color: '#c87818' }));
    y += row;
  }
  for (const p of summary.party) {
    const name = p.name.charAt(0).toUpperCase() + p.name.slice(1);
    const levelText = p.levelTo > p.levelFrom ? `Lv ${p.levelFrom} > ${p.levelTo}` : `Lv ${p.levelTo}`;
    portrait(p.species, left + 30, y + 13, p.shiny);
    container.add(scene.add.text(left + 52, y, `${name}  +${p.expGained} EXP`, TEXT));
    container.add(scene.add.text(left + panelW - 24, y, levelText, p.levelTo > p.levelFrom ? { ...TEXT, color: '#c87818' } : TEXT).setOrigin(1, 0));
    y += row;
  }
  if (summary.caught.length) {
    container.add(scene.add.text(left + 24, y, 'Caught:', TEXT_DIM));
    y += row;
    for (const c of summary.caught) {
      const name = c.name.charAt(0).toUpperCase() + c.name.slice(1);
      portrait(c.species, left + 30, y + 13, c.shiny);
      const ballKey = itemTextureKey(BALLS[c.ball]?.sprite ?? 'poke-ball');
      if (scene.textures.exists(ballKey)) container.add(scene.add.image(left + 60, y + 13, ballKey).setScale(0.8));
      container.add(scene.add.text(left + 80, y, `${c.shiny ? '★ ' : ''}${name}  Lv ${c.level}`, TEXT));
      y += row;
    }
  }
  // Buttons along the bottom edge, spread to fit their labels.
  const by = py + panelH / 2 - 34;
  const buttons: Button[] = [];
  if (callbacks.noRetry) {
    buttons.push(new Button(scene, 0, by, callbacks.continueLabel ?? 'Continue', callbacks.onLevelSelect, 180));
  } else {
    buttons.push(new Button(scene, 0, by, 'Retry', callbacks.onRetry, 120));
    buttons.push(new Button(scene, 0, by, callbacks.continueLabel ?? 'Level select', callbacks.onLevelSelect, 120));
    if (callbacks.onNext && summary.outcome !== 'lost') buttons.push(new Button(scene, 0, by, callbacks.nextLabel ?? 'Next level', callbacks.onNext, 120));
  }
  const gap = 12;
  const total = buttons.reduce((s, b) => s + b.frameWidth, 0) + gap * (buttons.length - 1);
  let bx = px - total / 2;
  for (const b of buttons) {
    b.setX(bx + b.frameWidth / 2);
    bx += b.frameWidth + gap;
    container.add(b);
  }
  return container;
}
