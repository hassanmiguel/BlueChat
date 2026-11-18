export interface CustomEmoji {
  name: string;
  url: string;
  aliasFor?: string;
  pack?: string;
  source?: string;
}

type EmojiMap = Map<string, CustomEmoji>;

const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const manifestUrl = `${base}emoji/manifest.json`;

let emojis: CustomEmoji[] = [];
let loaded = false;
let pending: Promise<CustomEmoji[]> | null = null;
const listeners = new Set<() => void>();

export const getEmojis = () => emojis;

export const subscribeEmojis = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const notify = () => listeners.forEach((listener) => listener());

const withBase = (value: string) => {
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return `${base}${value.replace(/^\//, '')}`;
};

const cleanName = (value: unknown) =>
  String(value ?? '')
    .replace(/^:+|:+$/g, '')
    .trim()
    .toLowerCase();

const normalizeEntry = (raw: any, key?: string): CustomEmoji | null => {
  if (typeof raw === 'string') {
    const name = cleanName(key ?? raw);
    return name ? { name, url: withBase(raw) } : null;
  }
  if (!raw || typeof raw !== 'object') return null;

  const name = cleanName(raw.name ?? raw.shortcode ?? raw.short_code ?? key);
  const rawUrl = raw.url ?? raw.src ?? raw.imageUrl ?? raw.image_url ?? '';
  const aliasFor = cleanName(raw.alias_for ?? raw.aliasFor);
  const pack = String(raw.pack ?? '').trim();
  const source = String(raw.source ?? '').trim();
  if (!name || (!rawUrl && !aliasFor)) return null;

  return {
    name,
    url: rawUrl ? withBase(String(rawUrl)) : '',
    ...(aliasFor ? { aliasFor } : {}),
    ...(pack ? { pack } : {}),
    ...(source ? { source } : {}),
  };
};

const normalizeManifest = (data: any): CustomEmoji[] => {
  const source = Array.isArray(data)
    ? data
    : Array.isArray(data?.emojis)
      ? data.emojis
      : Array.isArray(data?.emoji)
        ? data.emoji
        : data?.emoji && typeof data.emoji === 'object'
          ? Object.entries(data.emoji).map(([name, value]) =>
              value && typeof value === 'object' ? { name, ...(value as object) } : { name, url: value },
            )
          : [];

  const seen = new Set<string>();
  const result: CustomEmoji[] = [];
  for (const [index, entry] of source.entries()) {
    const normalized = normalizeEntry(entry, typeof entry === 'object' && entry ? String(entry.name ?? index) : undefined);
    if (!normalized || seen.has(normalized.name)) continue;
    seen.add(normalized.name);
    result.push(normalized);
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
};

export const loadCustomEmojis = (force = false): Promise<CustomEmoji[]> => {
  if (loaded && !force) return Promise.resolve(emojis);
  if (pending && !force) return pending;

  pending = (async () => {
    try {
      const response = await fetch(manifestUrl, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Emoji manifest returned ${response.status}`);
      emojis = normalizeManifest(await response.json());
    } catch {
      emojis = [];
    } finally {
      loaded = true;
      pending = null;
      notify();
    }
    return emojis;
  })();

  return pending;
};

export const resolveEmojiUrl = (name: string, map?: EmojiMap): string | null => {
  const lookup = map || new Map(emojis.map((emoji) => [emoji.name, emoji]));
  const visited = new Set<string>();
  let current = cleanName(name);

  while (current && !visited.has(current)) {
    visited.add(current);
    const entry = lookup.get(current);
    if (!entry) return null;
    if (entry.url) return entry.url;
    if (!entry.aliasFor) return null;
    current = entry.aliasFor;
  }
  return null;
};
