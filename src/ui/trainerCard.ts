import Phaser from 'phaser';
import { findPokemonId } from '../data/pokedata';
import { iconTextureKey, trainerTextureKey } from '../game/runtime';
import { counterStarter, type TrainerDef } from '../sim/waves';
import { COLORS, TEXT, TEXT_BIG, TEXT_DIM } from './styles';

/**
 * "Trainer X wants to battle!" card shown when a trainer wave starts: the
 * trainer's portrait (a placeholder image from assets/trainers/), name,
 * intro line and party icons. Dismissed by a click or after `holdMs`.
 */
export function showTrainerCard(scene: Phaser.Scene, trainer: TrainerDef, starter: number | undefined, boss: boolean, holdMs: number, onDone: () => void): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const container = scene.add.container(0, 0).setDepth(2400);
  const shade = scene.add.rectangle(0, 0, width, height, 0x000000, 0.45).setOrigin(0).setInteractive();
  container.add(shade);
  const w = 460;
  const h = 150;
  const px = width / 2;
  const py = height / 2 - 40;
  const frame = scene.add.graphics();
  frame.fillStyle(COLORS.borderOuter, 1).fillRoundedRect(px - w / 2 - 3, py - h / 2 - 3, w + 6, h + 6, 12);
  frame.fillStyle(boss ? 0x3a1f26 : COLORS.panel, 1).fillRoundedRect(px - w / 2, py - h / 2, w, h, 10);
  frame.lineStyle(2, boss ? 0xd35a5a : COLORS.panelBorder, 1).strokeRoundedRect(px - w / 2, py - h / 2, w, h, 10);
  container.add(frame);
  const portraitKey = trainerTextureKey(trainer.id);
  if (scene.textures.exists(portraitKey)) {
    container.add(scene.add.image(px - w / 2 + 56, py - 10, portraitKey).setScale(1.4));
  }
  container.add(scene.add.text(px - w / 2 + 110, py - h / 2 + 18, trainer.name, TEXT_BIG));
  container.add(scene.add.text(px - w / 2 + 110, py - h / 2 + 48, boss ? 'Gym battle! Beat the boss to earn the badge.' : 'wants to battle!', { ...TEXT, color: boss ? '#ffb3b3' : '#f4ecd8' }));
  if (trainer.intro) {
    container.add(scene.add.text(px - w / 2 + 110, py - h / 2 + 72, trainer.intro, { ...TEXT_DIM, wordWrap: { width: w - 130 } }));
  }
  let ix = px - w / 2 + 110;
  const iy = py + h / 2 - 22;
  for (const p of trainer.party) {
    const species = p.species === 'counter-starter' ? counterStarter(starter) : findPokemonId(p.species);
    if (species === undefined) continue;
    const key = iconTextureKey(species, 0);
    if (scene.textures.exists(key)) {
      const icon = scene.add.image(ix, iy, key);
      if (p.boss) icon.setScale(1.3).setTint(0xffd0d0);
      container.add(icon);
    }
    container.add(scene.add.text(ix + 18, iy - 7, `L${p.level}`, { ...TEXT_DIM, fontSize: '11px' }));
    ix += 58;
  }
  container.add(scene.add.text(px, py + h / 2 + 18, 'Click to continue', TEXT_DIM).setOrigin(0.5));
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    container.destroy();
    onDone();
  };
  shade.once('pointerdown', finish);
  scene.time.delayedCall(holdMs, finish);
  return container;
}
