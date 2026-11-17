/** One-line captions shown the first time each thing appears in a run. */
export const CAPTIONS = {
  lorry: 'LORRY: BRAKES ARE OPTIONAL.',
  tuktuk: 'TUK-TUK: INDICATORS ARE A SUGGESTION.',
  bike: 'FAMILY OF SIX. PLUS THE DOG.',
  convoy: 'VIP CONVOY: EVERYONE ELSE, MOVE!',
  rival: 'SAME ROUTE, SAME PASSENGERS. OVERTAKE!',
  chilli: 'CHILLI: WARDS OFF BAD LUCK.',
  lime: 'LIME: COMPLETES THE CHARM!',
} as const;

export type CaptionKey = keyof typeof CAPTIONS;

/** Seconds each caption stays up. */
export const CAPTION_TIME = 2.6;

/** Fictional campaign promises shouted from the convoy. */
export const PROMISES = ['FREE BUS FOR ALL!!', 'NO MORE POTHOLES!!', 'FREE WIFI ON EVERY BUS!!', 'VOTE FOR ME, MALLI!!'] as const;

/** What the conductor shouts when the boost starts. */
export const CONDUCTOR_SHOUTS = ['FULL SPEED, MALLI!!', 'PITAKOTUWA!!', 'ISSARAHATA YANNA!!'] as const;

/** Bonus for overtaking a same-route rival bus. */
export const OVERTAKE_BONUS = 50;

export function pick<T>(list: readonly T[], id: number): T {
  return list[(Math.imul(id + 7, 2654435761) >>> 0) % list.length];
}
