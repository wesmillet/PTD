/**
 * The title diorama: the `title` map with Platinum overworld trainers and
 * PMD Pokémon acting out little scenes on the map's stage points, cast at
 * random from the sprite index and the overworld sheets. Everything loads
 * in the background; a sprite that is not ready within two seconds is
 * skipped, so the menu never waits.
 *
 * Scenes: the spar (meadow), the chase (the route), the fishing trip
 * (beach), the picnic (lake shore), Galactic business (cliff), the flyover
 * (sky) and the rift (ledge). Five play at once; every 90 s one ends and is
 * re-cast.
 */
import Phaser from 'phaser';
import { Direction, directionFromVector } from '../assets/direction';
import { createPmdSprite, ensureLoaded, isLoaded, playAnim, syncShadow } from '../assets/pmdLoader';
import { getEvolutions, getPokemon } from '../data/pokedata';
import spriteFolders from '../data/spriteFolders.json';
import { TRAINER_ART } from '../data/trainers';
import { assetUrl } from '../game/runtime';
import { Rng } from '../sim/rng';
import { TILE_SIZE } from '../map/tiled';

const FOLDERS = spriteFolders as Record<string, { species?: number; form?: string }>;
const TILE = TILE_SIZE;
const SPRITE_Y = -4;
/** Overworld sheets: four frames per facing in this order. */
const OW_ROWS = { up: 0, down: 4, left: 8, right: 12 } as const;
type OwFacing = keyof typeof OW_ROWS;
const LOAD_TIMEOUT_MS = 2000;
const RECAST_MS = 90_000;
const LEGENDARY_FLYERS = ['0492-sky', '0381', '0488', '0491', '0487-origin', '0249', '0145'];
const RIFT_HOPPERS = ['0570-hisui', '0058-hisui'];
const NEW_PICKS = Object.keys(FOLDERS).filter((f) => f.includes('-'));
const CHASERS = ['0041', '0217', '0068', '0059-hisui', '0130'];
const SLOW_CHASER = '0143';
const CHASE_TRAINERS = ['youngster', 'bug_catcher', 'grunt_m', 'grunt_f', 'barry', 'hiker', 'picnicker', 'lass'];
const STARTERS = ['0387', '0390', '0393'];

export interface StagePoints {
  meadow: [number, number];
  beach: [number, number];
  'lake-shore': [number, number];
  cliff: [number, number];
  ledge: [number, number];
  sky: [number, number];
}

interface Actor {
  sprite: Phaser.GameObjects.Sprite;
  folder: string;
}

interface OwActor {
  sprite: Phaser.GameObjects.Sprite;
  key: string;
}

type Cancel = { cancelled: boolean };

const wait = (scene: Phaser.Scene, ms: number, token: Cancel): Promise<void> =>
  new Promise((resolve) => {
    scene.time.delayedCall(ms, () => resolve());
    void token;
  });

export class Diorama {
  private readonly scene: Phaser.Scene;
  private readonly rng: Rng;
  private readonly offsetY: number;
  private readonly path: [number, number][];
  private readonly points: StagePoints;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly runs: Cancel[] = [];
  private readonly slots: { name: string; token: Cancel | null }[] = [];
  private destroyed = false;
  private onObject: ((o: Phaser.GameObjects.GameObject) => void) | null = null;

  constructor(scene: Phaser.Scene, offsetY: number, path: [number, number][], points: StagePoints, seed = Date.now()) {
    this.scene = scene;
    this.offsetY = offsetY;
    this.path = path;
    this.points = points;
    this.rng = new Rng(seed);
  }

  /** Called for every game object the diorama creates (the UI camera ignores them). */
  setObjectHook(hook: (o: Phaser.GameObjects.GameObject) => void): void {
    this.onObject = hook;
    for (const o of this.objects) hook(o);
  }

  start(): void {
    const scenes: [string, (t: Cancel) => Promise<void>][] = [
      ['spar', (t) => this.spar(t)],
      ['chase', (t) => this.chase(t)],
      ['fishing', (t) => this.fishing(t)],
      ['picnic', (t) => this.picnic(t)],
      ['galactic', (t) => this.galactic(t)],
    ];
    for (const [name, run] of scenes) {
      const token = this.track();
      this.slots.push({ name, token });
      void this.loop(name, run, token);
    }
    void this.flyovers(this.track());
    void this.rifts(this.track());
    this.scene.time.addEvent({
      delay: RECAST_MS,
      loop: true,
      callback: () => {
        if (this.destroyed || this.slots.length === 0) return;
        const slot = this.rng.pick(this.slots);
        if (slot.token) slot.token.cancelled = true;
        const run = scenes.find(([n]) => n === slot.name)?.[1];
        if (!run) return;
        slot.token = this.track();
        void this.loop(slot.name, run, slot.token);
      },
    });
  }

