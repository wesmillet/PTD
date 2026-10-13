import Phaser from 'phaser';
import { getLevel } from '../data/levels';
import { iconUrl, portraitUrl } from '../game/runtime';
import {
  currentSaveCode,
  getGame,
  importSaveCode,
  loadDebugPartyIfRequested,
  needsStarter,
  pickStarter,
  resetGame,
  saveGame,
  STARTERS,
} from '../game/session';
import { isLevelCompleted, isLevelUnlocked, orderedLevelIds } from '../sim/game';
import { Button } from '../ui/button';
import { PartyScreen } from '../ui/partyScreen';
import { SavePanel } from '../ui/savePanel';
import { ShopScreen } from '../ui/shopScreen';
import { CreditsScreen } from '../ui/creditsScreen';
import { showStarterDialog } from '../ui/starterDialog';
import { TEXT_BIG, TEXT_DIM } from '../ui/styles';

/** Level list with the unlock chain, plus the Party / PC, Shop and Save screens. */
export class LevelSelectScene extends Phaser.Scene {
  private partyScreen?: PartyScreen;
  private shop?: ShopScreen;
  private savePanel?: SavePanel;
  private credits?: CreditsScreen;
  private starterRoot?: HTMLDivElement;

  constructor() {
    super('LevelSelect');
  }

  create(): void {
    loadDebugPartyIfRequested();
    const game = getGame();
    const { width } = this.scale;
    this.add.text(width / 2, 40, 'Sinnoh Tower Defense', TEXT_BIG).setOrigin(0.5);
    const partyText = game.party.length ? `Party: ${game.party.map((m) => `${m.name} L${m.level}`).join(', ')}` : 'No Pokémon yet';
    this.add.text(width / 2, 68, partyText, TEXT_DIM).setOrigin(0.5);
    this.add.text(width / 2, 86, `$${game.money}   Balls ${Object.values(game.items.balls).reduce((a, b) => a + b, 0)}   Potions ${game.items.potions}   Rare Candy ${game.items.rareCandies}`, TEXT_DIM).setOrigin(0.5);

    let y = 124;
    for (const id of orderedLevelIds()) {
      const def = getLevel(id);
      const unlocked = isLevelUnlocked(game, id);
      const done = isLevelCompleted(game, id);
      const kind = def.objective === 'free' ? 'free roam' : `defend, ${def.waves} waves`;
      const label = `${done ? '✓ ' : unlocked ? '' : '🔒 '}${def.name}  (${kind})`;
      const button = new Button(this, width / 2, y, label, () => this.openLevel(id), 380, 32);
      button.setEnabled(unlocked);
      y += 40;
    }
    const row = y + 16;
    new Button(this, width / 2 - 170, row, 'Party / PC', () => this.guard(() => this.partyScreen?.show()), 150, 30);
    new Button(this, width / 2, row, 'Shop', () => this.guard(() => this.shop?.show()), 150, 30);
    new Button(this, width / 2 + 170, row, 'Save', () => this.savePanel?.show(), 150, 30);
    new Button(this, width / 2 - 85, row + 38, 'Credits', () => this.credits?.show(), 150, 26);
    new Button(this, width / 2 + 85, row + 38, 'Sprite demo', () => this.scene.start('Phase0'), 150, 26);
    this.add.text(width / 2, this.scale.height - 16, 'Tip: ?level=<id> opens a level, ?party=debug loads the test party', TEXT_DIM).setOrigin(0.5);

    const refresh = () => {
      saveGame();
      this.scene.restart();
    };
    this.partyScreen = new PartyScreen(game, { portraitUrl: (s) => portraitUrl(s), iconUrl: (s) => iconUrl(s), onChange: () => saveGame(), onClose: refresh });
    this.shop = new ShopScreen(game, { onChange: () => saveGame(), onClose: refresh });
    this.credits = new CreditsScreen(() => undefined);
    this.savePanel = new SavePanel({
      getCode: () => currentSaveCode(),
      importCode: (code) => importSaveCode(code),
      newGame: () => {
        resetGame();
        this.scene.restart();
      },
      onClose: () => this.scene.restart(),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.partyScreen?.close();
      this.shop?.close();
      this.savePanel?.close();
      this.credits?.close();
      this.starterRoot?.remove();
      this.partyScreen = undefined;
      this.shop = undefined;
      this.savePanel = undefined;
    });
    if (needsStarter()) this.askStarter();
  }

  private guard(open: () => void): void {
    if (needsStarter()) this.askStarter();
    else open();
  }

  private askStarter(): void {
    this.starterRoot?.remove();
    this.starterRoot = showStarterDialog(STARTERS, (s) => iconUrl(s), (species) => {
      pickStarter(species);
      this.scene.restart();
    });
  }

  private openLevel(id: string): void {
    this.guard(() => this.scene.start('Level', { levelId: id }));
  }
}
