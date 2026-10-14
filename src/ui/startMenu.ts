import Phaser from 'phaser';
import { framePanel } from './button';
import { COLORS, TEXT } from './styles';

export type StartMenuId = 'pokedex' | 'party' | 'bag' | 'card' | 'save' | 'options' | 'exit' | 'leave';

export interface StartMenuEntry {
  id: StartMenuId;
  label: string;
  icon: string;
}

export interface StartMenuHooks {
  onSelect: (id: StartMenuId) => void;
  /** Called when the menu closes by Exit, Esc or a click outside. */
  onClose: () => void;
}

/** The Platinum start menu entries, in the games' order; the trainer-card entry carries the player's name. */
export function startMenuEntries(playerName: string): StartMenuEntry[] {
  return [
    { id: 'pokedex', label: 'Pokédex', icon: 'ui-menu-pokedex' },
    { id: 'party', label: 'Pokémon', icon: 'ui-menu-party' },
    { id: 'bag', label: 'Bag', icon: 'ui-menu-bag' },
    { id: 'card', label: playerName, icon: 'ui-menu-card' },
    { id: 'save', label: 'Save', icon: 'ui-menu-save' },
    { id: 'options', label: 'Options', icon: 'ui-menu-options' },
    { id: 'exit', label: 'Exit', icon: 'ui-menu-exit' },
    { id: 'leave', label: 'Leave level', icon: 'ui-menu-flag' },
  ];
}

/**
 * Platinum's start menu: a column of framed entries with the start-menu icons
 * on the right of the screen and a red arrow cursor. Up / Down / Enter / Esc
 * and the mouse both work. Canvas; the scene pauses while it is open.
 */
export class StartMenu {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly cursor: Phaser.GameObjects.Graphics;
  private readonly rows: { y: number; hit: Phaser.GameObjects.Rectangle; entry: StartMenuEntry }[] = [];
  private index = 0;
  private open = false;
  /** While a page is open the menu stays visible but ignores input. */
  private locked = false;
  private openedAt = 0;
  private readonly keyHandler = (e: KeyboardEvent) => {
    if (!this.open || this.locked) return;
    // The keypress that opened the menu is still being dispatched when this listener is added.
    if (performance.now() - this.openedAt < 80) return;
    if (e.key === 'ArrowDown' || e.key === 's') this.move(1);
    else if (e.key === 'ArrowUp' || e.key === 'w') this.move(-1);
    else if (e.key === 'Enter' || e.key === 'z' || e.key === ' ') this.select();
    else if (e.key === 'Escape' || e.key === 'x') this.close();
    else return;
    e.preventDefault();
  };

  static readonly ROW_H = 40;
  static readonly WIDTH = 176;

  constructor(scene: Phaser.Scene, entries: StartMenuEntry[], private readonly hooks: StartMenuHooks) {
    this.scene = scene;
    const { width, height } = scene.scale;
    this.container = scene.add.container(0, 0).setDepth(2600).setVisible(false);
    const shade = scene.add.rectangle(0, 0, width, height, 0x000000, 0.25).setOrigin(0).setInteractive();
    shade.on('pointerdown', () => {
      if (!this.locked) this.close();
    });
    this.container.add(shade);
    const x = width - StartMenu.WIDTH / 2 - 12;
    const top = Math.max(12, (height - entries.length * StartMenu.ROW_H) / 2 - 40);
    entries.forEach((entry, i) => {
      const y = top + i * StartMenu.ROW_H + StartMenu.ROW_H / 2;
      const panel = framePanel(scene, x, y, StartMenu.WIDTH, StartMenu.ROW_H - 4, 'blue');
      const icon = scene.textures.exists(entry.icon) ? scene.add.image(x - StartMenu.WIDTH / 2 + 30, y, entry.icon) : undefined;
      const label = scene.add.text(x - StartMenu.WIDTH / 2 + 50, y, entry.label, TEXT).setOrigin(0, 0.5);
      const hit = scene.add.rectangle(x, y, StartMenu.WIDTH, StartMenu.ROW_H, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        if (!this.locked) this.setIndex(i);
      });
      hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (this.locked) return;
        this.setIndex(i);
        this.select();
      });
      this.container.add(panel);
      if (icon) this.container.add(icon);
      this.container.add([label, hit]);
      this.rows.push({ y, hit, entry });
    });
    this.cursor = scene.add.graphics();
    this.container.add(this.cursor);
    this.setIndex(0);
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.locked = false;
    this.openedAt = performance.now();
    this.container.setVisible(true);
    this.scene.input.keyboard?.on('keydown', this.keyHandler);
    this.setIndex(this.index);
  }

  /** Stops menu input while a page is open (the column stays visible behind it). */
  setLocked(locked: boolean): void {
    this.locked = locked;
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.container.setVisible(false);
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.hooks.onClose();
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    this.container.destroy();
  }

  private move(delta: number): void {
    this.setIndex((this.index + delta + this.rows.length) % this.rows.length);
  }

  private setIndex(i: number): void {
    this.index = i;
    const row = this.rows[i];
    if (!row) return;
    const x = this.scene.scale.width - StartMenu.WIDTH - 12 - 10;
    // Red arrow cursor pointing at the selected row.
    this.cursor.clear();
    this.cursor.fillStyle(0x283028, 1).fillTriangle(x - 1, row.y - 8, x - 1, row.y + 8, x + 11, row.y);
    this.cursor.fillStyle(COLORS.selected, 1).fillTriangle(x, row.y - 6, x, row.y + 6, x + 9, row.y);
  }

  private select(): void {
    const row = this.rows[this.index];
    if (!row) return;
    if (row.entry.id === 'exit') {
      this.close();
      return;
    }
    this.hooks.onSelect(row.entry.id);
  }
}
