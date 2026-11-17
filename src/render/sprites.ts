/**
 * ALL sprites, palettes and the pixel font live here so the art can be swapped in one place.
 *
 * Sprites are text pixel maps: one character per pixel, '.' is transparent, and every other
 * character is a palette key. A "skin" is just a palette override, e.g. BUS_SKINS.party for the
 * future boost form. Original art; reference photos were used for style only.
 */

/** Chunky, saturated NES-style colours. */
export const PALETTE: Record<string, string> = {
  K: '#000000', // outline
  D: '#4a4a4a', // tyre / dark grey
  g: '#7c7c7c', // mid grey
  G: '#bcbcbc', // light grey / chrome
  L: '#fcfcfc', // white
  C: '#fce0a8', // cream trim
  R: '#d82800', // bus red
  r: '#881400', // dark red
  h: '#f85838', // red highlight
  B: '#0058f8', // blue stripe
  b: '#3cbcfc', // glass
  w: '#c4f0fc', // glass glint
  Y: '#fca044', // orange glow
  O: '#fca044', // bus sign-board glow (flickers: see BUS_GLOW)
  y: '#f8b800', // amber / yellow
  V: '#f8d878', // pale yellow
  N: '#00a800', // green
  n: '#005800', // dark green
  T: '#ac7c00', // khaki tarp
  t: '#503000', // brown
  S: '#c8743c', // skin
  M: '#8858d8', // purple dress
  m: '#5830a0', // dark purple
  H: '#6888fc', // helmet blue
  Q: '#f878f8', // pink
  d: '#e09858', // dog fur
};

/** Scene colours (road, roadside, HUD). */
export const SCENE = {
  sky: '#3cbcfc',
  skyLow: '#a4e4fc',
  hill: '#00a844',
  hillDark: '#007828',
  grass: '#00b800',
  grassDark: '#008800',
  dirt: '#b85c28', // laterite red-earth shoulder
  dirtDark: '#883c18',
  asphalt: '#5c5c5c',
  asphaltDark: '#4a4a4a',
  line: '#fcfcfc',
  edge: '#f8b800',
  palmTrunk: '#8c5418',
  palmLeaf: '#00a800',
  palmLeafDark: '#005800',
  bush: '#00a800',
  bushDark: '#005800',
  hud: '#c41c00',
  hudLight: '#f85838',
  hudDark: '#6c0c00',
  lcdBg: '#0c1c4c',
  lcdOn: '#3cfcfc',
  lcdOff: '#183c6c',
  mapBg: '#00a844',
  mapRoad: '#bcbcbc',
  mapDot: '#fc2000',
  text: '#fcfcfc',
  textShadow: '#000000',
  title: '#f8b800',
  overlay: 'rgba(0,0,0,0.55)',
};

/** Sign-board glow levels the renderer flickers between. */
export const BUS_GLOW = ['#f87800', '#fca044', '#fcc070', '#fca044'] as const;

/** Bus wheels (drawn procedurally so they spin): centres relative to the body, radius in px. */
export const BUS_WHEELS = { xs: [13, 50], y: 22, r: 4 } as const;
export const BUS_BODY_H = 22;
/** Full bus height including wheels (body rows 0–21, wheels down to row 26). */
export const BUS_H = BUS_WHEELS.y + BUS_WHEELS.r + 1;

/** Palette overrides for the bus. "party" is ready for the future boost form. */
export const BUS_SKINS: Record<string, Partial<Record<string, string>>> = {
  classic: {},
  party: { R: '#f83898', r: '#a8005c', h: '#fc8cd0', B: '#d800cc', G: '#e8e8e8', C: '#fcfcfc', Y: '#fcfc00' },
};

export type SpriteName = keyof typeof SPRITES;

