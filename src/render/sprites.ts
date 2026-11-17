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
  Y: '#fca044', // orange glow (sign board)
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

/** Palette overrides for the bus. "party" is ready for the future boost form. */
export const BUS_SKINS: Record<string, Partial<Record<string, string>>> = {
  classic: {},
  party: { R: '#f83898', r: '#a8005c', h: '#fc8cd0', B: '#d800cc', G: '#e8e8e8', C: '#fcfcfc', Y: '#fcfc00' },
};

export type SpriteName = keyof typeof SPRITES;

export const SPRITES = {
  bus: [
    '...KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.',
    '..KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKYKYKKYKYKK.',
    'KhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhKrYrYYrYrYK.',
    'KrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrKKKKKKKKKKKK',
    'KCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCYCYCYCYCK',
    'KRRwwbbbRwwbbbRwwbbbRwwbbbRwwbbbKKKKKRKKKKKKKKKK',
    'KRRwbbbbRwbbbbRwbbbbRwbbbbRwbbbbKwbbKRKwwbbbbbKK',
    'KRRbbbbbRbbbbbRbbbbbRbbbbbRbbbbbKbbbKRKwbbbbbbKK',
    'KRRbbbbbRbbbbbRbbbbbRbbbbbRbbbbbKbbbKRKbbbbbbbKK',
    'KRRbbbbbRbbbbbRbbbbbRbbbbbRbbbbbKbbbKRKbbbbbbbKK',
    'KCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCKbbbKRKKKKKKKKKK',
    'KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKDDDKCCCCCCCCCCK',
    'KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKDDDKGGGGGGGGGGK',
    'KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKGGGKBBBBBBBBBBK',
    'rRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRKDDDKRRRRRRRRRLy',
    'rrRRRRKKKKKKKKKRRRRRRRRRRRRRRRRRKDDKKKKKKKKKRRLL',
    'KrrrrrKKKDDDKKKrrrrrrrrrrrrrrrrrrrrKKKDDDKKKrrrK',
    'KKKKKKKKDGGGDKKKKKKKKKKKKKKKKKKKKKKKKDGGGDKKKKKK',
    '.ggggggKDGgGDK......................KDGgGDKGGGGG',
    '.......KDGGGDK......................KDGGGDKKKKKK',
    '........KDDDK........................KDDDK......',
    '.........KKK..........................KKK.......',
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

/** 3×5 pixel font. Each glyph is 5 rows of 3 bits. */
const FONT_SRC: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001010010',
  '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  ' ': '000000000000000', '.': '000000000000010', ',': '000000000010100', '!': '010010010000010',
  '?': '110001010000010', ':': '000010000010000', '-': '000000111000000', '/': '001001010100100',
  "'": '010010000000000', '+': '000010111010000', '=': '000111000111000', '(': '010100100100010',
  ')': '010001001001010', '^': '010111010010010', 'v': '010010010111010', '<': '001010100010001',
  '>': '100010001010100', '*': '000101010101000',
};

export const FONT: Record<string, boolean[]> = Object.fromEntries(
  Object.entries(FONT_SRC).map(([k, bits]) => [k, [...bits].map((b) => b === '1')]),
);
export const FONT_W = 3;
export const FONT_H = 5;
