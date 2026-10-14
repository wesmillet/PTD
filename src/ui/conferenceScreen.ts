/**
 * The Conference's DOM screens: the bracket board (sixteen names with their
 * trainer sprites, winners marked), the field roulette and the locker room
 * (heal, PC, vendor, next match). One page is open at a time.
 */
import { trainerArtId } from '../data/trainers';
import { assetUrl } from '../game/runtime';
import { entrantName, FLOORS, PLAYER, playerMatch, ROUNDS, rosterEntry, VENDOR, type ConferenceRun } from '../sim/conference';
import type { GameState } from '../sim/game';
import { ensureOverlayStyles, isolateFromGame } from './domOverlay';

export interface ConferenceHooks {
  game: GameState;
  playerName: string;
  onBegin: () => void;
  onNextMatch: () => void;
  onHeal: () => void;
  onPc: () => void;
  onBuy: (item: string) => string | null;
  onLeave: () => void;
  onNewRun: (champions: boolean) => void;
}

export class ConferenceScreen {
  private root: HTMLDivElement | null = null;

  constructor(private readonly hooks: ConferenceHooks) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  private open(title: string, id: string): HTMLDivElement {
    ensureOverlayStyles();
    this.close();
    const root = document.createElement('div');
    root.className = 'ptd-panel ptd-modal';
    root.id = `ptd-conf-${id}`;
    root.style.width = 'min(760px, calc(100vw - 24px))';
    root.style.maxHeight = 'calc(100vh - 24px)';
    root.style.overflow = 'auto';
    isolateFromGame(root);
    const h = document.createElement('h2');
    h.textContent = title;
    root.appendChild(h);
    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  close(): void {
    this.root?.remove();
    this.root = null;
  }

  private trainerImg(id: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:40px;height:40px;overflow:hidden;flex:none';
    const img = document.createElement('img');
    img.alt = '';
    img.style.cssText = 'width:80px;height:80px;image-rendering:pixelated;margin:-6px 0 0 -20px';
    const entry = rosterEntry(id);
    if (id === PLAYER) img.src = assetUrl('assets/trainers/player-male.png');
    else if (entry?.silhouette) {
      img.src = assetUrl('assets/trainers/ace-trainer-male.png');
      img.style.filter = 'brightness(0.08)';
    } else img.src = assetUrl(`assets/trainers/${trainerArtId(id)}.png`);
    wrap.appendChild(img);
    return wrap;
  }

  /** The bracket board: four columns of matches, winners in bold, the player highlighted. */
  bracket(run: ConferenceRun, mode: 'draw' | 'board' | 'result'): void {
    const root = this.open(mode === 'result' ? (run.result === 'won' ? 'Sinnoh Conference Champion!' : 'Out of the Conference') : 'Lily of the Valley Conference', 'bracket');
    const columns = document.createElement('div');
    columns.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;align-items:start';
    ROUNDS.forEach((r, ri) => {
      const col = document.createElement('div');
      const head = document.createElement('div');
      head.className = 'ptd-heading';
      head.textContent = r.name;
      col.appendChild(head);
      const matches = run.rounds[ri] ?? [];
      const count = 8 >> ri;
      for (let i = 0; i < count; i++) {
        const m = matches[i];
        const box = document.createElement('div');
        box.className = 'ptd-card';
        box.style.cssText = 'margin:4px 0;padding:4px;font-size:12px';
        for (const side of ['a', 'b'] as const) {
          const id = m?.[side];
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:4px;min-height:22px';
          if (id) {
            if (ri === 0 || mode !== 'draw') row.appendChild(this.trainerImg(id));
            const name = document.createElement('span');
            name.textContent = entrantName(id, this.hooks.playerName);
            if (m?.winner === id) name.style.fontWeight = 'bold';
            if (id === PLAYER) name.style.color = '#3878e0';
            if (m?.winner && m.winner !== id) name.style.opacity = '0.45';
            row.appendChild(name);
          } else {
            row.textContent = '…';
            row.style.opacity = '0.4';
          }
          box.appendChild(row);
        }
        col.appendChild(box);
      }
      columns.appendChild(col);
    });
    root.appendChild(columns);
    const actions = document.createElement('div');
    actions.className = 'ptd-actions';
    if (mode === 'draw') {
      const note = document.createElement('div');
      note.className = 'ptd-dim';
      note.textContent = `Sixteen entrants, drawn fresh. ${run.champions ? "Champion's bracket: Elite tier and above." : 'The four strongest are spread one per quarter.'} Your first match: ${entrantName(nextOpponentId(run), this.hooks.playerName)}.`;
      root.appendChild(note);
      const begin = document.createElement('button');
      begin.id = 'ptd-conf-begin';
      begin.textContent = 'Begin';
      begin.addEventListener('click', () => this.hooks.onBegin());
      actions.appendChild(begin);
    } else if (mode === 'result') {
      const leave = document.createElement('button');
      leave.textContent = 'Leave';
      leave.addEventListener('click', () => this.hooks.onLeave());
      actions.appendChild(leave);
    } else {
      const back = document.createElement('button');
      back.textContent = 'Locker room';
      back.addEventListener('click', () => this.locker(run));
      actions.appendChild(back);
    }
    const quit = document.createElement('button');
    quit.textContent = mode === 'result' ? 'Level select' : 'Leave (forfeit)';
    quit.addEventListener('click', () => this.hooks.onLeave());
    actions.appendChild(quit);
    root.appendChild(actions);
  }

  /** The field roulette: four fields, the drawn one lit. */
  roulette(floor: string, onDone: () => void): void {
    const root = this.open('Field roulette', 'roulette');
    const row = document.createElement('div');
    row.className = 'ptd-actions';
    const cards: HTMLElement[] = [];
    for (const [id, f] of Object.entries(FLOORS)) {
      const card = document.createElement('div');
      card.className = 'ptd-card';
      card.style.cssText = 'padding:8px 12px;opacity:0.5;min-width:120px;text-align:center';
      card.innerHTML = `<b>${f.name}</b><div class="ptd-dim">${f.rule}</div>`;
      card.dataset.floor = id;
      row.appendChild(card);
      cards.push(card);
    }
    root.appendChild(row);
    const note = document.createElement('div');
    note.className = 'ptd-dim';
    note.textContent = 'The wheel spins…';
    root.appendChild(note);
    const ids = Object.keys(FLOORS);
    let i = 0;
    let ticks = 0;
    const target = ids.indexOf(floor);
    const spin = () => {
      cards.forEach((c) => (c.style.opacity = '0.5'));
      cards[i % cards.length]!.style.opacity = '1';
      ticks++;
      if (ticks > 14 && i % cards.length === target) {
        note.textContent = `${FLOORS[floor]?.name ?? floor}! ${FLOORS[floor]?.rule ?? ''}`;
        const go = document.createElement('button');
        go.id = 'ptd-conf-go';
        go.textContent = 'To the field';
        go.addEventListener('click', onDone);
        root.appendChild(go);
        return;
      }
      i++;
      window.setTimeout(spin, 90 + ticks * 12);
    };
    spin();
  }

  /** The locker room between rounds. */
  locker(run: ConferenceRun): void {
    const root = this.open('Locker room', 'locker');
    const game = this.hooks.game;
    const m = playerMatch(run);
    const opponent = m ? (m.a === PLAYER ? m.b : m.a) : undefined;
    const info = document.createElement('div');
    info.className = 'ptd-dim';
    info.textContent = opponent ? `${ROUNDS[run.round]?.name ?? 'Next'}: ${entrantName(opponent, this.hooks.playerName)} (${ROUNDS[run.round]?.pokemon ?? 3} Pokémon). Money $${game.money}.` : 'The run is over.';
    root.appendChild(info);
    const list = document.createElement('ul');
    list.className = 'ptd-moves';
    for (const mon of game.party) {
      const li = document.createElement('li');
      li.className = 'ptd-move';
      li.style.cursor = 'default';
      li.textContent = `${mon.name.charAt(0).toUpperCase()}${mon.name.slice(1)}  Lv ${mon.level}  HP ${mon.hp}/${mon.stats.hp}`;
      list.appendChild(li);
    }
    root.appendChild(list);
    const actions = document.createElement('div');
    actions.className = 'ptd-actions';
    const heal = document.createElement('button');
    heal.textContent = 'Heal party';
    heal.addEventListener('click', () => {
      this.hooks.onHeal();
      this.locker(run);
    });
    const pc = document.createElement('button');
    pc.textContent = 'PC';
    pc.addEventListener('click', () => this.hooks.onPc());
    const board = document.createElement('button');
    board.textContent = 'Bracket board';
    board.addEventListener('click', () => this.bracket(run, 'board'));
    actions.append(heal, pc, board);
    root.appendChild(actions);
    const vendorHead = document.createElement('div');
    vendorHead.className = 'ptd-heading';
    vendorHead.textContent = 'Vendor';
    root.appendChild(vendorHead);
    const vendor = document.createElement('div');
    vendor.className = 'ptd-actions';
    for (const [item, v] of Object.entries(VENDOR)) {
      const b = document.createElement('button');
      const left = run.vendor[item] ?? 0;
      b.textContent = `${item === 'potion' ? 'Hyper Potion' : 'Ultra Ball'} $${v.price} (${left} left)`;
      b.disabled = left <= 0;
      b.addEventListener('click', () => {
        const err = this.hooks.onBuy(item);
        if (err) window.alert(err);
        this.locker(run);
      });
      vendor.appendChild(b);
    }
    root.appendChild(vendor);
    const go = document.createElement('div');
    go.className = 'ptd-actions';
    const next = document.createElement('button');
    next.id = 'ptd-conf-next';
    next.textContent = opponent ? 'Next match' : 'Results';
    next.addEventListener('click', () => this.hooks.onNextMatch());
    const leave = document.createElement('button');
    leave.textContent = 'Leave (forfeit)';
    leave.addEventListener('click', () => this.hooks.onLeave());
    go.append(next, leave);
    root.appendChild(go);
  }

  /** The entry screen: start a run (or the Champion's bracket). */
  entry(champions: boolean): void {
    const root = this.open('Lily of the Valley Conference', 'entry');
    const note = document.createElement('div');
    note.className = 'ptd-dim';
    note.textContent = 'Sixteen trainers, four rounds, one champion. Lose and the run ends; EXP and catches stay. The bracket is drawn fresh every time.';
    root.appendChild(note);
    const actions = document.createElement('div');
    actions.className = 'ptd-actions';
    const start = document.createElement('button');
    start.id = 'ptd-conf-start';
    start.textContent = 'Enter';
    start.addEventListener('click', () => this.hooks.onNewRun(false));
    actions.appendChild(start);
    if (champions) {
      const c = document.createElement('button');
      c.textContent = "Champion's bracket";
      c.addEventListener('click', () => this.hooks.onNewRun(true));
      actions.appendChild(c);
    }
    const leave = document.createElement('button');
    leave.textContent = 'Back';
    leave.addEventListener('click', () => this.hooks.onLeave());
    actions.appendChild(leave);
    root.appendChild(actions);
  }
}

function nextOpponentId(run: ConferenceRun): string {
  const m = playerMatch(run);
  return m ? (m.a === PLAYER ? m.b : m.a) : '';
}
