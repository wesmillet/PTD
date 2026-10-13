import Phaser from 'phaser';
import { getLevel, levelIds } from '../data/levels';
import { Button } from '../ui/button';
import { TEXT_BIG, TEXT_DIM } from '../ui/styles';

/** Minimal list of levels from levels.json. The Act map comes in Phase 5. */
export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelect');
  }

  create(): void {
    const { width } = this.scale;
    this.add.text(width / 2, 60, 'Sinnoh Tower Defense', TEXT_BIG).setOrigin(0.5);
    this.add.text(width / 2, 90, 'Pick a level', TEXT_DIM).setOrigin(0.5);
    let y = 150;
    for (const id of levelIds()) {
      const def = getLevel(id);
      const label = `${def.name}  (${def.objective === 'free' ? 'free roam' : `defend, ${def.waves} waves`})`;
      new Button(this, width / 2, y, label, () => this.scene.start('Level', { levelId: id }), 360, 34);
      y += 48;
    }
    new Button(this, width / 2, y + 24, 'Sprite demo (Phase 0)', () => this.scene.start('Phase0'), 240, 28);
    this.add.text(width / 2, this.scale.height - 24, 'Tip: open ?level=<id> to jump straight into a level', TEXT_DIM).setOrigin(0.5);
  }
}
