/**
 * Parser for PMDCollab SpriteCollab `AnimData.xml`.
 *
 * Pure: no Phaser imports. Uses the browser's built-in DOMParser (jsdom
 * provides it under Vitest), so there is no runtime XML dependency.
 */

/** One action ("Idle", "Walk", "Attack", ...) in a sprite folder. */
export interface AnimEntry {
  /** Action name as written in the XML, e.g. "Walk". */
  name: string;
  /** Numeric index from the XML (SpriteCollab's canonical action id). Some
   * real entries omit it, e.g. Turtwig's Rumble and Piplup's Appeal. */
  index?: number;
  /**
   * Name of the action whose sprite sheet this entry uses. Equals `name`
   * unless the XML entry is a `<CopyOf>` alias, in which case the alias has
   * no PNG of its own and reuses `<sheet>-Anim.png`.
   */
  sheet: string;
  frameWidth: number;
  frameHeight: number;
  /** Per-frame durations in 60 fps ticks. Length = number of columns. */
  durations: number[];
  /** Frame at which a rushing attack starts moving (some attacks only). */
  rushFrame?: number;
  /** Frame at which an attack lands (attacks only). */
  hitFrame?: number;
  /** Frame at which an attack returns to the idle pose (attacks only). */
  returnFrame?: number;
}

export interface AnimData {
  shadowSize: number;
  anims: Record<string, AnimEntry>;
}

/** Ticks per second in SpriteCollab animation data. */
export const TICKS_PER_SECOND = 60;

/** Number of facing rows in every sprite sheet. */
export const DIRECTION_ROWS = 8;

/** Converts a duration in 60 fps ticks to milliseconds. */
export function ticksToMs(ticks: number): number {
  return (ticks * 1000) / TICKS_PER_SECOND;
}

/** Total length of one loop of an action in milliseconds. */
export function animDurationMs(entry: AnimEntry): number {
  return entry.durations.reduce((sum, t) => sum + ticksToMs(t), 0);
}

function childText(el: Element, tag: string): string | undefined {
  for (const child of Array.from(el.children)) {
    if (child.tagName === tag) return child.textContent?.trim();
  }
  return undefined;
}

function requireInt(el: Element, tag: string, context: string): number {
  const text = childText(el, tag);
  if (text === undefined || text === '') {
    throw new Error(`AnimData: <${tag}> missing in ${context}`);
  }
  const n = Number(text);
  if (!Number.isInteger(n)) {
    throw new Error(`AnimData: <${tag}> in ${context} is not an integer: "${text}"`);
  }
  return n;
}

function optionalInt(el: Element, tag: string, context: string): number | undefined {
  return childText(el, tag) === undefined ? undefined : requireInt(el, tag, context);
}

interface RawAnim {
  name: string;
  index?: number;
  copyOf?: string;
  entry?: Omit<AnimEntry, 'name' | 'index' | 'sheet'>;
}

function parseRawAnim(el: Element): RawAnim {
  const name = childText(el, 'Name');
  if (!name) throw new Error('AnimData: <Anim> without <Name>');
  const index = optionalInt(el, 'Index', name);
  const copyOf = childText(el, 'CopyOf');
  if (copyOf !== undefined) {
    if (copyOf === '') throw new Error(`AnimData: empty <CopyOf> in ${name}`);
    return index === undefined ? { name, copyOf } : { name, index, copyOf };
  }

  const durationsEl = Array.from(el.children).find((c) => c.tagName === 'Durations');
  if (!durationsEl) throw new Error(`AnimData: <Durations> missing in ${name}`);
  const durations = Array.from(durationsEl.children)
    .filter((c) => c.tagName === 'Duration')
    .map((c) => {
      const n = Number(c.textContent?.trim());
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`AnimData: bad <Duration> "${c.textContent}" in ${name}`);
      }
      return n;
    });
  if (durations.length === 0) throw new Error(`AnimData: no <Duration> entries in ${name}`);

  const entry: NonNullable<RawAnim['entry']> = {
    frameWidth: requireInt(el, 'FrameWidth', name),
    frameHeight: requireInt(el, 'FrameHeight', name),
    durations,
  };
  const rushFrame = optionalInt(el, 'RushFrame', name);
  const hitFrame = optionalInt(el, 'HitFrame', name);
  const returnFrame = optionalInt(el, 'ReturnFrame', name);
  if (rushFrame !== undefined) entry.rushFrame = rushFrame;
  if (hitFrame !== undefined) entry.hitFrame = hitFrame;
  if (returnFrame !== undefined) entry.returnFrame = returnFrame;
  return index === undefined ? { name, entry } : { name, index, entry };
}

/**
 * Parses the text of an `AnimData.xml` file.
 *
 * `<CopyOf>` aliases are resolved: the alias gets the target's frame size,
 * durations and hit/return frames, and its `sheet` points at the target's
 * PNG. Chains of aliases are followed; cycles and dangling targets throw.
 */
export function parseAnimData(xml: string): AnimData {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const parseError = doc.getElementsByTagName('parsererror')[0];
  if (parseError) {
    throw new Error(`AnimData: XML parse error: ${parseError.textContent?.trim()}`);
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== 'AnimData') {
    throw new Error('AnimData: root element must be <AnimData>');
  }

  const shadowSize = optionalInt(root, 'ShadowSize', 'AnimData') ?? 0;
  const animsEl = Array.from(root.children).find((c) => c.tagName === 'Anims');
  if (!animsEl) throw new Error('AnimData: <Anims> missing');

  const raws = new Map<string, RawAnim>();
  for (const el of Array.from(animsEl.children)) {
    if (el.tagName !== 'Anim') continue;
    const raw = parseRawAnim(el);
    if (raws.has(raw.name)) throw new Error(`AnimData: duplicate action ${raw.name}`);
    raws.set(raw.name, raw);
  }

  const anims: Record<string, AnimEntry> = {};
  for (const raw of raws.values()) {
    let target = raw;
    const seen = new Set<string>([raw.name]);
    while (target.copyOf !== undefined) {
      const next = raws.get(target.copyOf);
      if (!next) {
        throw new Error(`AnimData: ${target.name} copies unknown action ${target.copyOf}`);
      }
      if (seen.has(next.name)) throw new Error(`AnimData: <CopyOf> cycle at ${next.name}`);
      seen.add(next.name);
      target = next;
    }
    if (!target.entry) throw new Error(`AnimData: unresolved entry for ${raw.name}`);
    const resolved: AnimEntry = {
      name: raw.name,
      sheet: target.name,
      ...target.entry,
      durations: [...target.entry.durations],
    };
    if (raw.index !== undefined) resolved.index = raw.index;
    anims[raw.name] = resolved;
  }

  return { shadowSize, anims };
}