export const SPRITES = {
  /** Player bus body, 62×22. Wheels are drawn by the renderer (they spin). 'O' = flickering glow. */
  bus: [
    '...KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKOOOKOKOOOKOOOKK',
    'KhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhKKOKOKOOOKOKOKOKK',
    'KrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrKKOOOKOKOKOKOOOKK',
    'KCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCKKKKKKKKKKKKKKKKK',
    'KCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCOCOCOCOCOCOCCK',
    'KRRwwbbbbRwwbbbbRwwbbbbRwwbbbbRwwbbbbRRRKKKKKKRKKKKKKKKKKKKKKK',
    'KRRwbbbbbRwbbbbbRwbbbbbRwbbbbbRwbbbbbRRRKwbbbKRKwwwbbbbbbbbbbK',
    'KRRbbbbbbRbbbbbbRbbbbbbRbbbbbbRbbbbbbRRRKbbbbKRKwbbbbbbbbbbbbK',
    'KRRbbbbbbRbbbbbbRbbbbbbRbbbbbbRbbbbbbRRRKbbbbKRKbbbbbbbbbbbbbK',
    'KRRbbbbbbRbbbbbbRbbbbbbRbbbbbbRbbbbbbRRRKbbbbKRKbbbbbbbbbbbbbK',
    'KRRbbbbbbRbbbbbbRbbbbbbRbbbbbbRbbbbbbRRRKbbbbKRKbbbbbbbbbbbbbK',
    'KRRbbbbbbRbbbbbbRbbbbbbRbbbbbbRbbbbbbRRRKbbbbKRKbbbbbbbbbbbbbK',
    'KCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCRKDDDDKRKKKKKKKKKKKKKKK',
    'KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGRKDDDDKCCCCCCCCCCCCCCCK',
    'KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRKGGGGKGGGGGGGGGGGGGGGK',
    'KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRKDDDDKBBBBBBBBBBBBBBBK',
    'rRRRRRRRKKKKKKKKKKKRRRRRRRRRRRRRRRRRRRRRKDDDDKKKKKKKKKKKRRRRLy',
    'rrRRRRRRKKKKKKKKKKKRRRRRRRRRRRRRRRRRRRRRKDDDDKKKKKKKKKKKRRRRLL',
    'KrrrrrrrKKKKKKKKKKKrrrrrrrrrrrrrrrrrrrrrrrrrrKKKKKKKKKKKrrrrrK',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    'gDDDggg.............................................GGGGGGGGGG',
  ],
  lorry: [
    '..............................................',
    '..............KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    '...yyyyyyy....KVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVK',
    '..KKKKKKKKK...KTTtTTTTtTTTTtTTTTtTTTTtTTTTtTTK',
    '.KKKKKKKKKKKKKKTTtTTTTtTTTTtTTTTtTTTTtTTTTtTTK',
    '.KBBBBBBBBBBBBKTTtTTTTtTTTTtTTTTtTTTTtTTTTtTTK',
    '.KKKKKKKKbbbbBKTTtTTTTtTTTTtTTTTtTTTTtTTTTtTTK',
    '.KKwwbbbKbbbbBKTTtTTTTtTTTTtTTTTtTTTTtTTTTtTTK',
    '.KKbbbbbKbbbbBKTTtTTTTtTTTTtTTTTtTTTTtTTTTtTTK',
    '.KKbbbbbKbbbbBKTTtTTTTtTTTTtTTTTtTTTTtTTTTtTTK',
    '.KKbbbbbKbbbbBKTTtTTTTtTTTTtTTTTtTTTTtTTTTtTTK',
    '.KLLLLLLLLLLLBKTTtTTTTtTTTTtTTTTtTTTTtTTTTtTTK',
    '.KBBBBBBBBBBBBKTTtTTTTtTTTTtTTTTtTTTTtTTTTtTTK',
    'yLBBBBBBBBBBBBKttttttttttttttttttttttttttttttK',
    'LLBBBBBBBBBBBBKttttttttttttttttttttttttttttttK',
    '.KBBBBKKKBBBBBKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    'GGGGGKDDDKBBBBKggggggggKDDDKggggggggKDDDKggggK',
    'GKKKKDGGGDKKKKKKKKKKKKKDGGGDKKKKKKKKDGGGDKKKKK',
    'KKKKKDGgGDK...........KDGgGDK......KDGgGDK....',
    '....KDGGGDK...........KDGGGDK......KDGGGDK....',
    '.....KDDDK.............KDDDK........KDDDK.....',
    '......KKK...............KKK..........KKK......',
  ],
  tuktuk: [
    '....KKKKKKKKKKKKKKKKKK..',
    '...KDDDDDDDDDDDDDDDDDDK.',
    '...KDDDDDDDDDDDDDDDDDDK.',
    '..Kwwbb..KKK.DDDDDDDDDK.',
    '..Kbbbb..KKK.DSSDDDDDDK.',
    '..Kbbbb..SSS.DSSDDDDDDK.',
    '..Kbbbb..SSS.DSSDDDDDDK.',
    '..Kbbbb.yyyyyNNNNDDDDDK.',
    '..Kbbbb.yyyyyNNNNDDDDDK.',
    '..KKKKKKyyyyyNNNNDDDDDK.',
    '.KKKKKKKKKKKKKKKKKKKKKK.',
    'KLLLLLLLLLLLLLLLLLLLLLL.',
    'yyNNNNNNNNNNNNNNNNNNNNRR',
    'yyNNNNNNNNNNNNNNNNNNNNRR',
    'KNnnnnnnnnnnnnnnnnnnnnN.',
    '.KKKKKKKKKKKKKKKKKKKKKK.',
    '..KDDDK.........KDDDK...',
    '..KDGDK.........KDGDK...',
    '..KDDDK.........KDDDK...',
    '...KKK...........KKK....',
  ],
  bike: [
    '..................................',
    '......KKK.........................',
    '......KKK......KKKKK..............',
    '.......S.......HHHHH..............',
    '.....KKKKK.....HHHHK..............',
    '.....HHHHH.....HHHSS..............',
    '.....HHHHH.KKK....SKKK............',
    '.....HHHSS.KKKyNyNyKKK............',
    '........SS.KSSNyNyNKSS............',
    '.KKKMMMMMMM.SSyNyNyNSSSSS.........',
    '.KKKMMMMMMSVVVVyNyNySSSSSdK.......',
    '.KSSMMMMMMSVVVVNyNyN.d..dKdKKK....',
    '.QQQQMMMMMMVVVVNNNNN.ddddddKKK....',
    '.QQQQMMMMMMVVVVBBBBB.dddd.KK.yy...',
    '.QQQQMMMMMMVVVVBBBBB.dddd.KK.yy...',
    '.QQQQmmmmmm....BBBBBBBLLtLKK......',
    '....mmmmmmm....BBBBBBBLLLLKK......',
    '.......KSSKKKSSKKKKKKKKKKKKK......',
    '.......KSSGGGSSGGGGGGGGGGGKK......',
    '.....KKKSSKKKKKKKKKKKKKKKKKKK.....',
    '....KDDDK.DDDGGGGGGDDDD..KDDDK....',
    '...KDggggggggggDDDDDDDD.KDGGGDK...',
    '...KDGgGDK..............KDGgGDK...',
    '...KDGGGDK..............KDGGGDK...',
    '....KDDDK................KDDDK....',
    '.....KKK..................KKK.....',
  ],
  crash: [
    '......Y......',
    '..Y..YLY..Y..',
    '...YYLLLYY...',
    '.YYLLLLLLLYY.',
    '..YLLyyyLLY..',
    'YYLLyyRyyLLYY',
    '..YLLyyyLLY..',
    '.YYLLLLLLLYY.',
    '...YYLLLYY...',
    '..Y..YLY..Y..',
    '......Y......',
  ],
} satisfies Record<string, string[]>;

