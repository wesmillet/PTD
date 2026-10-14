/**
 * Jubilife TV's Lottery Corner as a DOM panel: tickets, the challenge
 * ticket, and after a cleared challenge the three-ball draw with the reroll.
 */
import { getPokemon } from '../data/pokedata';
import { itemUrl, portraitUrl } from '../game/runtime';
import { capitalizeName } from '../sim/names';
import type { GameState } from '../sim/game';
import { challengeLevel, keepPrize, pickBall, playTicket, PRIZE_LEVEL, refundTicket, reroll, startDraw, type LotteryDraw } from '../sim/lottery';
import { Rng } from '../sim/rng';
import type { LevelDef } from '../sim/waves';
import { ensureOverlayStyles, isolateFromGame } from './domOverlay';

export interface LotteryHooks {
  game: GameState;
  onChange: () => void;
  onPlay: (def: LevelDef) => void;
  onClose: () => void;
}

export class LotteryScreen {
  private root: HTMLDivElement | null = null;
  private draw: LotteryDraw | null = null;

  constructor(private readonly hooks: LotteryHooks) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  private open(title: string): HTMLDivElement {
    ensureOverlayStyles();
    this.root?.remove();
    const root = document.createElement('div');
    root.className = 'ptd-panel ptd-modal';
    root.id = 'ptd-lottery';
    root.style.width = 'min(560px, calc(100vw - 24px))';
    isolateFromGame(root);
    const close = document.createElement('button');
    close.className = 'ptd-close';
    close.textContent = 'x';
    close.addEventListener('click', () => this.close(true));
    const h = document.createElement('h2');
    h.textContent = title;
    root.append(close, h);
    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  close(notify = false): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    if (notify) this.hooks.onClose();
  }

  show(): void {
    const game = this.hooks.game;
    if (game.lotteryPending === 'won') {
      game.lotteryPending = undefined;
      this.draw = startDraw(game, (Date.now() % 1_000_000) + (game.lotteryPlayed ?? 0) * 7);
      this.hooks.onChange();
      this.showDraw();
      return;
    }
    if (game.lotteryPending === 'lost') {
      game.lotteryPending = undefined;
      refundTicket(game);
      this.hooks.onChange();
    }
    const root = this.open('Lottery Corner');
    const tickets = game.tickets ?? 0;
    const info = document.createElement('div');
    info.className = 'ptd-dim';
    info.textContent = `You have ${tickets} ticket${tickets === 1 ? '' : 's'}. One comes free each day; the Conference gives more. A ticket is a challenge on a cleared route (Solo, Monotype, No catching, Level cap, Reverse or Speedrun); clear it and pick a ball: a shiny Pokémon at level ${PRIZE_LEVEL} in a Premier Ball, with one reroll${game.flags.includes('shiny-charm') ? ' (two with the Shiny Charm)' : ''}. Lose and the ticket is yours to keep.`;
    root.appendChild(info);
    const actions = document.createElement('div');
    actions.className = 'ptd-actions';
    const play = document.createElement('button');
    play.id = 'ptd-lottery-play';
    play.textContent = 'Play a ticket';
    play.disabled = tickets <= 0 || game.party.length === 0;
    play.addEventListener('click', () => {
      let challenge;
      try {
        const no = playTicket(game);
        challenge = challengeLevel(game, no * 7919 + (Date.now() % 100000));
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err));
        return;
      }
      const ok = window.confirm(`Ticket #${game.lotteryPlayed}: ${challenge.def.name}. Play it now?`);
      if (!ok) {
        refundTicket(game);
        game.lotteryPlayed = (game.lotteryPlayed ?? 1) - 1;
        return;
      }
      this.close(false);
      this.hooks.onPlay(challenge.def);
    });
    actions.appendChild(play);
    root.appendChild(actions);
  }

  private showDraw(): void {
    const draw = this.draw;
    if (!draw) return;
    const root = this.open(`Ticket #${draw.ticketNo}: pick a ball`);
    const row = document.createElement('div');
    row.className = 'ptd-actions';
    row.style.justifyContent = 'center';
    draw.balls.forEach((_, i) => {
      const b = document.createElement('button');
      b.className = 'ptd-lottery-ball';
      b.style.cssText = 'width:72px;height:72px;padding:0;background:transparent;border:none';
      const img = document.createElement('img');
      img.src = itemUrl('poke-ball');
      img.alt = `ball ${i + 1}`;
      img.style.cssText = 'width:48px;height:48px;image-rendering:pixelated;animation:ptd-wobble 0.6s ease-in-out infinite alternate';
      b.appendChild(img);
      b.addEventListener('click', () => {
        pickBall(draw, i);
        this.showResult();
      });
      row.appendChild(b);
    });
    root.appendChild(row);
    const note = document.createElement('div');
    note.className = 'ptd-dim';
    note.textContent = 'Three balls wobble on the counter. One of them is yours.';
    root.appendChild(note);
    this.ensureWobble();
  }

  private showResult(): void {
    const draw = this.draw;
    if (!draw || draw.picked === undefined) return;
    const species = draw.balls[draw.picked]!;
    const root = this.open(`Ticket #${draw.ticketNo}`);
    const card = document.createElement('div');
    card.style.cssText = 'display:flex;gap:12px;align-items:center';
    const portrait = document.createElement('img');
    portrait.className = 'ptd-portrait';
    portrait.alt = '';
    const url = portraitUrl(species, 'Normal', true) ?? portraitUrl(species);
    if (url) portrait.src = url;
    const text = document.createElement('div');
    text.innerHTML = `<b>★ Shiny ${capitalizeName(getPokemon(species).name)}</b><div class="ptd-dim">Level ${PRIZE_LEVEL} · neutral nature · Premier Ball · Lottery ticket #${draw.ticketNo}</div>${draw.previous !== undefined ? `<div class="ptd-dim">(replaced ${capitalizeName(getPokemon(draw.previous).name)})</div>` : ''}`;
    card.append(portrait, text);
    root.appendChild(card);
    const actions = document.createElement('div');
    actions.className = 'ptd-actions';
    const keep = document.createElement('button');
    keep.id = 'ptd-lottery-keep';
    keep.textContent = 'Keep it';
    keep.addEventListener('click', () => {
      const where = keepPrize(this.hooks.game, draw);
      this.draw = null;
      this.hooks.onChange();
      window.alert(`${capitalizeName(getPokemon(species).name)} joined your ${where === 'party' ? 'party' : 'PC'}!`);
      this.close(true);
    });
    actions.appendChild(keep);
    if (draw.rerollsLeft > 0) {
      const re = document.createElement('button');
      re.id = 'ptd-lottery-reroll';
      re.textContent = `Reroll (${draw.rerollsLeft} left)`;
      re.addEventListener('click', () => {
        reroll(draw, new Rng((Date.now() % 1_000_000) + draw.ticketNo));
        this.showResult();
      });
      actions.appendChild(re);
    }
    root.appendChild(actions);
  }

  private ensureWobble(): void {
    if (document.getElementById('ptd-wobble-style')) return;
    const style = document.createElement('style');
    style.id = 'ptd-wobble-style';
    style.textContent = '@keyframes ptd-wobble { from { transform: rotate(-12deg); } to { transform: rotate(12deg); } }';
    document.head.appendChild(style);
  }
}
