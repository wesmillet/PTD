import Phaser from 'phaser';
import { hasSave } from '../game/storage';
import { badgeTextureKey } from '../game/runtime';
import { getGame, resetGame } from '../game/session';
import { allBadges, hasBadge } from '../sim/game';
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
    // The bag screen's big Poké Ball behind the title.
    if (this.textures.exists('ui-pokeball')) this.add.image(width / 2, 112, 'ui-pokeball').setScale(1.25);
    this.add.text(width / 2, 222, 'Sinnoh Tower Defense', TEXT_TITLE).setOrigin(0.5);
    this.add.text(width / 2, 252, 'A Pokémon Tower Defense fan game', TEXT_DIM).setOrigin(0.5);
    const saved = hasSave();
    const game = getGame();
    // Badge case under the subtitle: lit for the badges this save has earned.
    const badges = allBadges();
    let bx = width / 2 - (badges.length - 1) * 20;
    for (const b of badges) {
      const earned = hasBadge(game, b.id);
      const key = badgeTextureKey(b.id, earned);
      if (this.textures.exists(key)) this.add.image(bx, 290, key).setScale(0.5).setAlpha(earned ? 1 : 0.5);
      bx += 40;
    }
    const y = height * 0.58;
    const cont = new Button(this, width / 2, y, saved ? 'Continue' : 'Continue (no save)', () => this.scene.start('LevelSelect'), 220, 36, 'ui-menu-party');
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
      'ui-menu-pokedex',
    );
    new Button(this, width / 2, y + 96, 'Credits', () => this.credits?.show(), 220, 36, 'ui-menu-card');
    this.credits = new CreditsScreen(() => undefined);
    this.add.text(width / 2, height - 18, 'Non-commercial fan project. Pokémon is a trademark of Nintendo, Creatures Inc. and GAME FREAK.', TEXT_DIM).setOrigin(0.5);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.credits?.close();
      this.credits = undefined;
    });
  }
}
