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
import { installZoomKeys, registerZoomGame } from './game/zoom';

const WIDTH = 960;
const HEIGHT = Hud.HEIGHT + 14 * 32 + Hud.BOTTOM;

function start(): void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#c0ccdc',
    pixelArt: true,
    loader: { maxRetries: 4 },
    scale: {
      mode: Phaser.Scale.FIT,
      // The #game flex box centres the canvas (and scrolls it at a fixed zoom); Phaser centring on top shifted it off-centre.
      autoCenter: Phaser.Scale.NO_CENTER,
      // Fit shrinks into a small window but never enlarges past 1x (see game/zoom.ts).
      max: { width: WIDTH, height: HEIGHT },
    },
    scene: [BootScene, TitleScene, LevelSelectScene, LevelScene, PCScene, ConferenceScene, Phase0Scene],
  });
  registerZoomGame(game);
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
