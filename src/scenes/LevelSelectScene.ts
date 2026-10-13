import Phaser from 'phaser';
import { getLevel } from '../data/levels';
import { portraitUrl } from '../game/runtime';
import { getGame, loadDebugPartyIfRequested, needsStarter, pickStarter, STARTERS } from '../game/session';
import { isLevelCompleted, isLevelUnlocked, orderedLevelIds } from '../sim/game';
import { Button } from '../ui/button';
import { PartyScreen } from '../ui/partyScreen';
import { showStarterDialog } from '../ui/starterDialog';
import { TEXT_BIG, TEXT_DIM } from '../ui/styles';

/** Level list with the unlock chain, plus the Party / PC screen. The Act map comes in Phase 5. */
export class LevelSelectScene extends Phaser.Scene {
  private partyScreen?: PartyScreen;
  private starterRoot?: HTMLDivElement;

  constructor() {
    super('LevelSelect');
  }

  create(): void {
    loadDebugPartyIfRequested();
    const game = getGame();
    const { width } = this.scale;
    this.add.text(width / 2, 50, 'Sinnoh Tower Defense', TEXT_BIG).setOrigin(0.5);
    const partyText = game.party.length ? `Party: ${game.party.map((m) => `${m.name} L${m.level}`).join(', ')}` : 'No Pokémon yet';
    this.add.text(width / 2, 80, partyText, TEXT_DIM).setOrigin(0.5);

    let y = 130;
    for (const id of orderedLevelIds()) {
      const def = getLevel(id);
      const unlocked = isLevelUnlocked(game, id);
      const done = isLevelCompleted(game, id);
      const kind = def.objective === 'free' ? 'free roam' : `defend, ${def.waves} waves`;
      const label = `${done ? '✓ ' : unlocked ? '' : '🔒 '}${def.name}  (${kind})`;
      const button = new Button(this, width / 2, y, label, () => this.openLevel(id), 380, 32);
      button.setEnabled(unlocked);
      y += 42;
    }
    new Button(this, width / 2 - 100, y + 20, 'Party / PC', () => this.openParty(), 160, 30);
    new Button(this, width / 2 + 100, y + 20, 'Sprite demo', () => this.scene.start('Phase0'), 160, 30);
    this.add.text(width / 2, this.scale.height - 20, 'Tip: ?level=<id> opens a level, ?party=debug loads the test party', TEXT_DIM).setOrigin(0.5);

    this.partyScreen = new PartyScreen(game, {
      portraitUrl: (s) => portraitUrl(s),
      onChange: () => undefined,
      onClose: () => this.scene.restart(),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.partyScreen?.close();
      this.starterRoot?.remove();
    });
    if (needsStarter()) this.askStarter();
  }

  private askStarter(): void {
    this.starterRoot?.remove();
    this.starterRoot = showStarterDialog(STARTERS, (s) => portraitUrl(s), (species) => {
      pickStarter(species);
      this.scene.restart();
    });
  }

  private openLevel(id: string): void {
    if (needsStarter()) {
      this.askStarter();
      return;
    }
    this.scene.start('Level', { levelId: id });
  }

  private openParty(): void {
    if (needsStarter()) {
      this.askStarter();
      return;
    }
    this.partyScreen?.show();
  }
}
