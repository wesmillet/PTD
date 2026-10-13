import Phaser from 'phaser';
import { hasSave } from '../game/storage';
import { getGame, resetGame } from '../game/session';
import { Button } from '../ui/button';
import { CreditsScreen } from '../ui/creditsScreen';
import { COLORS, TEXT_DIM, TEXT_TITLE } from '../ui/styles';

/** Title screen: Continue, New Game, Credits. */
export class TitleScene extends Phaser.Scene {
  private credits?: CreditsScreen;

  constructor() {
    super('Title');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const g = this.add.graphics();
    for (let i = 0; i < 40; i++) {
      g.fillStyle(0xffffff, 0.08 + (i % 3) * 0.05).fillRect((i * 97) % width, (i * 53) % (height - 160), 2, 2);
    }
    this.add.text(width / 2, height * 0.3, 'Sinnoh Tower Defense', TEXT_TITLE).setOrigin(0.5);
    this.add.text(width / 2, height * 0.3 + 44, 'A Pokémon Tower Defense fan game', TEXT_DIM).setOrigin(0.5);
    const saved = hasSave();
    const game = getGame();
    const y = height * 0.58;
    const cont = new Button(this, width / 2, y, saved ? 'Continue' : 'Continue (no save)', () => this.scene.start('LevelSelect'), 220, 36);
    cont.setEnabled(saved || game.party.length > 0);
    new Button(
      this,
      width / 2,
      y + 48,
      'New Game',
      () => {
        if ((saved || game.party.length > 0) && !window.confirm('Start a new game? The current save will be deleted.')) return;
        resetGame();
        this.scene.start('LevelSelect');
      },
      220,
      36,
    );
    new Button(this, width / 2, y + 96, 'Credits', () => this.credits?.show(), 220, 36);
    this.credits = new CreditsScreen(() => undefined);
    this.add.text(width / 2, height - 18, 'Non-commercial fan project. Pokémon is a trademark of Nintendo, Creatures Inc. and GAME FREAK.', TEXT_DIM).setOrigin(0.5);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.credits?.close();
      this.credits = undefined;
    });
  }
}
