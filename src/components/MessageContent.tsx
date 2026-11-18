import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { getEmojis, resolveEmojiUrl, subscribeEmojis } from '../services/emojiService';
import './emojiPicker.css';

export const useEmojiMap = () => {
  const emojis = useSyncExternalStore(subscribeEmojis, getEmojis, getEmojis);
  return useMemo(() => new Map(emojis.map((emoji) => [emoji.name, emoji])), [emojis]);
};

const EMOJI_SPLIT = /(:([a-zA-Z0-9_+-]+):)/g;

export const renderEmojiText = (text: string, map: ReturnType<typeof useEmojiMap>): ReactNode[] => {
  if (!text) return [];
  const parts = text.split(EMOJI_SPLIT);

  return parts.map((part, index) => {
    if (index % 3 === 2) return null;
    if (index % 3 === 1) {
      const name = parts[index + 1]?.toLowerCase();
      const url = name ? resolveEmojiUrl(name, map) : null;
      if (url) {
        return (
          <img
            key={`emoji-${index}`}
            className="custom-emoji"
            src={url}
            alt={part}
            title={part}
            draggable={false}
          />
        );
      }
    }
    return part;
  });
};

export const useRichContent = () => {
  const map = useEmojiMap();

  return useCallback((content: string): ReactNode => {
    if (content.includes('```')) {
      return content.split('```').map((part, index) => {
        if (index % 2 === 1) {
          const lines = part.split('\n');
          const lang = lines[0]?.trim();
          const code = lang ? lines.slice(1).join('\n') : part;
          return (
            <pre key={`code-${index}`} className="bg-dc-darker border border-dc-divider/30 rounded-lg p-3 my-1 overflow-x-auto">
              {lang && <div className="text-xs text-dc-text-muted mb-1">{lang}</div>}
              <code className="text-sm text-dc-text">{renderEmojiText(code, map)}</code>
            </pre>
          );
        }
        return <span key={`text-${index}`}>{renderEmojiText(part, map)}</span>;
      });
    }

    if (content.includes('**')) {
      return content.split(/\*\*(.*?)\*\*/g).map((part, index) =>
        index % 2 === 1
          ? <strong key={`bold-${index}`} className="font-bold">{renderEmojiText(part, map)}</strong>
          : renderEmojiText(part, map),
      );
    }

    if (content.includes('@')) {
      return content.split(/(@\w+)/g).map((part, index) =>
        part.startsWith('@')
          ? (
              <span key={`mention-${index}`} className="bg-dc-brand/20 text-dc-brand rounded px-0.5 hover:bg-dc-brand/30 cursor-pointer">
                {renderEmojiText(part, map)}
              </span>
            )
          : renderEmojiText(part, map),
      );
    }

    return renderEmojiText(content, map);
  }, [map]);
};

export default function MessageContent({ content }: { content: string }) {
  const render = useRichContent();
  return <>{render(content)}</>;
}
