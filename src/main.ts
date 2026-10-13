import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { LevelScene } from './scenes/LevelScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { Phase0Scene } from './scenes/Phase0Scene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#1b1b24',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, LevelSelectScene, LevelScene, Phase0Scene],
});
