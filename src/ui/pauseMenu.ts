/**
 * In-level pause menu: Resume, Settings (game speed) and Exit level. DOM
 * modal; the scene pauses the simulation while it is open.
 */
import config from '../data/config.json';
import { ensureOverlayStyles, isolateFromGame } from './domOverlay';

export interface PauseMenuHooks {
  levelName: string;
  /** Free levels: leaving keeps everything and shows the summary. */
  free: boolean;
  getSpeed: () => number;
  setSpeed: (speed: number) => void;
  onResume: () => void;
  onExit: () => void;
}

export class PauseMenu {
  private root: HTMLDivElement | null = null;
  private settingsOpen = false;

  constructor(private readonly hooks: PauseMenuHooks) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    ensureOverlayStyles();
    this.close();
    const root = document.createElement('div');
    root.className = 'ptd-panel ptd-modal';
    root.id = 'ptd-pause';
    root.style.width = 'min(360px, calc(100vw - 24px))';
    isolateFromGame(root);
    document.body.appendChild(root);
    this.root = root;
    this.render();
  }

  close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
  }

  private button(label: string, onClick: () => void, id?: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'display:block;width:100%;margin:6px 0;text-align:left';
    if (id) b.id = id;
    b.addEventListener('click', onClick);
    return b;
  }

  private render(): void {
    const root = this.root;
    if (!root) return;
    root.innerHTML = '';
    const title = document.createElement('h2');
    title.textContent = 'Paused';
    const sub = document.createElement('div');
    sub.className = 'ptd-dim';
    sub.textContent = this.hooks.levelName;
    root.append(title, sub);
    root.appendChild(this.button('Resume', () => {
      this.close();
      this.hooks.onResume();
    }, 'ptd-pause-resume'));
    root.appendChild(this.button(this.settingsOpen ? 'Settings ▾' : 'Settings ▸', () => {
      this.settingsOpen = !this.settingsOpen;
      this.render();
    }, 'ptd-pause-settings'));
    if (this.settingsOpen) {
      const box = document.createElement('div');
      box.style.cssText = 'margin:4px 0 10px 12px';
      const label = document.createElement('div');
      label.className = 'ptd-label';
      label.textContent = 'Game speed';
      const row = document.createElement('div');
      row.className = 'ptd-actions';
      for (const speed of config.gameSpeeds as number[]) {
        const b = document.createElement('button');
        b.textContent = `${speed}x`;
        b.className = speed === this.hooks.getSpeed() ? 'ptd-active' : '';
        b.style.opacity = speed === this.hooks.getSpeed() ? '1' : '0.6';
        b.addEventListener('click', () => {
          this.hooks.setSpeed(speed);
          this.render();
        });
        row.appendChild(b);
      }
      const note = document.createElement('div');
      note.className = 'ptd-dim';
      note.textContent = 'Higher speeds run more simulation steps per frame; the outcome is the same. Volume and accessibility settings come with the polish phase.';
      box.append(label, row, note);
      root.appendChild(box);
    }
    root.appendChild(this.button(this.hooks.free ? 'Leave route (keep everything)' : 'Exit level', () => {
      const message = this.hooks.free
        ? 'Leave the route now? EXP and caught Pokémon are kept.'
        : 'Exit this level? Progress on it is lost; caught Pokémon are kept.';
      if (!window.confirm(message)) return;
      this.close();
      this.hooks.onExit();
    }, 'ptd-pause-exit'));
  }
}
