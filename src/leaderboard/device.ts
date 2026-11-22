const KEY = 'busgame.device';
let memory: string | null = null;

/**
 * A random id for this device (32 hex characters), used only so the play counter can rate-limit
 * per device. It says nothing about the player; the database stores only a hash of it, for an hour.
 */
export function deviceId(): string {
  if (memory) return memory;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^[0-9a-f]{32}$/.test(saved)) return (memory = saved);
  } catch {
    /* storage blocked: an id for this visit only */
  }
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  memory = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    localStorage.setItem(KEY, memory);
  } catch {
    /* ignore */
  }
  return memory;
}
