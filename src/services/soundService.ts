import { readPrefs, type SoundEvent } from './localProfile';

export type { SoundEvent } from './localProfile';

export interface CatalogSound {
  path: string;
  name: string;
  group: string;
}

export const SOUND_OFF = 'off';

const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const extensions = ['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.webm', '.flac'];
const variants = (name: string) => extensions.map((ext) => `${name}${ext}`);

const FILES: Record<SoundEvent, string[]> = {
  notification: variants('notification'),
  messageSent: [
    ...variants('message-sent'),
    ...variants('message_sent'),
    ...variants('messageSent'),
    ...variants('send'),
  ],
  calling: [
    ...variants('calling'),
    ...variants('call'),
    ...variants('incoming-call'),
    ...variants('ringtone'),
    ...variants('ring'),
  ],
  login: [
    ...variants('login'),
    ...variants('sign-in'),
    ...variants('signin'),
    ...variants('welcome'),
  ],
};

const resolved = new Map<SoundEvent, string | null>();
let callAudio: HTMLAudioElement | null = null;
let callToken = 0;
let gestureBound = false;
let catalogPromise: Promise<CatalogSound[]> | null = null;

const soundUrl = (file: string) =>
  `${base}sounds/${file.split('/').map((part) => encodeURIComponent(part)).join('/')}`;

/** Sounds discovered in public/sounds. The index is regenerated when files change. */
export const getSoundCatalog = (force = false): Promise<CatalogSound[]> => {
  if (catalogPromise && !force) return catalogPromise;
  catalogPromise = (async () => {
    try {
      const response = await fetch(`${base}sounds/index.json`, { cache: 'no-cache' });
      if (!response.ok) return [];
      const data = await response.json();
      const list = Array.isArray(data) ? data : Array.isArray(data?.sounds) ? data.sounds : [];
      return list.filter((item: any) => item && typeof item.path === 'string' && typeof item.name === 'string');
    } catch {
      return [];
    }
  })();
  return catalogPromise;
};

const soundsEnabled = () => {
  try {
    return readPrefs().notifications.sounds !== false;
  } catch {
    return true;
  }
};

const resolveSoundUrl = async (event: SoundEvent): Promise<string | null> => {
  if (typeof window === 'undefined') return null;

  const choice = readPrefs().soundChoices?.[event];
  if (choice === SOUND_OFF) return null;
  if (choice) return soundUrl(choice);

  const cached = resolved.get(event);
  if (cached !== undefined) return cached;

  for (const file of FILES[event]) {
    const url = soundUrl(file);
    try {
      const response = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
      if (!response.ok) continue;

      const type = response.headers.get('content-type')?.toLowerCase() || '';
      // Vite's SPA fallback can return index.html for a missing static file.
      if (type.includes('text/html')) continue;
      if (type && !/^(audio\/|video\/|application\/octet-stream)/.test(type)) continue;

      resolved.set(event, url);
      return url;
    } catch {
      /* Try the next filename. */
    }
  }

  resolved.set(event, null);
  return null;
};

export const clearSoundCache = () => {
  resolved.clear();
  stopCallingSound();
};

/** Play a catalog sound for the settings preview, even if sounds are muted globally. */
export const previewSound = async (file: string): Promise<boolean> => {
  if (typeof window === 'undefined' || !file || file === SOUND_OFF) return false;
  try {
    const audio = new Audio(soundUrl(file));
    audio.volume = 0.75;
    await audio.play();
    return true;
  } catch {
    return false;
  }
};

export const playSound = async (
  event: SoundEvent,
  options: { volume?: number; loop?: boolean } = {},
): Promise<HTMLAudioElement | null> => {
  if (!soundsEnabled()) return null;
  const url = await resolveSoundUrl(event);
  if (!url) return null;

  const audio = new Audio(url);
  audio.volume = options.volume ?? 0.7;
  audio.loop = Boolean(options.loop);
  try {
    await audio.play();
    return audio;
  } catch {
    // Browsers can block audio until the first user gesture. The one-time
    // unlock below makes later sounds work; missing/blocked audio is never fatal.
    return null;
  }
};

export const startCallingSound = async () => {
  stopCallingSound();
  const token = callToken;
  const audio = await playSound('calling', { loop: true, volume: 0.6 });
  if (token !== callToken) {
    audio?.pause();
    return;
  }
  callAudio = audio;
};

export const stopCallingSound = () => {
  callToken += 1;
  if (!callAudio) return;
  callAudio.pause();
  callAudio.currentTime = 0;
  callAudio = null;
};

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export const primeAudioOnGesture = () => {
  if (gestureBound || typeof document === 'undefined') return;
  gestureBound = true;

  const unlock = () => {
    try {
      void new Audio(SILENT_WAV).play().catch(() => undefined);
    } catch {
      /* Ignore browsers that refuse even a silent unlock. */
    }
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };

  document.addEventListener('pointerdown', unlock, { once: true, capture: true, passive: true });
  document.addEventListener('keydown', unlock, { once: true, capture: true });
};
