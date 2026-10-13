/** Save code export, import, and New Game. DOM overlay. */
import { ensureOverlayStyles, isolateFromGame } from './domOverlay';

export interface SavePanelHooks {
  getCode: () => string;
  importCode: (code: string) => string | null; // returns an error message or null
  newGame: () => void;
  onClose: () => void;
}

export class SavePanel {
  private root: HTMLDivElement | null = null;

  constructor(private readonly hooks: SavePanelHooks) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    ensureOverlayStyles();
    this.close();
    const root = document.createElement('div');
    root.className = 'ptd-panel ptd-modal';
    root.id = 'ptd-save';
    isolateFromGame(root);
    const close = document.createElement('button');
    close.className = 'ptd-close';
    close.textContent = 'x';
    close.addEventListener('click', () => this.close());
    const title = document.createElement('h2');
    title.textContent = 'Save';
    const info = document.createElement('div');
    info.className = 'ptd-dim';
    info.textContent = 'The game saves itself after every level and party change. Use a save code to move to another device.';
    root.append(close, title, info);

    const codeLabel = document.createElement('div');
    codeLabel.style.marginTop = '10px';
    codeLabel.textContent = 'Save code';
    const codeBox = document.createElement('textarea');
    codeBox.id = 'ptd-save-code';
    codeBox.readOnly = true;
    codeBox.style.cssText = 'width:100%;height:70px;font:11px monospace;box-sizing:border-box';
    codeBox.value = this.hooks.getCode();
    const copy = document.createElement('button');
    copy.textContent = 'Copy code';
    copy.addEventListener('click', async () => {
      codeBox.select();
      try {
        await navigator.clipboard.writeText(codeBox.value);
        copy.textContent = 'Copied';
      } catch {
        document.execCommand('copy');
        copy.textContent = 'Copied';
      }
    });
    root.append(codeLabel, codeBox, copy);

    const importLabel = document.createElement('div');
    importLabel.style.marginTop = '14px';
    importLabel.textContent = 'Import a save code';
    const importBox = document.createElement('textarea');
    importBox.id = 'ptd-import-code';
    importBox.placeholder = 'Paste a code starting with PTD1.';
    importBox.style.cssText = 'width:100%;height:60px;font:11px monospace;box-sizing:border-box';
    const importButton = document.createElement('button');
    importButton.textContent = 'Import (replaces the current save)';
    const status = document.createElement('div');
    status.id = 'ptd-import-status';
    status.className = 'ptd-dim';
    importButton.addEventListener('click', () => {
      const err = this.hooks.importCode(importBox.value);
      status.textContent = err ? `Rejected: ${err}` : 'Imported.';
      status.style.color = err ? '#ff8080' : '#9affc0';
    });
    root.append(importLabel, importBox, importButton, status);

    const danger = document.createElement('div');
    danger.style.marginTop = '18px';
    const newGame = document.createElement('button');
    newGame.id = 'ptd-new-game';
    newGame.textContent = 'New Game (wipes this save)';
    newGame.addEventListener('click', () => {
      if (window.confirm('Start a new game? Your party, box, items and progress will be deleted.')) {
        this.hooks.newGame();
        this.close();
      }
    });
    danger.appendChild(newGame);
    root.appendChild(danger);
    document.body.appendChild(root);
    this.root = root;
  }

  close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    this.hooks.onClose();
  }
}
