import Phaser from 'phaser';
import { getMapModel } from '../data/maps';
import { MapRenderer } from '../map/renderer';
import { cloneModel, walkGrid } from '../map/tiled';
import { hasSave } from '../game/storage';
import { badgeTextureKey } from '../game/runtime';
import { getGame, resetGame, saveGameIfLoaded } from '../game/session';
import { runtime } from '../game/runtime';
import { allBadges, hasBadge } from '../sim/game';
import { Button, framePanel } from '../ui/button';
import { CreditsScreen } from '../ui/creditsScreen';
import { Diorama, type StagePoints } from '../ui/diorama';
import { ensureLoaded, isLoaded } from '../assets/pmdLoader';
import { MenuPages } from '../ui/menuPages';
import { COLORS, TEXT_DIM, TEXT_SMALL_DIM, TEXT_TITLE } from '../ui/styles';

const VERSION = '0.8';
/** The diorama map is 960x448; the canvas is 960x600, so the camera zooms in to fill it and pans across. */
const MAP_TOP = 0;
const MAP_W = 960;
const MAP_H = 448;
const PAN_SECONDS = 60;
const PAN_ZOOM = 1.36;

/**
 * Title screen on the living Sinnoh diorama: the `title` map with a slow
 * camera pan, a real-clock tint, one weather effect per load and the cast
 * scenes (src/ui/diorama.ts). The menu lives in a Platinum frame at the
 * bottom left and never waits on the scenes.
 */
