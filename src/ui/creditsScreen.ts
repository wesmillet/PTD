/** Credits: every shipped sprite folder's artists, plus data and engine credits. DOM overlay. */
import creditsJson from '../data/credits.json';
import { tilesetCredits } from '../map/catalogue';
import { capitalize, ensureOverlayStyles, isolateFromGame } from './domOverlay';

interface PokemonCredit {
  dex: string;
  name: string;
  sprite: string[];
  shiny: string[];
  portrait: string[];
}

const credits = creditsJson as { source: string; pokemon: PokemonCredit[] };

export const GENERAL_CREDITS: { title: string; lines: string[] }[] = [
  {
    title: 'Pokémon sprites and portraits',
    lines: [
      'PMDCollab SpriteCollab, https://github.com/PMDCollab/SpriteCollab',
      'Every sprite and portrait folder ships with its credits.txt; the artists are listed below.',
    ],
  },
  { title: 'Pokémon data', lines: ['PokeAPI, https://pokeapi.co and https://github.com/PokeAPI/pokeapi (Gen 1 to 4 CSV data)'] },
  tilesetCredits(),
  { title: 'Engine', lines: ['Phaser 3, https://phaser.io'] },
  { title: 'RawAsset', lines: ['RawAsset'] },
  { title: 'Pokémon', lines: ['Pokémon is a trademark of Nintendo, Creatures Inc. and GAME FREAK. This is a non-commercial fan project.'] },
];

export class CreditsScreen {
  private root: HTMLDivElement | null = null;

  constructor(private readonly onClose: () => void) {}

  get isOpen(): boolean {
    return this.root !== null;
  }

  show(): void {
    ensureOverlayStyles();
    this.close();
    const root = document.createElement('div');
    root.className = 'ptd-panel ptd-modal';
    root.id = 'ptd-credits';
    root.style.width = 'min(720px, calc(100vw - 24px))';
    root.style.maxHeight = 'calc(100vh - 24px)';
    root.style.overflow = 'auto';
    isolateFromGame(root);
    const close = document.createElement('button');
    close.className = 'ptd-close';
    close.textContent = 'x';
    close.addEventListener('click', () => this.close());
    root.appendChild(close);
    const title = document.createElement('h2');
    title.textContent = 'Credits';
    root.appendChild(title);
    for (const section of GENERAL_CREDITS) {
      const h = document.createElement('div');
      h.style.cssText = 'font-weight:bold;margin-top:12px';
      h.textContent = section.title;
      root.appendChild(h);
      for (const line of section.lines) {
        const d = document.createElement('div');
        d.className = 'ptd-dim';
        d.textContent = line;
        root.appendChild(d);
      }
    }
    const h = document.createElement('div');
    h.style.cssText = 'font-weight:bold;margin-top:14px';
    h.textContent = `Sprite artists (${credits.pokemon.length} Pokémon)`;
    root.appendChild(h);
    const list = document.createElement('div');
    list.style.cssText = 'font-size:12px;line-height:1.5';
    for (const p of credits.pokemon) {
      const row = document.createElement('div');
      row.style.marginTop = '6px';
      const parts: string[] = [];
      if (p.sprite.length) parts.push(`sprites: ${p.sprite.join(', ')}`);
      if (p.shiny.length) parts.push(`shiny: ${p.shiny.join(', ')}`);
      if (p.portrait.length) parts.push(`portraits: ${p.portrait.join(', ')}`);
      row.innerHTML = `<b>#${p.dex} ${capitalize(p.name)}</b> <span class="ptd-dim">${parts.join(' · ')}</span>`;
      list.appendChild(row);
    }
    root.appendChild(list);
    document.body.appendChild(root);
    this.root = root;
  }

  close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    this.onClose();
  }
}
