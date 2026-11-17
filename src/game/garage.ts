/**
 * Bus customisation (the garage). Pure data + helpers, no DOM.
 * The Dham Rajina Xpress look always overrides the custom look while boosted.
 */

export const COLOURS = {
  classic: { name: 'CLASSIC RED', pal: {} },
  teal: { name: 'OCEAN TEAL', pal: { R: '#0898a0', r: '#045058', h: '#48d8e0', B: '#f86800' } },
  emerald: { name: 'EMERALD', pal: { R: '#0c9c48', r: '#04582a', h: '#48dc80', B: '#f8f8f8' } },
  sunset: { name: 'SUNSET ORANGE', pal: { R: '#f06c10', r: '#a03c00', h: '#ffa860', B: '#7a1aa8' } },
  midnight: { name: 'MIDNIGHT', pal: { R: '#2c2c48', r: '#14142a', h: '#5c5c88', B: '#f8b800', C: '#c8c8e0' } },
  banana: { name: 'BANANA', pal: { R: '#f8d000', r: '#a88800', h: '#fff070', B: '#d82800' } },
} as const satisfies Record<string, { name: string; pal: Record<string, string> }>;

/** Sign-board styles: the route number glowing in amber / green / red, or a scrolling marquee. */
export const SIGNS = {
  amber: { name: 'AMBER 138', glow: ['#f87800', '#fca044', '#fcc070', '#fca044'] },
  green: { name: 'GREEN LED', glow: ['#20b020', '#58ff58', '#a0ffa0', '#58ff58'] },
  red: { name: 'RED LED', glow: ['#c01818', '#ff4040', '#ff9090', '#ff4040'] },
  scroll: { name: 'SCROLLING', glow: ['#f87800', '#fca044', '#fcc070', '#fca044'] },
} as const;

export const LIGHTS = {
  none: { name: 'NONE' },
  roof: { name: 'ROOF LEDS' },
  rainbow: { name: 'RAINBOW CHASE' },
} as const;

export const STICKERS = {
  none: { name: 'NONE' },
  stars: { name: 'STARS' },
  flames: { name: 'FLAMES' },
  flowers: { name: 'FLOWERS' },
} as const;

export interface BusStyle {
  colour: keyof typeof COLOURS;
  sign: keyof typeof SIGNS;
  lights: keyof typeof LIGHTS;
  stickers: keyof typeof STICKERS;
}

export type StyleField = keyof BusStyle;

export const OPTIONS: { [K in StyleField]: Record<BusStyle[K], { name: string }> } = {
  colour: COLOURS,
  sign: SIGNS,
  lights: LIGHTS,
  stickers: STICKERS,
};

export const FIELD_LABELS: Record<StyleField, string> = {
  colour: 'COLOUR',
  sign: 'SIGN BOARD',
  lights: 'LIGHTS',
  stickers: 'STICKERS',
};

export const DEFAULT_STYLE: BusStyle = { colour: 'classic', sign: 'amber', lights: 'none', stickers: 'none' };

export function optionKeys<K extends StyleField>(field: K): BusStyle[K][] {
  return Object.keys(OPTIONS[field]) as BusStyle[K][];
}

/** Next / previous option for one field (wraps around). */
export function cycle(style: BusStyle, field: StyleField, dir: -1 | 1): BusStyle {
  const keys = optionKeys(field) as string[];
  const i = keys.indexOf(style[field] as string);
  const next = keys[(i + dir + keys.length) % keys.length];
  return { ...style, [field]: next } as BusStyle;
}

export const optionName = (style: BusStyle, field: StyleField) =>
  (OPTIONS[field] as Record<string, { name: string }>)[style[field] as string].name;

export const STYLE_KEY = 'busgame.garage';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Load the saved look. Anything missing, unknown or unreadable falls back to the default. */
export function loadStyle(storage: StorageLike | null = defaultStorage()): BusStyle {
  let raw: unknown = null;
  try {
    const s = storage?.getItem(STYLE_KEY);
    raw = s ? JSON.parse(s) : null;
  } catch {
    raw = null;
  }
  const out = { ...DEFAULT_STYLE };
  if (raw && typeof raw === 'object') {
    for (const f of Object.keys(DEFAULT_STYLE) as StyleField[]) {
      const v = (raw as Record<string, unknown>)[f];
      if (typeof v === 'string' && v in OPTIONS[f]) (out as Record<string, string>)[f] = v;
    }
  }
  return out;
}

export function saveStyle(style: BusStyle, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(STYLE_KEY, JSON.stringify(style));
  } catch {
    /* storage full or blocked: the choice still applies this session */
  }
}

/** Which look the bus shows: the boost look always wins over the garage look. */
export function effectiveLook(charm: { boostT: number; transitionT: number }, flickerValue: number, transitionTime: number): 'xpress' | 'custom' {
  if (charm.boostT > 0) return 'xpress';
  if (charm.transitionT > 0 && flickerValue < charm.transitionT / transitionTime) return 'xpress';
  return 'custom';
}
