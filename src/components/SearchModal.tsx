import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { useChatStore } from '../stores/chatStore';
import { api } from '../services/api';
import { X, Search, User, Calendar, Paperclip, Link as LinkIcon, AtSign, Hash, Server as ServerIcon, FileText } from 'lucide-react';

type Scope = 'all' | 'users' | 'messages' | 'servers' | 'channels' | 'files';

const SCOPES: { id: Scope; label: string; icon: typeof Search }[] = [
  { id: 'all', label: 'All', icon: Search },
  { id: 'users', label: 'People', icon: User },
  { id: 'messages', label: 'Messages', icon: Hash },
  { id: 'servers', label: 'Servers', icon: ServerIcon },
  { id: 'channels', label: 'Channels', icon: Hash },
  { id: 'files', label: 'Files', icon: FileText },
];

export default function SearchModal() {
  const { showSearchModal, toggleSearchModal, openProfile } = useUIStore();
  const { servers, setActiveServer, setActiveChannel, setActiveDm, directMessages } = useChatStore();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [filters, setFilters] = useState({ from: '', before: '', after: '', attachments: false, images: false, links: false, mentions: false });
  const [results, setResults] = useState<any>({ users: [], messages: [], servers: [], channels: [], files: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!showSearchModal || !query.trim()) {
      setResults({ users: [], messages: [], servers: [], channels: [], files: [] });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    api.globalSearch(query.trim(), {
      fromUserId: filters.from,
      before: filters.before,
      after: filters.after,
      attachments: filters.attachments,
      images: filters.images,
      links: filters.links,
      mentions: filters.mentions,
    }).then((response) => {
      if (cancelled) return;
      if (!response.success || !response.data) {
        setError(response.error || 'Search failed');
        setResults({ users: [], messages: [], servers: [], channels: [], files: [] });
      } else {
        setResults(response.data);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [showSearchModal, query, filters, scope]);

  const openResult = (kind: Scope, item: any) => {
    if (kind === 'users') {
      openProfile(item.id);
    } else if (kind === 'messages') {
      const dm = directMessages.find((entry) => entry.id === item.channelId);
      if (dm) setActiveDm(dm.id);
      else {
        const server = servers.find((entry) => entry.channels.some((channel) => channel.id === item.channelId));
        if (server) {
          setActiveServer(server.id);
          setActiveChannel(item.channelId);
        }
      }
    } else if (kind === 'servers') {
      setActiveServer(item.id);
    } else if (kind === 'channels') {
      const server = servers.find((entry) => entry.id === item.serverId);
      if (server) {
        setActiveServer(server.id);
        setActiveChannel(item.id);
      }
    } else if (kind === 'files') {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }
    toggleSearchModal();
  };

  const sections: Scope[] = scope === 'all' ? ['users', 'messages', 'servers', 'channels', 'files'] : [scope];
  const total = sections.reduce((sum, key) => sum + (results[key]?.length || 0), 0);
  const hasResults = total > 0;

  return (
    <AnimatePresence>
      {showSearchModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/50 px-4"
          onClick={toggleSearchModal}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -20 }}
            className="w-full max-w-3xl max-h-[78vh] bg-dc-dark rounded-lg overflow-hidden shadow-2xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4 border-b border-dc-divider/30">
              <div className="flex items-center gap-3 bg-dc-darker rounded-lg px-4 py-2.5">
                <Search className="w-5 h-5 text-dc-text-muted shrink-0" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search people, messages, servers, channels and files..."
                  className="flex-1 bg-transparent text-dc-text placeholder-dc-text-muted/50 border-none text-sm outline-none"
                  autoFocus
                />
                <button onClick={toggleSearchModal} className="text-dc-text-muted hover:text-dc-text"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex gap-1 mt-3 flex-wrap">
                {SCOPES.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setScope(item.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      scope === item.id ? 'bg-dc-brand text-white' : 'bg-dc-input text-dc-text-muted hover:text-dc-text'
                    }`}
                  >
                    <item.icon className="w-3 h-3" />
                    {item.label}
                  </button>
                ))}
              </div>

              {(scope === 'messages' || scope === 'all') && (
                <div className="flex gap-2 mt-3 flex-wrap text-xs">
                  <input value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} placeholder="From user ID" className="bg-dc-input rounded px-2 py-1 text-dc-text w-36" />
                  <input type="date" value={filters.before} onChange={(e) => setFilters({ ...filters, before: e.target.value })} className="bg-dc-input rounded px-2 py-1 text-dc-text" />
                  <input type="date" value={filters.after} onChange={(e) => setFilters({ ...filters, after: e.target.value })} className="bg-dc-input rounded px-2 py-1 text-dc-text" />
                  {([
                    ['attachments', Paperclip], ['images', FileText], ['links', LinkIcon], ['mentions', AtSign],
                  ] as const).map(([key, Icon]) => (
                    <button
                      key={key}
                      onClick={() => setFilters({ ...filters, [key]: !filters[key] })}
                      className={`flex items-center gap-1 rounded px-2 py-1 ${filters[key] ? 'bg-dc-brand text-white' : 'bg-dc-input text-dc-text-muted'}`}
                    >
                      <Icon size={12} /> {key}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {!query.trim() ? (
                <div className="p-10 text-center">
                  <Search className="w-12 h-12 text-dc-text-muted mx-auto mb-3 opacity-50" />
                  <p className="text-dc-text-muted">Search across blueChat</p>
                  <p className="text-xs text-dc-text-muted mt-1">Results link back to the original content</p>
                </div>
              ) : loading ? (
                <div className="p-10 text-center text-sm text-dc-text-muted">Searching...</div>
              ) : error ? (
                <div className="p-10 text-center text-sm text-dc-red">{error}</div>
              ) : !hasResults ? (
                <div className="p-10 text-center text-sm text-dc-text-muted">No results for "{query}"</div>
              ) : (
                sections.map((key) => {
                  const items = results[key] || [];
                  if (!items.length) return null;
                  return (
                    <section key={key} className="mb-4">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-dc-text-muted px-2 py-1">{key}</h3>
                      {items.map((item: any) => (
                        <button
                          key={item.id}
                          onClick={() => openResult(key, item)}
                          className="w-full text-left rounded-lg px-3 py-2 hover:bg-dc-hover transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-dc-text truncate">
                              {item.username ? `@${item.username}` : item.name || item.filename || item.content?.slice(0, 80)}
                            </span>
                            <span className="text-xs text-dc-text-muted shrink-0">
                              {item.channel?.server?.name || item.server?.name || item.channel?.name || ''}
                            </span>
                          </div>
                          {(item.content || item.description || item.bio) && (
                            <p className="text-xs text-dc-text-muted mt-0.5 truncate">{item.content || item.description || item.bio}</p>
                          )}
                        </button>
                      ))}
                    </section>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
