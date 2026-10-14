import Phaser from 'phaser';
import spriteIndex from '../data/spriteIndex.json';
import { ALL_DIRECTIONS, DIRECTION_NAMES, Direction, directionFromVector } from '../assets/direction';
import { createPmdSprite, playAnim, queuePokemon, registerAnims, syncShadow } from '../assets/pmdLoader';

const PRIMARY = 'turtwig';
const ROW_ACTIONS = ['Idle', 'Walk'] as const;
const SCALES = [1, 2, 3, 4] as const;
const TEXT_STYLE = { fontFamily: '"Power Clear", monospace', fontSize: '13px', color: '#484848', resolution: 1 };

/**
 * Phase 0 acceptance scene: one Pokémon playing Idle and Walk in all 8
 * directions at once, plus a walker that picks its facing from its velocity.
 *
 * Keys: Space swaps the Idle/Walk rows, + and - change scale,
 * 1-9 switch Pokémon (Turtwig is the required one; the rest are a bonus). Esc returns to level select.
 */
export class Phase0Scene extends Phaser.Scene {
  private readonly names = Object.keys(spriteIndex) as (keyof typeof spriteIndex)[];
  private current: keyof typeof spriteIndex = PRIMARY;
  private scaleIndex = 0; // 1x by default
  private rowsSwapped = false;
  private grid: Phaser.GameObjects.Sprite[][] = [];
  private walker!: Phaser.GameObjects.Sprite;
  private walkerAngle = 0;
  private title!: Phaser.GameObjects.Text;

  constructor() {
    super('Phase0');
  }

  preload(): void {
    for (const dex of Object.values(spriteIndex)) queuePokemon(this, dex, ['Idle', 'Walk']);
  }

  create(): void {
    for (const dex of Object.values(spriteIndex)) registerAnims(this, dex);
    const { width } = this.scale;
    this.title = this.add.text(16, 12, '', TEXT_STYLE);
    this.add.text(
      16,
      32,
      'Space: swap Idle/Walk rows   +/-: scale   1-5: Pokémon   (rows: top Idle, bottom Walk; columns: 8 facings)',
      { ...TEXT_STYLE, color: '#8f8fa8' },
    );

    const columnWidth = width / ALL_DIRECTIONS.length;
    for (const dir of ALL_DIRECTIONS) {
      this.add
        .text(columnWidth * (dir + 0.5), 70, DIRECTION_NAMES[dir] ?? '', TEXT_STYLE)
        .setOrigin(0.5, 0);
    }

    this.buildGrid();

    this.walker = createPmdSprite(this, spriteIndex[this.current], width / 2, 440, 'Walk', Direction.Right);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-SPACE', () => {
        this.rowsSwapped = !this.rowsSwapped;
        this.applyGridAnims();
      });
      keyboard.on('keydown-ESC', () => this.scene.start('LevelSelect'));
      keyboard.on('keydown-PLUS', () => this.changeScale(1));
      keyboard.on('keydown-NUMPAD_ADD', () => this.changeScale(1));
      keyboard.on('keydown-MINUS', () => this.changeScale(-1));
      keyboard.on('keydown-NUMPAD_SUBTRACT', () => this.changeScale(-1));
      this.names.forEach((name, i) => {
        keyboard.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'][i]}`, () =>
          this.switchPokemon(name),
        );
      });
    }
    this.applyScale();
  }

  override update(_time: number, delta: number): void {
    // Walk a circle so the facing comes from real movement, not a table.
    const { width } = this.scale;
    const cx = width / 2;
    const cy = 440;
    const rx = 220;
    const ry = 48;
    const prevX = this.walker.x;
    const prevY = this.walker.y;
    this.walkerAngle += (delta / 1000) * 0.9;
    this.walker.setPosition(cx + Math.cos(this.walkerAngle) * rx, cy + Math.sin(this.walkerAngle) * ry);
    const dir = directionFromVector(this.walker.x - prevX, this.walker.y - prevY, Direction.Right);
    playAnim(this.walker, 'Walk', dir);
    syncShadow(this.walker);
  }

  private buildGrid(): void {
    for (const row of this.grid) for (const sprite of row) sprite.destroy();
    this.grid = [];
    const { width } = this.scale;
    const columnWidth = width / ALL_DIRECTIONS.length;
    const dex = spriteIndex[this.current];
    ROW_ACTIONS.forEach((_action, rowIndex) => {
      const row: Phaser.GameObjects.Sprite[] = [];
      for (const dir of ALL_DIRECTIONS) {
        row.push(createPmdSprite(this, dex, columnWidth * (dir + 0.5), 170 + rowIndex * 150, 'Idle', dir));
      }
      this.grid.push(row);
    });
    this.applyGridAnims();
  }

  private applyGridAnims(): void {
    this.grid.forEach((row, rowIndex) => {
      const action = ROW_ACTIONS[this.rowsSwapped ? 1 - rowIndex : rowIndex] ?? 'Idle';
      row.forEach((sprite, dir) => playAnim(sprite, action, dir as Direction));
    });
    this.updateTitle();
  }

  private changeScale(step: number): void {
    this.scaleIndex = Phaser.Math.Clamp(this.scaleIndex + step, 0, SCALES.length - 1);
    this.applyScale();
  }

  private applyScale(): void {
    const scale = SCALES[this.scaleIndex] ?? 1;
    for (const row of this.grid) {
      for (const sprite of row) {
        sprite.setScale(scale);
        syncShadow(sprite);
      }
    }
    this.walker.setScale(scale);
    syncShadow(this.walker);
    this.updateTitle();
  }

  private switchPokemon(name: keyof typeof spriteIndex): void {
    if (name === this.current) return;
    this.current = name;
    this.buildGrid();
    this.walker.destroy();
    this.walker = createPmdSprite(this, spriteIndex[name], this.scale.width / 2, 440, 'Walk', Direction.Right);
    this.applyScale();
  }

  private updateTitle(): void {
    const scale = SCALES[this.scaleIndex] ?? 1;
    const rows = this.rowsSwapped ? 'Walk / Idle' : 'Idle / Walk';
    this.title.setText(`Phase 0 — ${this.current} (#${spriteIndex[this.current]})  rows: ${rows}  scale: ${scale}x`);
  }
}
