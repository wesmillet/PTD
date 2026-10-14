/**
 * The Options gear every screen keeps in the canvas's top-left corner, the
 * one corner that stays on screen at every zoom (a canvas bigger than the
 * window scrolls from its top-left), so Options > Zoom is always in reach.
 */
import Phaser from 'phaser';
import { runtime } from '../game/runtime';
import { saveGameIfLoaded } from '../game/session';
import type { GameState } from '../sim/game';
import { Button } from './button';
import { MenuPages } from './menuPages';

/** Above every screen's own UI (HUD 1000s, start menu 2600, title menu 3000). */
export const OPTIONS_BUTTON_DEPTH = 4000;

/** Options pages for a screen without a start menu: game speed and zoom with the shared hooks. */
export function optionsPages(game: GameState, onClose: () => void = () => undefined): MenuPages {
  return new MenuPages({
    game,
    party: () => game.party,
    isPlaced: () => false,
    openPokemon: () => undefined,
    getSpeed: () => runtime.gameSpeed,
    setSpeed: (speed) => {
      runtime.gameSpeed = speed;
      saveGameIfLoaded();
    },
    onClose,
  });
}

/** A 36x38 gear button at (8, 8) that opens the Options page; the pages close with the scene. */
export function addOptionsButton(scene: Phaser.Scene, pages: MenuPages): Button {
  const b = new Button(scene, 0, 0, '', () => {
    if (!pages.isOpen) pages.options();
  }, 36, 32);
  if (scene.textures.exists('ui-menu-options')) b.add(scene.add.image(0, 0, 'ui-menu-options'));
  b.setPosition(8 + b.frameWidth / 2, 8 + b.bh / 2).setDepth(OPTIONS_BUTTON_DEPTH);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => pages.close(false));
  return b;
}