  destroy(): void {
    this.destroyed = true;
    for (const t of this.runs) t.cancelled = true;
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }

  // ------------------------------------------------------------------ casting

  private track(): Cancel {
    const t = { cancelled: false };
    this.runs.push(t);
    return t;
  }

  private async loop(name: string, run: (t: Cancel) => Promise<void>, token: Cancel): Promise<void> {
    while (!token.cancelled && !this.destroyed) {
      try {
        await run(token);
      } catch {
        // a sprite failed to load or the scene went away: try again after a pause
      }
      await wait(this.scene, 4000 + this.rng.int(0, 4000), token);
    }
  }

  private px(tile: number): number {
    return tile * TILE + TILE / 2;
  }
  private py(tile: number): number {
    return this.offsetY + tile * TILE + TILE / 2 + SPRITE_Y;
  }

  /** A random sprite folder: final evolutions and legendaries 3x, a quarter of the time a new form. */
  private pickFolder(): string {
    if (this.rng.chance(0.25) && NEW_PICKS.length) return this.rng.pick(NEW_PICKS);
    const folders = Object.keys(FOLDERS);
    const weights = folders.map((f) => {
      const species = FOLDERS[f]?.species ?? Number(f.split('-')[0]);
      try {
        const data = getPokemon(species);
        const final = getEvolutions(species).length === 0;
        const legendary = data.catchRate <= 3;
        return final || legendary ? 3 : 1;
      } catch {
        return 1;
      }
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.rng.next() * total;
    for (let i = 0; i < folders.length; i++) {
      r -= weights[i]!;
      if (r < 0) return folders[i]!;
    }
    return folders[folders.length - 1]!;
  }

  private register<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objects.push(o);
    this.onObject?.(o);
    return o;
  }

  /** Loads a PMD sprite set; null when it is not ready within the timeout. */
  private async actor(folder: string, x: number, y: number, action = 'Idle', dir: Direction = Direction.Down, shiny = false): Promise<Actor | null> {
    const dex = shiny && (FOLDERS[folder] as { shiny?: boolean } | undefined)?.shiny ? `${folder}/shiny` : folder;
    const ready = await Promise.race([
      ensureLoaded(this.scene, dex, ['Idle', 'Walk'], { optional: ['Attack', 'Hurt', 'Faint'] }).then(() => true).catch(() => false),
      new Promise<boolean>((resolve) => this.scene.time.delayedCall(LOAD_TIMEOUT_MS, () => resolve(isLoaded(dex)))),
    ]);
    if (!ready || this.destroyed) return null;
    const sprite = this.register(createPmdSprite(this.scene, dex, x, y, action, dir));
    const shadow = sprite.getData('pmdShadow') as Phaser.GameObjects.Sprite | undefined;
    if (shadow) this.register(shadow);
    sprite.setDepth(y);
    if (shiny) this.sparkle(x, y);
    return { sprite, folder: dex };
  }

  /** Loads an overworld sheet as a spritesheet texture and makes a sprite from it. */
  private async ow(name: string, x: number, y: number, facing: OwFacing = 'down'): Promise<OwActor | null> {
    const key = `ow-${name}`;
    if (!this.scene.textures.exists(key)) {
      const ok = await new Promise<boolean>((resolve) => {
        const scene = this.scene;
        const timer = scene.time.delayedCall(LOAD_TIMEOUT_MS, () => resolve(scene.textures.exists(key)));
        scene.load.spritesheet(key, assetUrl(`assets/trainers/overworld/${name}.png`), { frameWidth: 32, frameHeight: 32 });
        scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
          timer.remove(false);
          resolve(scene.textures.exists(key));
        });
        if (!scene.load.isLoading()) scene.load.start();
      });
      if (!ok || this.destroyed) return null;
    }
    for (const [f, row] of Object.entries(OW_ROWS)) {
      const animKey = `${key}-walk-${f}`;
      if (!this.scene.anims.exists(animKey)) this.scene.anims.create({ key: animKey, frames: this.scene.anims.generateFrameNumbers(key, { start: row, end: row + 3 }), frameRate: 8, repeat: -1 });
    }
    const sprite = this.register(this.scene.add.sprite(x, y, key, OW_ROWS[facing]).setDepth(y));
    return { sprite, key };
  }

  private sparkle(x: number, y: number): void {
    if (!this.scene.textures.exists('star')) return;
    const emitter = this.register(this.scene.add.particles(x, y, 'star', { speed: { min: 20, max: 60 }, lifespan: 600, quantity: 8, scale: { start: 1, end: 0 }, tint: 0xfff2a8 }));
    emitter.setDepth(2000).explode(8);
    this.scene.time.delayedCall(800, () => emitter.destroy());
  }

  // ---------------------------------------------------------------- movement

  private walkPmd(actor: Actor, x: number, y: number, speed: number, token: Cancel): Promise<void> {
    const sprite = actor.sprite;
    const dx = x - sprite.x;
    const dy = y - sprite.y;
    const dist = Math.hypot(dx, dy);
    playAnim(sprite, 'Walk', directionFromVector(dx, dy, Direction.Down));
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: sprite,
        x,
        y,
        duration: Math.max(1, (dist / speed) * 1000),
        onUpdate: () => {
          sprite.setDepth(sprite.y);
          syncShadow(sprite);
        },
        onComplete: () => {
          if (!token.cancelled && sprite.active) playAnim(sprite, 'Idle', directionFromVector(dx, dy, Direction.Down));
          resolve();
        },
      });
    });
  }

  private walkOw(actor: OwActor, x: number, y: number, speed: number): Promise<void> {
    const sprite = actor.sprite;
    const dx = x - sprite.x;
    const dy = y - sprite.y;
    const facing: OwFacing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    sprite.play(`${actor.key}-walk-${facing}`, true);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: sprite,
        x,
        y,
        duration: Math.max(1, (Math.hypot(dx, dy) / speed) * 1000),
        onUpdate: () => sprite.setDepth(sprite.y),
        onComplete: () => {
          if (sprite.active) {
            sprite.stop();
            sprite.setFrame(OW_ROWS[facing]);
          }
          resolve();
        },
      });
    });
  }

  private playOnce(sprite: Phaser.GameObjects.Sprite, action: string, dir: Direction): Promise<void> {
    return new Promise((resolve) => {
      const dex = sprite.getData('pmdDex') as string;
      if (!this.scene.anims.exists(`pmd-${dex}-${action}-${dir}`) && !isLoaded(dex)) {
        resolve();
        return;
      }
      try {
        playAnim(sprite, action, dir);
      } catch {
        resolve();
        return;
      }
      if (!sprite.anims.isPlaying) {
        resolve();
        return;
      }
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => resolve());
      this.scene.time.delayedCall(1500, () => resolve());
    });
  }

  private flash(sprite: Phaser.GameObjects.Sprite): void {
    sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (sprite.active) sprite.clearTint();
    });
  }

  private discard(...actors: (Actor | OwActor | null)[]): void {
    for (const a of actors) a?.sprite.destroy();
  }

  // ------------------------------------------------------------------ scenes

  /** Two Pokémon trade blows on the meadow; after six exchanges one faints and a challenger walks in. */
  private async spar(token: Cancel): Promise<void> {
    const [mx, my] = this.points.meadow;
    let left = await this.actor(this.pickFolder(), this.px(mx - 1), this.py(my), 'Idle', Direction.Right, this.rng.chance(0.1));
    let right = await this.actor(this.pickFolder(), this.px(mx + 1), this.py(my), 'Idle', Direction.Left, this.rng.chance(0.1));
    if (!left || !right) {
      this.discard(left, right);
      return;
    }
    while (!token.cancelled && left && right) {
      for (let i = 0; i < 6 && !token.cancelled; i++) {
        const attacker = i % 2 === 0 ? left : right;
        const defender = i % 2 === 0 ? right : left;
        const dir = i % 2 === 0 ? Direction.Right : Direction.Left;
        await this.playOnce(attacker.sprite, 'Attack', dir);
        if (token.cancelled) break;
        this.flash(defender.sprite);
        await this.playOnce(defender.sprite, 'Hurt', dir === Direction.Right ? Direction.Left : Direction.Right);
        playAnim(attacker.sprite, 'Idle', dir);
        if (defender.sprite.active) playAnim(defender.sprite, 'Idle', dir === Direction.Right ? Direction.Left : Direction.Right);
        await wait(this.scene, 500, token);
      }
      if (token.cancelled) break;
      const loserIsLeft = this.rng.chance(0.5);
      const loser = loserIsLeft ? left : right;
      await this.playOnce(loser.sprite, 'Faint', loserIsLeft ? Direction.Right : Direction.Left);
      loser.sprite.setAlpha(0.45);
      await this.walkPmd(loser, loser.sprite.x, this.py(my - 5), 40, token);
      loser.sprite.destroy();
      const challenger = await this.actor(this.pickFolder(), this.px(mx + (loserIsLeft ? -1 : 1)), this.py(my - 5), 'Walk', Direction.Down, this.rng.chance(0.1));
      if (!challenger) break;
      await this.walkPmd(challenger, this.px(mx + (loserIsLeft ? -1 : 1)), this.py(my), 50, token);
      if (loserIsLeft) left = challenger;
      else right = challenger;
      playAnim(left.sprite, 'Idle', Direction.Right);
      playAnim(right.sprite, 'Idle', Direction.Left);
    }
    this.discard(left, right);
  }

  /** A trainer runs the route with three angry Pokémon after them; now and then the roles flip. */
  private async chase(token: Cancel): Promise<void> {
    const flip = this.rng.chance(0.3);
    const slow = flip && this.rng.chance(0.5);
    const trainerName = this.rng.pick(CHASE_TRAINERS);
    const chaserFolder = slow ? SLOW_CHASER : this.rng.pick(CHASERS);
    const route = this.path.map(([x, y]) => [this.px(x), this.py(y)] as [number, number]);
    const start = route[0]!;
    const speed = slow ? 28 : 70;
    const pack = flip ? 1 : 3;
    // Who is chased: the trainer, or (flipped) a Bidoof with a stolen hat.
    const runner: Actor | OwActor | null = flip && !slow ? await this.actor('0399', start[0], start[1], 'Walk', Direction.Right) : await this.ow(trainerName, start[0], start[1], 'right');
    if (!runner) return;
    const chasers: (Actor | OwActor)[] = [];
    for (let i = 0; i < pack; i++) {
      const c = flip && !slow ? await this.ow(trainerName, start[0] - 40 * (i + 1), start[1], 'right') : slow ? await this.actor(chaserFolder, start[0] - 48, start[1], 'Walk', Direction.Right) : await this.actor(chaserFolder, start[0] - 40 * (i + 1), start[1], 'Walk', Direction.Right);
      if (c) chasers.push(c);
    }
    if (slow && chasers.length === 0) {
      this.discard(runner);
      return;
    }
    const move = (a: Actor | OwActor, x: number, y: number, s: number) => ('folder' in a ? this.walkPmd(a, x, y, s, token) : this.walkOw(a, x, y, s));
    let laps = 0;
    while (!token.cancelled && laps < 3) {
      const legs = laps % 2 === 0 ? route.slice(1) : [...route].reverse().slice(1);
      for (const [x, y] of legs) {
        if (token.cancelled) break;
        const runnerMove = move(runner, x, y, speed);
        chasers.forEach((c, i) => {
          this.scene.time.delayedCall(220 * (i + 1), () => {
            if (!token.cancelled && c.sprite.active) void move(c, x, y, speed * 1.02);
          });
        });
        await runnerMove;
      }
      laps++;
    }
    this.discard(runner, ...chasers);
  }

  /** A fisherman casts on the beach; Magikarp and Goldeen hop; now and then a Gyarados surfaces and he runs. */
  private async fishing(token: Cancel): Promise<void> {
    const [bx, by] = this.points.beach;
    const fisher = await this.ow('fisherman', this.px(bx), this.py(by) - SPRITE_Y, 'down');
    if (!fisher) return;
    const waterX = this.px(bx);
    const waterY = this.py(by + 1) + 10;
    let casts = 0;
    while (!token.cancelled && casts < 6) {
      await wait(this.scene, 2500 + this.rng.int(0, 2000), token);
      if (token.cancelled) break;
      const fish = await this.actor(this.rng.pick(['0129', '0118']), waterX + this.rng.int(-30, 30), waterY, 'Idle', Direction.Up);
      if (fish) {
        fish.sprite.setAlpha(0);
        this.scene.tweens.add({ targets: fish.sprite, y: waterY - 26, alpha: 1, duration: 320, yoyo: true, ease: 'Quad.easeOut', onComplete: () => fish.sprite.destroy() });
      }
      casts++;
      if (casts === 5) {
        const gyarados = await this.actor('0130', waterX + 40, waterY + 6, 'Idle', Direction.Up);
        if (gyarados) {
          gyarados.sprite.setAlpha(0).setScale(1.3);
          this.scene.tweens.add({ targets: gyarados.sprite, alpha: 1, y: waterY - 10, duration: 500 });
          await wait(this.scene, 600, token);
          await this.walkOw(fisher, this.px(bx - 4), this.py(by - 2), 90);
          await wait(this.scene, 600, token);
          gyarados.sprite.destroy();
          await this.walkOw(fisher, this.px(bx), this.py(by) - SPRITE_Y, 50);
        }
      }
    }
    this.discard(fisher);
  }

  /** Dawn and Lucas with a starter each; a small Pokémon circles them; the professor looks at the lake and leaves. */
  private async picnic(token: Cancel): Promise<void> {
    const [lx, ly] = this.points['lake-shore'];
    const dawn = await this.ow('player_f', this.px(lx), this.py(ly) - SPRITE_Y, 'down');
    const lucas = await this.ow('player_m', this.px(lx + 1), this.py(ly) - SPRITE_Y, 'down');
    const pick = [...STARTERS];
    const a = pick.splice(this.rng.int(0, pick.length - 1), 1)[0]!;
    const b = pick.splice(this.rng.int(0, pick.length - 1), 1)[0]!;
    const starterA = await this.actor(a, this.px(lx), this.py(ly + 1), 'Idle', Direction.Up);
    const starterB = await this.actor(b, this.px(lx + 1), this.py(ly + 1), 'Idle', Direction.Up);
    const pet = await this.actor(this.rng.pick(['0417', '0427']), this.px(lx - 1), this.py(ly), 'Walk', Direction.Down);
    let ticks = 0;
    const circle: [number, number][] = [
      [this.px(lx - 1), this.py(ly + 2)],
      [this.px(lx + 2), this.py(ly + 2)],
      [this.px(lx + 2), this.py(ly - 1)],
      [this.px(lx - 1), this.py(ly - 1)],
    ];
    while (!token.cancelled && ticks < 4) {
      for (const [x, y] of circle) {
        if (token.cancelled || !pet) break;
        await this.walkPmd(pet, x, y, 45, token);
      }
      ticks++;
      if (ticks === 2) {
        const prof = await this.ow('gentleman', this.px(lx + 5), this.py(ly - 4), 'down');
        if (prof) {
          await this.walkOw(prof, this.px(lx + 3), this.py(ly), 40);
          await this.walkOw(prof, this.px(lx + 3), this.py(ly + 1), 40);
          await wait(this.scene, 1800, token);
          await this.walkOw(prof, this.px(lx + 5), this.py(ly - 4), 40);
          prof.sprite.destroy();
        }
      }
    }
    this.discard(dawn, lucas, starterA, starterB, pet);
  }

  /** Two grunts sneak along the cliff with a Bronzor; an officer follows; a commander appears and they all run. */
  private async galactic(token: Cancel): Promise<void> {
    const [cx, cy] = this.points.cliff;
    const startX = this.px(cx - 6);
    const g1 = await this.ow('grunt_m', startX, this.py(cy) - SPRITE_Y, 'right');
    const g2 = await this.ow('grunt_f', startX - 36, this.py(cy) - SPRITE_Y, 'right');
    const bronzor = await this.actor('0436', startX - 70, this.py(cy) - 10, 'Walk', Direction.Right);
    const looker = await this.ow('policeman', startX - 140, this.py(cy) - SPRITE_Y, 'right');
    if (!g1) {
      this.discard(g2, bronzor, looker);
      return;
    }
    const sneak = async (x: number) => {
      const moves = [this.walkOw(g1, x, g1.sprite.y, 30)];
      if (g2) moves.push(this.walkOw(g2, x - 36, g2.sprite.y, 30));
      if (bronzor) moves.push(this.walkPmd(bronzor, x - 70, bronzor.sprite.y, 30, token));
      if (looker) moves.push(this.walkOw(looker, x - 140, looker.sprite.y, 30));
      await Promise.all(moves);
    };
    await sneak(this.px(cx - 3));
    await wait(this.scene, 1200, token);
    await sneak(this.px(cx));
    if (token.cancelled) {
      this.discard(g1, g2, bronzor, looker);
      return;
    }
    const commander = await this.ow(this.rng.pick(['mars', 'jupiter', 'saturn']), this.px(cx + 3), this.py(cy) - SPRITE_Y, 'left');
    await wait(this.scene, 900, token);
    const edge = this.scene.scale.width + 48;
    const run = [this.walkOw(g1, edge, g1.sprite.y, 110)];
    if (g2) run.push(this.walkOw(g2, edge, g2.sprite.y, 110));
    if (bronzor) run.push(this.walkPmd(bronzor, edge, bronzor.sprite.y, 110, token));
    if (commander) run.push(this.walkOw(commander, edge, commander.sprite.y, 120));
    if (looker) run.push(this.walkOw(looker, edge, looker.sprite.y, 100));
    await Promise.all(run);
    this.discard(g1, g2, bronzor, looker, commander);
  }

  /** Every 30 to 60 s a legendary crosses the sky lane as a big sprite with a drifting shadow. */
  private async flyovers(token: Cancel): Promise<void> {
    while (!token.cancelled && !this.destroyed) {
      await wait(this.scene, 30_000 + this.rng.int(0, 30_000), token);
      if (token.cancelled) break;
      const [, sy] = this.points.sky;
      const leftToRight = this.rng.chance(0.5);
      const width = this.scene.scale.width;
      const x0 = leftToRight ? -80 : width + 80;
      const x1 = leftToRight ? width + 80 : -80;
      const flyer = await this.actor(this.rng.pick(LEGENDARY_FLYERS), x0, this.py(sy), 'Walk', leftToRight ? Direction.Right : Direction.Left);
      if (!flyer) continue;
      flyer.sprite.setScale(2).setDepth(1500);
      const shadow = flyer.sprite.getData('pmdShadow') as Phaser.GameObjects.Sprite | undefined;
      shadow?.setScale(2).setAlpha(0.5);
      await new Promise<void>((resolve) => {
        this.scene.tweens.add({
          targets: flyer.sprite,
          x: x1,
          duration: 9000,
          onUpdate: () => shadow?.setPosition(flyer.sprite.x + 10, flyer.sprite.y + 70),
          onComplete: () => resolve(),
        });
      });
      flyer.sprite.destroy();
    }
  }

  /** A purple tear opens on the ledge; a Hisuian Pokémon hops out, looks both ways and runs into the forest. */
  private async rifts(token: Cancel): Promise<void> {
    while (!token.cancelled && !this.destroyed) {
      await wait(this.scene, 20_000 + this.rng.int(0, 25_000), token);
      if (token.cancelled) break;
      const [rx, ry] = this.points.ledge;
      const x = this.px(rx);
      const y = this.py(ry);
      const tear = this.register(this.scene.add.ellipse(x, y - 8, 6, 44, 0x9040e0, 0.85).setDepth(y + 1));
      const glow = this.register(this.scene.add.ellipse(x, y - 8, 14, 56, 0xd090ff, 0.35).setDepth(y));
      this.scene.tweens.add({ targets: [tear, glow], scaleX: 4, duration: 500, ease: 'Back.easeOut' });
      await wait(this.scene, 600, token);
      const hopper = await this.actor(this.rng.pick(RIFT_HOPPERS), x, y, 'Idle', Direction.Down);
      if (hopper) {
        hopper.sprite.setAlpha(0);
        this.scene.tweens.add({ targets: hopper.sprite, alpha: 1, y: y + 18, duration: 300, ease: 'Quad.easeOut' });
        await wait(this.scene, 500, token);
        playAnim(hopper.sprite, 'Idle', Direction.Left);
        await wait(this.scene, 500, token);
        playAnim(hopper.sprite, 'Idle', Direction.Right);
        await wait(this.scene, 500, token);
        await this.walkPmd(hopper, x - 20, this.py(ry - 3), 90, token);
        hopper.sprite.destroy();
      }
      this.scene.tweens.add({ targets: [tear, glow], scaleX: 0, alpha: 0, duration: 400, onComplete: () => { tear.destroy(); glow.destroy(); } });
    }
  }
}