/** Small palm tree for the roadside (drawn in scene colours). */
export const PALM = [
  '..nn.N....',
  '.NNNNNNn..',
  'NNn.tNNNNn',
  'N..ttt..nN',
  '....t.....',
  '....t.....',
  '...t......',
  '...t......',
  '...t......',
  '...t......',
  '..tt......',
];
export const PALM_PALETTE: Record<string, string> = { N: SCENE.palmLeaf, n: SCENE.palmLeafDark, t: SCENE.palmTrunk };

export interface Glyph {
  w: number;
  h: number;
  /** Row-major on/off pixels, length w*h. */
  bits: boolean[];
}
export type Font = Record<string, Glyph>;

function buildFont(src: Record<string, string[]>): Font {
  return Object.fromEntries(
    Object.entries(src).map(([ch, rows]) => {
      const w = rows[0].length;
      return [ch, { w, h: rows.length, bits: rows.join('').split('').map((c) => c === '#') }];
    }),
  );
}

/** 3-bit rows → '#' strings, for the compact 3×5 glyphs. */
const r3 = (bits: string) => (bits.match(/.{3}/g) ?? []).map((r) => r.replace(/1/g, '#').replace(/0/g, '.'));

/**
 * Small HUD font: 5px tall, mostly 3px wide. M, N, W and Z are wider because they can't be told
 * apart from H and friends in 3 columns.
 */
export const FONT_SMALL: Font = buildFont({
  ...Object.fromEntries(Object.entries({
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
    '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001010010',
    '8': '111101111101111', '9': '111101111001111',
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
    E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
    I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
    S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010',
    X: '101101010101101', Y: '101101010010010',
    ' ': '000000000000000', '!': '010010010000010', '?': '110001010000010', '-': '000000111000000',
    '/': '001001010100100', '+': '000010111010000', '=': '000111000111000', '(': '010100100100010',
    ')': '010001001001010', '^': '010111010010010', '<': '001010100010001', '>': '100010001010100',
    '*': '000101010101000',
  }).map(([k, v]) => [k, r3(v)])),
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  Z: ['####', '...#', '.##.', '#...', '####'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '.#', '#.'],
  ':': ['.', '#', '.', '#', '.'],
  "'": ['#', '#', '.', '.', '.'],
  '@': ['.###.', '#.#.#', '#.###', '#....', '.###.'],
  '#': ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'],
  $: ['.####', '#.#..', '.###.', '..#.#', '####.'],
  '%': ['#...#', '...#.', '..#..', '.#...', '#...#'],
  '&': ['.##..', '#....', '.##.#', '#..#.', '.##.#'],
});

/** 5×7 title font. */
export const FONT_BIG: Font = buildFont({
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  ':': ['.', '.', '#', '.', '.', '#', '.'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
});
