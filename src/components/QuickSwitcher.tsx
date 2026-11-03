import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';
import { Hash, Volume2, Megaphone, BookOpen, Search } from 'lucide-react';

export default function QuickSwitcher() {
  const [show, setShow] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { servers, activeServerId, setActiveChannel, setActiveServer } = useChatStore();
  const activeServer = servers.find(s => s.id === activeServerId);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setShow(prev => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape') {
        setShow(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (show) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [show]);

  const channels = activeServer?.channels.filter(c => c.type !== 'voice') || [];
  const filteredChannels = query.trim()
    ? channels.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : channels;

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'text': return <Hash className="w-5 h-5 text-dc-text-muted" />;
      case 'voice': return <Volume2 className="w-5 h-5 text-dc-text-muted" />;
      case 'announcement': return <Megaphone className="w-5 h-5 text-dc-text-muted" />;
      case 'forum': return <BookOpen className="w-5 h-5 text-dc-text-muted" />;
      default: return <Hash className="w-5 h-5 text-dc-text-muted" />;
    }
  };

  const handleSelect = (channelId: string) => {
    setActiveChannel(channelId);
    setShow(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredChannels.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filteredChannels[selectedIndex]) {
      handleSelect(filteredChannels[selectedIndex].id);
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50"
          onClick={() => setShow(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 25 }}
            className="w-[500px] bg-dc-dark rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="p-3 border-b border-dc-divider/30">
              <div className="flex items-center gap-3 bg-dc-darker rounded-lg px-4 py-2.5">
                <Search className="w-5 h-5 text-dc-text-muted shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                  onKeyDown={handleKeyDown}
                  placeholder={`Where would you like to go in ${activeServer?.name || 'the server'}?`}
                  className="flex-1 bg-transparent text-dc-text placeholder-dc-text-muted/50 border-none text-sm"
                />
              </div>
            </div>

            {/* Results */}
            <div className="max-h-[300px] overflow-y-auto p-2">
              {filteredChannels.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-dc-text-muted text-sm">No channels found</p>
                </div>
              ) : (
                filteredChannels.map((channel, i) => (
                  <button
                    key={channel.id}
                    onClick={() => handleSelect(channel.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-colors ${
                      i === selectedIndex ? 'bg-dc-active' : 'hover:bg-dc-hover'
                    }`}
                  >
                    {getChannelIcon(channel.type)}
                    <span className="text-sm text-white font-medium">{channel.name}</span>
                    {channel.topic && (
                      <span className="text-xs text-dc-text-muted truncate ml-auto max-w-[200px]">{channel.topic}</span>
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-2 border-t border-dc-divider/30 flex items-center gap-4 text-xs text-dc-text-muted">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-dc-input rounded font-mono border border-dc-divider/30">↑↓</kbd>
                to navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-dc-input rounded font-mono border border-dc-divider/30">↵</kbd>
                to select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-dc-input rounded font-mono border border-dc-divider/30">esc</kbd>
                to close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
