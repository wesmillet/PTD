import Phaser from 'phaser';
import './ui/theme.css';
import { BootScene } from './scenes/BootScene';
import { LevelScene } from './scenes/LevelScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { PCScene } from './scenes/PCScene';
import { ConferenceScene } from './scenes/ConferenceScene';
import { Phase0Scene } from './scenes/Phase0Scene';
import { TitleScene } from './scenes/TitleScene';
import { Hud } from './ui/hud';
import { saveGameIfLoaded } from './game/session';
import { installZoomKeys, registerZoomGame } from './game/zoom';

function start(): void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 960,
    height: Hud.HEIGHT + 14 * 32 + Hud.BOTTOM,
    backgroundColor: '#c0ccdc',
    pixelArt: true,
    loader: { maxRetries: 4 },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, TitleScene, LevelSelectScene, LevelScene, PCScene, ConferenceScene, Phase0Scene],
  });
  registerZoomGame(game, () => saveGameIfLoaded());
  installZoomKeys();
}

// Make sure the pixel font is available before any canvas text is created.
const fonts = typeof document !== 'undefined' && 'fonts' in document ? document.fonts : null;
if (fonts) {
  Promise.all([fonts.load('13px "Power Clear"'), fonts.load('700 13px "Power Clear Bold"')])
    .catch(() => undefined)
    .finally(start);
} else {
  start();
}