export class TitleScene extends Phaser.Scene {
  private credits?: CreditsScreen;
  private pages?: MenuPages;
  private diorama?: Diorama;
  private mapView?: MapRenderer;
  private uiCamera?: Phaser.Cameras.Scene2D.Camera;
  private readonly ui: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Title');
  }

  preload(): void {
    MapRenderer.queueAssets(this);
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.buildDiorama();
    this.buildUi(width, height);
    // Two cameras: the main one pans the diorama, the UI one keeps the menu still.
    this.uiCamera = this.cameras.add(0, 0, width, height);
    this.uiCamera.ignore(this.children.list.filter((o) => !this.ui.includes(o)));
    this.cameras.main.ignore(this.ui);
    this.diorama?.setObjectHook((o) => this.uiCamera?.ignore(o));
    this.startPan();
    this.diorama?.start();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.credits?.close();
      this.credits = undefined;
      this.pages?.close(false);
      this.pages = undefined;
      this.diorama?.destroy();
      this.diorama = undefined;
      (window as unknown as { __ptdTitle?: unknown }).__ptdTitle = undefined;
      this.mapView?.destroy();
      this.mapView = undefined;
    });
  }

  // ---------------------------------------------------------------- diorama

  private buildDiorama(): void {
    let model;
    try {
      model = getMapModel('title');
    } catch {
      return;
    }
    this.mapView = new MapRenderer(this, cloneModel(model), MAP_TOP);
    const points = Object.fromEntries(model.points.map((p) => [p.name, p.tile])) as unknown as Partial<StagePoints>;
    const stage: StagePoints = {
      meadow: points.meadow ?? [12, 7],
      beach: points.beach ?? [6, 11],
      'lake-shore': points['lake-shore'] ?? [3, 8],
      cliff: points.cliff ?? [26, 6],
      ledge: points.ledge ?? [25, 2],
      sky: points.sky ?? [15, 1],
    };
    this.diorama = new Diorama(this, MAP_TOP, model.path.map((t) => [t[0], t[1]]), stage, walkGrid(model));
    // Debug hook for the automated title checks.
    (window as unknown as { __ptdTitle?: unknown }).__ptdTitle = { diorama: this.diorama, scene: this, pmd: { ensureLoaded, isLoaded } };
    this.addTint(model.width * 32, model.height * 32);
    this.addWeather(model.width * 32, model.height * 32, stage);
  }

  /** Real-clock tint over the map: dawn gold, plain day, dusk orange, night blue with lantern glow on the route. */
  private addTint(w: number, h: number): void {
    const hour = new Date().getHours();
    let colour = 0;
    let alpha = 0;
    if (hour < 8) {
      colour = 0xffc060;
      alpha = 0.18;
    } else if (hour >= 20) {
      colour = 0x2030a0;
      alpha = 0.45;
    } else if (hour >= 17) {
      colour = 0xff8040;
      alpha = 0.22;
    }
    if (alpha > 0) this.add.rectangle(0, MAP_TOP, w, h, colour, alpha).setOrigin(0).setDepth(1200).setBlendMode(hour >= 20 ? Phaser.BlendModes.MULTIPLY : Phaser.BlendModes.NORMAL);
    if (hour >= 20 || hour < 6) {
      // Lantern glow on the route posts: warm circles along the path at thirds.
      const model = this.mapView?.currentModel;
      if (!model) return;
      const n = model.path.length;
      for (const i of [Math.floor(n / 3), Math.floor((2 * n) / 3)]) {
        const t = model.path[i];
        if (!t) continue;
        const glow = this.add.circle(t[0] * 32 + 16, MAP_TOP + t[1] * 32 + 16, 46, 0xffd080, 0.28).setDepth(1201).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: glow, alpha: 0.18, duration: 1400, yoyo: true, repeat: -1 });
      }
    }
  }

  /** One weather effect per load: none, drifting petals, light rain, or snow on the ledge only. */
  private addWeather(w: number, h: number, stage: StagePoints): void {
    const pick = Math.floor(Math.random() * 4);
    if (pick === 0) return;
    const key = `weather-${pick}`;
    if (!this.textures.exists(key)) {
      // Drawn on a canvas: generateTexture reads the GPU back and stalls it.
      const tex = this.textures.createCanvas(key, 8, 8);
      if (!tex) return;
      const ctx = tex.context;
      ctx.beginPath();
      if (pick === 1) {
        ctx.fillStyle = '#ffb0d0';
        ctx.ellipse(3, 3, 3, 2, 0, 0, Math.PI * 2);
      } else if (pick === 2) {
        ctx.fillStyle = 'rgba(192,216,255,0.8)';
        ctx.rect(0, 0, 1, 8);
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.arc(2, 2, 2, 0, Math.PI * 2);
      }
      ctx.fill();
      tex.refresh();
    }
    if (pick === 1) {
      this.add.particles(0, MAP_TOP, key, { x: { min: 0, max: w }, y: { min: -10, max: h }, lifespan: 6000, speedX: { min: 10, max: 30 }, speedY: { min: 8, max: 20 }, quantity: 1, frequency: 400, alpha: { start: 0.9, end: 0.2 }, rotate: { start: 0, end: 180 } }).setDepth(1300);
    } else if (pick === 2) {
      this.add.particles(0, MAP_TOP, key, { x: { min: 0, max: w }, y: -10, lifespan: 1400, speedY: { min: 240, max: 320 }, speedX: -20, quantity: 3, frequency: 60, alpha: 0.6 }).setDepth(1300);
    } else {
      const [lx, ly] = stage.ledge;
      this.add.particles(0, MAP_TOP, key, { x: { min: (lx - 5) * 32, max: (lx + 5) * 32 }, y: { min: (ly - 3) * 32, max: (ly + 2) * 32 }, lifespan: 2600, speedY: { min: 14, max: 26 }, speedX: { min: -8, max: 8 }, quantity: 1, frequency: 150, alpha: { start: 0.9, end: 0 }, scale: { start: 0.8, end: 0.4 } }).setDepth(1300);
    }
  }

  /** A sixty-second drift across the map and back, at a slight zoom so the edges never show. */
  private startPan(): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    cam.setZoom(PAN_ZOOM);
    // With zoom the camera shows a (width / zoom) x (height / zoom) window centred on scroll + half the canvas.
    const viewW = width / PAN_ZOOM;
    const viewH = height / PAN_ZOOM;
    const left = (viewW - width) / 2;
    const right = MAP_W - viewW / 2 - width / 2;
    const top = MAP_TOP + (MAP_H - viewH) / 2;
    cam.scrollX = left;
    cam.scrollY = top - (height - viewH) / 2;
    this.tweens.add({ targets: cam, scrollX: right, duration: PAN_SECONDS * 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // --------------------------------------------------------------------- ui

  private uiAdd<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.ui.push(o);
    return o;
  }

  private buildUi(width: number, height: number): void {
    const saved = hasSave();
    const game = getGame();
    const title = this.uiAdd(this.add.text(width / 2, 30, 'Sinnoh Tower Defense', { ...TEXT_TITLE, shadow: { offsetX: 2, offsetY: 2, color: '#283028', blur: 0, stroke: false, fill: true } }).setOrigin(0.5).setDepth(3000));
    title.setStroke('#283028', 3);
    this.uiAdd(this.add.text(width / 2, 66, 'A Pokémon Tower Defense fan game', { ...TEXT_DIM, color: '#f8f8f8' }).setOrigin(0.5).setDepth(3000));
    this.uiAdd(this.add.text(width - 10, height - 8, `v${VERSION}`, { ...TEXT_SMALL_DIM, color: '#f8f8f8' }).setOrigin(1, 1).setDepth(3000));
    // Badge case at the top right, lit for the badges this save has earned.
    const badges = allBadges();
    let bx = width - 24 - (badges.length - 1) * 28;
    for (const b of badges) {
      const earned = hasBadge(game, b.id);
      const key = badgeTextureKey(b.id, earned);
      if (this.textures.exists(key)) this.uiAdd(this.add.image(bx, 26, key).setScale(0.4).setAlpha(earned ? 1 : 0.5).setDepth(3000));
      bx += 28;
    }
    // The menu in a Platinum frame at the bottom left.
    const panelW = 232;
    const panelH = 236;
    const px = 16 + panelW / 2;
    const py = height - 16 - panelH / 2;
    this.uiAdd(framePanel(this, px, py, panelW, panelH, 'blue').setDepth(2990));
    const entries: { label: string; icon: string; action: () => void; enabled?: boolean }[] = [
      {
        label: 'New game',
        icon: 'ui-menu-pokedex',
        action: () => {
          if ((saved || game.party.length > 0) && !window.confirm('Start a new game? The current save will be deleted.')) return;
          resetGame();
          this.scene.start('LevelSelect');
        },
      },
      { label: 'Continue', icon: 'ui-menu-party', action: () => this.scene.start('LevelSelect'), enabled: saved || game.party.length > 0 },
      { label: 'PC', icon: 'ui-menu-bag', action: () => this.scene.start('PC'), enabled: saved || game.party.length > 0 },
      { label: 'Options', icon: 'ui-menu-options', action: () => this.pages?.options() },
      { label: 'Credits', icon: 'ui-menu-card', action: () => this.credits?.show() },
    ];
    entries.forEach((e, i) => {
      const b = this.uiAdd(new Button(this, px, py - panelH / 2 + 30 + i * 42, e.label, e.action, 200, 38, e.icon).setDepth(3000));
      if (e.enabled === false) b.setEnabled(false);
    });
    this.uiAdd(this.add.text(width - 16, height - 24, 'Non-commercial fan project. Pokémon is a trademark of Nintendo, Creatures Inc. and GAME FREAK.', { ...TEXT_SMALL_DIM, color: '#f8f8f8', wordWrap: { width: 640 }, align: 'right' }).setOrigin(1, 1).setDepth(3000));
    this.credits = new CreditsScreen(() => undefined);
    this.pages = new MenuPages({
      game,
      party: () => game.party,
      isPlaced: () => false,
      openPokemon: () => undefined,
      getSpeed: () => runtime.gameSpeed,
      setSpeed: (speed) => {
        runtime.gameSpeed = speed;
        saveGameIfLoaded();
      },
      onClose: () => undefined,
    });
  }
}
