/**
 * Debug tuning panel: a DOM overlay toggled with the backtick key. Writes
 * straight into the shared runtime config, which the sim reads each step,
 * so changes apply without a rebuild. Ships in the build for now (Phase 8
 * strips it).
 */
import config from '../data/config.json';
import type { TimeOfDay } from '../data/pokedata';
import type { LevelState } from '../sim/level';
import { runtime, runtimeConfig } from '../game/runtime';
import { isolateFromGame } from './domOverlay';

export interface DebugPanelHooks {
  getState: () => LevelState;
  setPartyLevel: (level: number) => void;
  setTimeOfDay: (time: TimeOfDay) => void;
  reroll: () => void;
  /** Opens the in-game map editor (maps branch); see docs/maps.md. */
  openMapEditor?: () => void;
}

interface SliderDef {
  label: string;
  get: () => number;
  set: (v: number) => void;
  min: number;
  max: number;
  step: number;
}

const PANEL_ID = 'ptd-debug-panel';

export class DebugPanel {
  private readonly root: HTMLDivElement;
  private readonly refreshers: (() => void)[] = [];
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === '`' || e.code === 'Backquote') {
      e.preventDefault();
      this.toggle();
    }
  };

  constructor(private readonly hooks: DebugPanelHooks) {
    document.getElementById(PANEL_ID)?.remove();
    this.root = document.createElement('div');
    this.root.id = PANEL_ID;
    this.root.style.cssText = [
      'position:fixed', 'right:8px', 'top:100px', 'width:280px', 'max-height:calc(100vh - 110px)', 'overflow:auto',
      'background:rgba(16,16,28,0.94)', 'color:#e8e8f0', 'font:12px monospace', 'padding:10px', 'border:1px solid #5a5a80',
      'border-radius:4px', 'z-index:10', 'display:none',
    ].join(';');
    this.build();
    isolateFromGame(this.root);
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.onKey);
  }

  toggle(): void {
    const show = this.root.style.display === 'none';
    this.root.style.display = show ? 'block' : 'none';
    if (show) this.refresh();
  }

  refresh(): void {
    for (const r of this.refreshers) r();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }

  private build(): void {
    const speed = runtimeConfig.speed;
    const sliders: SliderDef[] = [
      { label: 'speedBase (enemy tiles/s)', get: () => speed.speedBase, set: (v) => (speed.speedBase = v), min: 0, max: 3, step: 0.05 },
      { label: 'speedScale (per Speed pt)', get: () => speed.speedScale, set: (v) => (speed.speedScale = v), min: 0, max: 0.05, step: 0.001 },
      { label: 'enemyClampMin', get: () => speed.enemyClampMin, set: (v) => (speed.enemyClampMin = v), min: 0.1, max: 2, step: 0.05 },
      { label: 'enemyClampMax', get: () => speed.enemyClampMax, set: (v) => (speed.enemyClampMax = v), min: 0.5, max: 6, step: 0.1 },
      { label: 'speedRef (attack rate)', get: () => speed.speedRef, set: (v) => (speed.speedRef = v), min: 10, max: 200, step: 1 },
      { label: 'clampMin (attack rate)', get: () => speed.clampMin, set: (v) => (speed.clampMin = v), min: 0.1, max: 1, step: 0.05 },
      { label: 'clampMax (attack rate)', get: () => speed.clampMax, set: (v) => (speed.clampMax = v), min: 1, max: 5, step: 0.1 },
      { label: 'moveRate (attacks/s at ref)', get: () => speed.moveRate, set: (v) => (speed.moveRate = v), min: 0.1, max: 5, step: 0.1 },
    ];

    this.root.appendChild(this.heading('Debug panel (` to hide)'));
    const status = document.createElement('div');
    status.style.cssText = 'color:#9a9ab0;margin-bottom:8px';
    this.root.appendChild(status);
    this.refreshers.push(() => {
      const s = this.hooks.getState();
      const mon = s.party[0]?.mon;
      status.textContent = `seed ${s.seed}  phase ${s.phase}  wave ${s.wave}  ${mon ? `${mon.name} Lv${mon.level} spe ${mon.stats.spe}` : ''}`;
    });

    for (const def of sliders) this.root.appendChild(this.slider(def));

    this.root.appendChild(this.heading('Party'));
    this.root.appendChild(
      this.numberInput('Turtwig level', 1, 100, () => this.hooks.getState().party[0]?.mon.level ?? 1, (v) => this.hooks.setPartyLevel(v)),
    );

    this.root.appendChild(this.heading('Enemies'));
    this.root.appendChild(
      this.numberInput(
        'Enemy level override (0 = off)',
        0,
        100,
        () => runtimeConfig.enemyLevelOverride ?? 0,
        (v) => {
          if (v > 0) runtimeConfig.enemyLevelOverride = v;
          else delete runtimeConfig.enemyLevelOverride;
        },
      ),
    );
    this.root.appendChild(
      this.numberInput(
        'Shiny 1-in-N (1 = always)',
        1,
        1000000,
        () => Math.round(1 / Math.max(1e-9, runtimeConfig.shinyRate)),
        (v) => (runtimeConfig.shinyRate = 1 / v),
      ),
    );
    const timeRow = document.createElement('div');
    timeRow.style.marginTop = '6px';
    const timeLabel = document.createElement('span');
    timeLabel.textContent = 'Time of day (next wave) ';
    const select = document.createElement('select');
    for (const t of ['morning', 'day', 'night'] as TimeOfDay[]) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => this.hooks.setTimeOfDay(select.value as TimeOfDay));
    this.refreshers.push(() => (select.value = this.hooks.getState().time));
    timeRow.append(timeLabel, select);
    this.root.appendChild(timeRow);

    const buttons = document.createElement('div');
    buttons.style.marginTop = '10px';
    buttons.appendChild(this.button('Reroll seed (restart)', () => this.hooks.reroll()));
    buttons.appendChild(
      this.button('Reset constants', () => {
        Object.assign(runtimeConfig.speed, config.speed);
        Object.assign(runtimeConfig.status, config.status);
        runtimeConfig.shinyRate = config.shinyRate;
        delete runtimeConfig.enemyLevelOverride;
        this.refresh();
      }),
    );
    if (this.hooks.openMapEditor) {
      buttons.appendChild(
        this.button('Map editor', () => {
          this.hooks.openMapEditor?.();
          this.toggle();
        }),
      );
    }
    this.root.appendChild(buttons);
    const note = document.createElement('div');
    note.style.cssText = 'color:#9a9ab0;margin-top:8px';
    note.textContent = 'Speed constants apply to new spawns (movement) and the next attack (rate). Level override applies to the next wave.';
    this.root.appendChild(note);
    this.refreshers.push(() => {
      runtime.partyLevelOverride = this.hooks.getState().party[0]?.mon.level;
    });
  }

  private heading(text: string): HTMLElement {
    const h = document.createElement('div');
    h.textContent = text;
    h.style.cssText = 'font-weight:bold;margin:8px 0 4px;color:#ffffff';
    return h;
  }

  private slider(def: SliderDef): HTMLElement {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin-bottom:4px';
    const text = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(def.min);
    input.max = String(def.max);
    input.step = String(def.step);
    input.style.width = '100%';
    const update = () => {
      text.textContent = `${def.label}: ${Number(def.get().toFixed(3))}`;
      input.value = String(def.get());
    };
    input.addEventListener('input', () => {
      def.set(Number(input.value));
      update();
    });
    this.refreshers.push(update);
    update();
    row.append(text, input);
    return row;
  }

  private numberInput(label: string, min: number, max: number, get: () => number, set: (v: number) => void): HTMLElement {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin-bottom:4px';
    const text = document.createElement('span');
    text.textContent = `${label} `;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.style.cssText = 'width:60px;font:12px monospace';
    input.addEventListener('change', () => {
      const v = Math.max(min, Math.min(max, Math.round(Number(input.value) || 0)));
      input.value = String(v);
      set(v);
      this.refresh();
    });
    this.refreshers.push(() => (input.value = String(get())));
    row.append(text, input);
    return row;
  }

  private button(label: string, onClick: () => void): HTMLElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:12px monospace;margin-right:6px;margin-bottom:4px;cursor:pointer';
    b.addEventListener('click', onClick);
    return b;
  }
}
