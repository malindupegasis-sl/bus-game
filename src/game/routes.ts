/**
 * Routes. Gameplay is identical on every route; a route changes the scenery, the route number on
 * the sign boards (yours and the rival buses'), and which high score you're chasing.
 */
export const ROUTES = {
  '138': { number: '138', name: '138 COLOMBO CITY', button: 'ROUTE 138 CITY', theme: 'city' },
  '1': { number: '1', name: 'COLOMBO - KANDY', button: 'ROUTE 1 KANDY', theme: 'hills' },
} as const;

export type RouteId = keyof typeof ROUTES;
export type Theme = (typeof ROUTES)[RouteId]['theme'];
/** Explicit order (JS would sort the number-like keys as '1' before '138'). */
export const ROUTE_IDS: RouteId[] = ['138', '1'];
export const DEFAULT_ROUTE: RouteId = '138';

export const nextRoute = (r: RouteId, dir: 1 | -1 = 1): RouteId =>
  ROUTE_IDS[(ROUTE_IDS.indexOf(r) + dir + ROUTE_IDS.length) % ROUTE_IDS.length];

export const ROUTE_KEY = 'busgame.route';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadRoute(storage: StorageLike | null = defaultStorage()): RouteId {
  try {
    const v = storage?.getItem(ROUTE_KEY);
    return v && v in ROUTES ? (v as RouteId) : DEFAULT_ROUTE;
  } catch {
    return DEFAULT_ROUTE;
  }
}

export function saveRoute(r: RouteId, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(ROUTE_KEY, r);
  } catch {
    /* ignore */
  }
}
