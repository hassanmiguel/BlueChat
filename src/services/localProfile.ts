/**
 * Small, dependency-free persistence helpers for things the user customises.
 * The server remains the source of truth, but keeping a local copy means a
 * profile picture or background can never disappear just because a settings
 * panel was closed (or an upload request failed).
 */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type DensityChoice = 'comfortable' | 'compact' | 'spacious';
export type SoundEvent = 'notification' | 'messageSent' | 'calling' | 'login';

export interface AppPrefs {
  theme: ThemeChoice;
  accent: string;
  density: DensityChoice;
  bannerBlur: number;
  bannerDarken: number;
  notifications: Record<string, boolean>;
  /** Per-event sound file paths relative to public/sounds. 'off' mutes that event. */
  soundChoices: Partial<Record<SoundEvent, string>>;
  language: string;
  timezone: string;
  dateFormat: string;
  weekStart: string;
}

export interface MediaCache {
  /** Last successfully saved (or optimistically chosen) avatar URL. */
  avatar?: string;
  /** Last successfully saved (or optimistically chosen) banner URL. */
  banner?: string;
  /** False when a local change has not been confirmed by the server yet. */
  synced: boolean;
}

const PREFS_KEY = 'bluechat:prefs:v1';
const mediaKey = (userId: string) => `bluechat:media:${userId}`;

const DEFAULT_PREFS: AppPrefs = {
  theme: 'dark',
  accent: '#3A86FF',
  density: 'comfortable',
  bannerBlur: 6,
  bannerDarken: 50,
  notifications: {
    dmMessages: true,
    mentions: true,
    serverMessages: false,
    push: true,
    emailDigest: false,
    sounds: true,
  },
  soundChoices: {},
  language: 'en-US',
  timezone: 'auto',
  dateFormat: 'MMM d, yyyy',
  weekStart: 'monday',
};

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

export const readPrefs = (): AppPrefs => {
  if (!canUseStorage()) return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<AppPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      notifications: { ...DEFAULT_PREFS.notifications, ...(parsed.notifications || {}) },
      soundChoices: { ...DEFAULT_PREFS.soundChoices, ...(parsed.soundChoices || {}) },
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const writePrefs = (patch: Partial<AppPrefs>): AppPrefs => {
  const next = { ...readPrefs(), ...patch };
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* Private browsing or a full quota – the app still works in memory. */
    }
    window.dispatchEvent(new CustomEvent('bluechat:prefs-changed'));
  }
  return next;
};

export const readMedia = (userId?: string | null): MediaCache | null => {
  if (!userId || !canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(mediaKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MediaCache>;
    return {
      avatar: parsed.avatar,
      banner: parsed.banner,
      synced: parsed.synced !== false,
    };
  } catch {
    return null;
  }
};

export const writeMedia = (userId: string | null | undefined, patch: Partial<MediaCache>): MediaCache | null => {
  if (!userId) return null;
  const current = readMedia(userId) || { synced: true };
  const next: MediaCache = { ...current, ...patch };
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(mediaKey(userId), JSON.stringify(next));
    } catch {
      /* Ignore storage errors; the in-memory store still gets the update. */
    }
  }
  return next;
};

export const clearMediaCache = (userId?: string | null) => {
  if (!userId || !canUseStorage()) return;
  try {
    window.localStorage.removeItem(mediaKey(userId));
  } catch {
    /* no-op */
  }
};
