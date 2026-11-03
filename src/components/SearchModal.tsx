import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { useChatStore } from '../stores/chatStore';
import { X, Search, Hash, User, Calendar, Filter } from 'lucide-react';

export default function SearchModal() {
  const { showSearchModal, toggleSearchModal } = useUIStore();
  const { messages, activeChannelId, activeServerId, servers, allUsers } = useChatStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'user' | 'has' | 'before' | 'after'>('all');

  const activeServer = servers.find(s => s.id === activeServerId);
  const channelMessages = messages[activeChannelId || ''] || [];

  const filteredMessages = query.trim()
    ? channelMessages.filter(msg => {
        if (filter === 'user') {
          return msg.author.username.toLowerCase().includes(query.toLowerCase());
        }
        return msg.content.toLowerCase().includes(query.toLowerCase());
      })
    : [];

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const quickFilters = [
    { id: 'all', label: 'All Messages', icon: Search },
    { id: 'user', label: 'From User', icon: User },
    { id: 'has', label: 'Has Link', icon: Filter },
    { id: 'before', label: 'Before Date', icon: Calendar },
    { id: 'after', label: 'After Date', icon: Calendar },
  ];

  return (
    <AnimatePresence>
      {showSearchModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50"
          onClick={toggleSearchModal}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -20 }}
            className="w-[600px] max-h-[70vh] bg-dc-dark rounded-lg overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="p-4 border-b border-dc-divider/30">
              <div className="flex items-center gap-3 bg-dc-darker rounded-lg px-4 py-2.5">
                <Search className="w-5 h-5 text-dc-text-muted shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search messages..."
                  className="flex-1 bg-transparent text-dc-text placeholder-dc-text-muted/50 border-none text-sm"
                  autoFocus
                />
                <button onClick={toggleSearchModal} className="text-dc-text-muted hover:text-dc-text">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Filters */}
              <div className="flex gap-1 mt-3 flex-wrap">
                {quickFilters.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id as any)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      filter === f.id ? 'bg-dc-brand text-white' : 'bg-dc-input text-dc-text-muted hover:text-dc-text'
                    }`}
                  >
                    <f.icon className="w-3 h-3" />
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {query.trim() === '' ? (
                <div className="p-8 text-center">
                  <Search className="w-12 h-12 text-dc-text-muted mx-auto mb-3 opacity-50" />
                  <p className="text-dc-text-muted">Search for messages in this channel</p>
                  <p className="text-xs text-dc-text-muted mt-1">Use filters to narrow results</p>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-dc-text-muted">No results found for "{query}"</p>
                </div>
              ) : (
                <div className="p-2">
                  <p className="text-xs text-dc-text-muted px-2 py-1">{filteredMessages.length} results</p>
                  {filteredMessages.map(msg => (
                    <div key={msg.id} className="p-3 rounded-lg hover:bg-dc-hover transition-colors cursor-pointer">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-5 h-5 rounded-full bg-dc-brand flex items-center justify-center text-white text-xs font-bold">
                          {msg.author.username[0]}
                        </div>
                        <span className="text-sm font-medium text-white">{msg.author.username}</span>
                        <span className="text-xs text-dc-text-muted">{formatTime(msg.timestamp)}</span>
                      </div>
                      <p className="text-sm text-dc-text ml-7">
                        {msg.content.split(new RegExp(`(${query})`, 'gi')).map((part, i) => 
                          part.toLowerCase() === query.toLowerCase() ? (
                            <mark key={i} className="bg-dc-brand/30 text-white rounded px-0.5">{part}</mark>
                          ) : part
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
