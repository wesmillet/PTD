import Phaser from 'phaser';
import spriteIndex from '../data/spriteIndex.json';
import { queuePokemon, registerAnims } from '../assets/pmdLoader';

/** Actions every Pokémon in the Phase 0 demo needs. */
const DEMO_ACTIONS = ['Idle', 'Walk'] as const;

/**
 * Loads every Pokémon listed in `src/data/spriteIndex.json`, registers their
 * animations and hands off to the demo scene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const { width, height } = this.scale;
    const label = this.add
      .text(width / 2, height / 2 - 20, 'Loading sprites…', { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' })
      .setOrigin(0.5);
    const bar = this.add.graphics();
    this.load.on('progress', (value: number) => {
      bar.clear();
      bar.fillStyle(0x444455, 1).fillRect(width / 2 - 150, height / 2, 300, 12);
      bar.fillStyle(0x7fd37f, 1).fillRect(width / 2 - 150, height / 2, 300 * value, 12);
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      label.setText(`Failed to load ${file.src}`).setColor('#ff6b6b');
    });

    for (const dex of Object.values(spriteIndex)) {
      queuePokemon(this, dex, DEMO_ACTIONS);
    }
  }

  create(): void {
    for (const dex of Object.values(spriteIndex)) {
      registerAnims(this, dex);
    }
    this.scene.start('Phase0');
  }
}
