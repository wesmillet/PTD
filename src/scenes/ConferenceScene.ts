import Phaser from 'phaser';
import { addOptionsButton, optionsPages } from '../ui/optionsButton';
import { getGame, loadDebugPartyIfRequested, saveGame } from '../game/session';
import { applyConferenceResult, buyFromVendor, drawBracket, healParty, nextOpponent, roundLevel, spinFloor, type ConferenceRun } from '../sim/conference';
import { hasFlag } from '../sim/game';
import { Rng } from '../sim/rng';
import { ConferenceScreen } from '../ui/conferenceScreen';
import { COLORS, TEXT_DIM, TEXT_TITLE } from '../ui/styles';

const PLAYER_NAME = 'Trainer';

/**
 * The Sinnoh Conference flow: entry, the draw, the roulette, each round as
 * a runtime level in LevelScene, the locker room between rounds, the
 * result and the rewards. The run lives in the save (game.conference).
 */
export class ConferenceScene extends Phaser.Scene {
  private screen?: ConferenceScreen;

  constructor() {
    super('Conference');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.add.text(width / 2, 40, 'Lily of the Valley Conference', TEXT_TITLE).setOrigin(0.5);
    this.add.text(width / 2, height - 20, 'Lily of the Valley Island', TEXT_DIM).setOrigin(0.5);
    loadDebugPartyIfRequested();
    const game = getGame();
    addOptionsButton(this, optionsPages(game));
    this.screen = new ConferenceScreen({
      game,
      playerName: PLAYER_NAME,
      onBegin: () => this.toRoulette(),
      onNextMatch: () => this.nextMatch(),
      onHeal: () => {
        healParty(game);
        saveGame();
      },
      onPc: () => this.scene.start('PC', { backTo: 'Conference' }),
      onBuy: (item) => {
        const run = this.run();
        const err = run ? buyFromVendor(game, run, item) : 'no run';
        saveGame();
        return err;
      },
      onLeave: () => this.leave(),
      onNewRun: (champions) => this.newRun(champions),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.screen?.close();
      this.screen = undefined;
    });
    this.route();
  }

  private run(): ConferenceRun | undefined {
    return getGame().conference as ConferenceRun | undefined;
  }

  /** Where the run stands decides which screen opens. */
  private route(): void {
    const run = this.run();
    if (!run) {
      this.screen?.entry(hasFlag(getGame(), 'champions-bracket'));
      return;
    }
    if (run.result) {
      this.finish(run);
      return;
    }
    if (run.round === 0 && run.floors.length === 0) this.screen?.bracket(run, 'draw');
    else this.screen?.locker(run);
  }

  private newRun(champions: boolean): void {
    const game = getGame();
    if (game.party.length === 0) {
      window.alert('You need a party to enter.');
      return;
    }
    const run = drawBracket((Date.now() % 1_000_000) + 1, { champions });
    game.conference = run;
    saveGame();
    this.screen?.bracket(run, 'draw');
  }

  private toRoulette(): void {
    const run = this.run();
    if (!run) return;
    const floor = spinFloor(run);
    saveGame();
    this.screen?.roulette(floor, () => this.startRound(run, floor));
  }

  private nextMatch(): void {
    const run = this.run();
    if (!run) return;
    if (run.result) {
      this.finish(run);
      return;
    }
    this.toRoulette();
  }

  private startRound(run: ConferenceRun, floor: string): void {
    const opponent = nextOpponent(run);
    if (!opponent) return;
    const def = roundLevel(run, opponent, floor);
    this.scene.start('Level', { levelId: 'conference', def, returnTo: 'Conference', mode: 'conference', seed: run.seed + run.round });
  }

  private finish(run: ConferenceRun): void {
    const game = getGame();
    const lines = applyConferenceResult(game, run, new Rng(run.seed + 99));
    game.conference = undefined;
    saveGame();
    this.screen?.bracket(run, 'result');
    if (lines.length) window.setTimeout(() => window.alert(lines.join('\n')), 50);
  }

  private leave(): void {
    const run = this.run();
    if (run && !run.result && !window.confirm('Leave the Conference? The run is forfeited.')) return;
    if (run && !run.result) {
      getGame().conference = undefined;
      saveGame();
    }
    this.scene.start('LevelSelect');
  }
}
