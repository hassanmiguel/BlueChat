import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Search } from 'lucide-react';
import {
  getEmojis,
  loadCustomEmojis,
  resolveEmojiUrl,
  subscribeEmojis,
  type CustomEmoji,
} from '../services/emojiService';
import './emojiPicker.css';

interface EmojiPickerProps {
  onSelect: (value: string) => void;
  quickEmojis?: string[];
  compact?: boolean;
}

const DEFAULT_QUICK = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🚀'];
const PAGE_SIZE = 120;

export default function EmojiPicker({ onSelect, quickEmojis = DEFAULT_QUICK, compact = false }: EmojiPickerProps) {
  const emojis = useSyncExternalStore(subscribeEmojis, getEmojis, getEmojis);
  const [query, setQuery] = useState('');
  const [pack, setPack] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    void loadCustomEmojis();
  }, []);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, pack]);

  const map = useMemo(() => new Map(emojis.map((emoji) => [emoji.name, emoji])), [emojis]);
  const packs = useMemo(
    () =>
      Array.from(new Set(emojis.map((emoji) => emoji.pack).filter((name): name is string => Boolean(name)))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [emojis],
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return emojis.filter((emoji) => {
      if (pack && emoji.pack !== pack) return false;
      if (!term) return true;
      return emoji.name.includes(term) || emoji.aliasFor?.includes(term) || emoji.pack?.toLowerCase().includes(term);
    });
  }, [emojis, query, pack]);

  const renderCustom = (emoji: CustomEmoji) => (
    <button
      key={emoji.name}
      type="button"
      title={emoji.pack ? `:${emoji.name}: · ${emoji.pack}` : `:${emoji.name}:`}
      aria-label={`:${emoji.name}:`}
      onClick={() => onSelect(`:${emoji.name}:`)}
    >
      <img
        src={resolveEmojiUrl(emoji.name, map) || emoji.url}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
      />
    </button>
  );

  return (
    <div
      className={`emoji-picker${compact ? ' compact' : ''}`}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <label className="emoji-picker-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji"
          aria-label="Search emoji"
        />
      </label>

      {packs.length > 0 && (
        <select
          className="emoji-picker-select"
          value={pack}
          onChange={(event) => setPack(event.target.value)}
          aria-label="Filter emoji by pack"
        >
          <option value="">All packs ({emojis.length})</option>
          {packs.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}

      <div className="emoji-picker-group">
        <span>QUICK</span>
        <div className="emoji-picker-grid">
          {quickEmojis.map((emoji) => (
            <button key={emoji} type="button" title={emoji} onClick={() => onSelect(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="emoji-picker-group">
        <span>CUSTOM{emojis.length > 0 ? ` (${filtered.length})` : ''}</span>
        {filtered.length > 0 ? (
          <>
            <div className="emoji-picker-grid custom">{filtered.slice(0, visible).map(renderCustom)}</div>
            {filtered.length > visible && (
              <button
                type="button"
                className="emoji-picker-more"
                onClick={() => setVisible((value) => value + PAGE_SIZE)}
              >
                Show more ({filtered.length - visible} left)
              </button>
            )}
          </>
        ) : (
          <p className="emoji-picker-empty">
            {emojis.length === 0
              ? 'Import emoji with npm run emoji:import:gg or npm run emoji:import.'
              : 'No custom emoji matches that search.'}
          </p>
        )}
      </div>
    </div>
  );
}
