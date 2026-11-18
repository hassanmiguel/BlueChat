import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, Check, CheckCheck, Inbox, Loader2, MessageCircle,
  RefreshCw, Search, Send, Shuffle, Sparkles, UserPlus, Users, X,
} from 'lucide-react';
import { api, type DiscoveredUser } from '../services/api';
import { useActivityStore } from '../stores/activityStore';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import type { Friend } from '../types';
import Avatar from '../components/Avatar';
import './addFriend.css';

type Mode = 'discover' | 'requests';
type Filter = 'all' | 'online' | 'mutual';

const mediaOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
const avatarUrl = (value?: string | null) => {
  if (!value) return '';
  if (/^(https?:|data:|blob:)/.test(value)) return value;
  return `${mediaOrigin}${value.startsWith('/') ? value : `/${value}`}`;
};

const statusTone = (status: string) => {
  if (status === 'online') return 'online';
  if (status === 'idle') return 'idle';
  if (status === 'dnd') return 'dnd';
  return 'offline';
};

const statusText = (status: string) => {
  if (status === 'online') return 'Online now';
  if (status === 'idle') return 'Idle';
  if (status === 'dnd') return 'Do not disturb';
  if (status === 'invisible') return 'Invisible';
  return 'Offline';
};

export default function AddFriendPage() {
  const setShowAddFriend = useUIStore((s) => s.setShowAddFriend);
  const notify = useUIStore((s) => s.addNotification);
  const user = useAuthStore((s) => s.user);
  const pushActivity = useActivityStore((s) => s.push);
  const {
    friends,
    refreshFriends,
    acceptFriend,
    declineFriend,
    removeFriend,
    createDirectMessage,
  } = useChatStore();

  const [mode, setMode] = useState<Mode>('discover');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [seed, setSeed] = useState(() => String(Date.now()));
  const [users, setUsers] = useState<DiscoveredUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const requestSerial = useRef(0);

  const close = useCallback(() => setShowAddFriend(false), [setShowAddFriend]);

  const incoming = useMemo(() => friends.filter((friend) => friend.status === 'incoming'), [friends]);
  const outgoing = useMemo(() => friends.filter((friend) => friend.status === 'pending'), [friends]);
  const requestsCount = incoming.length + outgoing.length;

  const relationById = useMemo(() => {
    const map = new Map<string, Friend>();
    for (const friend of friends) map.set(friend.userId, friend);
    return map;
  }, [friends]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 240);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const load = useCallback(async () => {
    const serial = ++requestSerial.current;
    setLoading(true);
    setError(null);
    const response = await api.discoverUsers({
      q: debouncedQuery,
      seed,
      limit: debouncedQuery ? 24 : 18,
      onlineOnly: filter === 'online',
    });
    if (serial !== requestSerial.current) return;
    if (response.success && response.data) {
      setUsers(response.data.users);
      setTotal(response.data.total);
    } else {
      setUsers([]);
      setTotal(0);
      setError(response.error || 'Could not load people right now.');
    }
    setLoading(false);
  }, [debouncedQuery, filter, seed]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target && ['INPUT', 'TEXTAREA'].includes(target.tagName);
      if (event.key === '/' && !isTyping && mode === 'discover') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, mode]);

  const runBusy = async (id: string, action: () => Promise<void>) => {
    setBusyIds((current) => new Set(current).add(id));
    try {
      await action();
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const sendRequest = (candidate: DiscoveredUser) => runBusy(candidate.id, async () => {
    const response = await api.sendFriendRequest(candidate.username);
    if (!response.success) {
      notify('Request not sent', response.error || 'Something went wrong. Try again.', 'error');
      return;
    }
    await refreshFriends();
    notify('Friend request sent', `@${candidate.username} will see your request.`, 'success');
  });

  const accept = (friend: Friend) => runBusy(friend.userId, async () => {
    if (!(await acceptFriend(friend.userId))) {
      notify('Could not accept', 'That request may no longer be available.', 'error');
      return;
    }
    await refreshFriends();
    notify('You are friends now', `@${friend.user.username} was added to your friends.`, 'success');
    pushActivity(user?.id, {
      id: `friend:accepted:${friend.userId}:${Date.now()}`,
      type: 'friend',
      title: 'Friend request accepted',
      body: `You and ${friend.user.username} are now friends.`,
    });
  });

  const decline = (friend: Friend) => runBusy(friend.userId, async () => {
    if (!(await declineFriend(friend.userId))) {
      notify('Could not ignore', 'Please try again.', 'error');
      return;
    }
    await refreshFriends();
    notify('Request ignored', `@${friend.user.username} was removed from your requests.`, 'info');
  });

  const cancel = (friend: Friend) => runBusy(friend.userId, async () => {
    if (!(await removeFriend(friend.userId))) {
      notify('Could not cancel', 'Please try again.', 'error');
      return;
    }
    await refreshFriends();
    notify('Request cancelled', `Your request to @${friend.user.username} was withdrawn.`, 'info');
  });

  const openMessage = async (friend: Friend) => {
    const ok = await createDirectMessage(friend.userId, friend.user);
    if (ok) close();
    else notify('Could not open chat', 'Please try again in a moment.', 'error');
  };

  const visibleUsers = filter === 'mutual' ? users.filter((candidate) => candidate.mutualServers > 0) : users;
  const onlineCount = users.filter((candidate) => candidate.status === 'online' || candidate.status === 'idle').length;
  const mutualCount = users.filter((candidate) => candidate.mutualServers > 0).length;

  const actionFor = (candidate: DiscoveredUser) => {
    const relation = relationById.get(candidate.id);
    const busy = busyIds.has(candidate.id);

    if (busy) {
      return <button className="af-action af-action-muted" disabled><Loader2 className="af-spin" size={15} /> Working…</button>;
    }
    if (!relation) {
      return (
        <button className="af-action af-action-primary" onClick={() => sendRequest(candidate)}>
          <UserPlus size={15} /> Add Friend
        </button>
      );
    }
    if (relation.status === 'accepted') {
      return (
        <button className="af-action af-action-soft" onClick={() => openMessage(relation)}>
          <MessageCircle size={15} /> Message
        </button>
      );
    }
    if (relation.status === 'pending') {
      return (
        <button className="af-action af-action-soft" onClick={() => cancel(relation)}>
          <X size={15} /> Cancel
        </button>
      );
    }
    if (relation.status === 'incoming') {
      return (
        <div className="af-action-pair">
          <button className="af-action af-action-primary" onClick={() => accept(relation)}><Check size={15} /> Accept</button>
          <button className="af-action af-action-quiet" onClick={() => decline(relation)}>Ignore</button>
        </div>
      );
    }
    return <button className="af-action af-action-muted" disabled>Blocked</button>;
  };

  const requestRow = (friend: Friend, kind: 'incoming' | 'outgoing') => (
    <div className="af-request-row" key={`${kind}:${friend.userId}`}>
      <div className="af-avatar-wrap">
        <Avatar
          src={avatarUrl(friend.user.avatar)}
          name={friend.user.username}
          className="af-avatar"
        />
        <i className={`af-presence ${statusTone(friend.user.status)}`} />
      </div>
      <div className="af-request-copy">
        <strong>@{friend.user.username}</strong>
        <span>{friend.user.customStatus || (kind === 'incoming' ? 'Wants to be friends' : 'Waiting for a response')}</span>
      </div>
      <div className="af-request-actions">
        {kind === 'incoming' ? (
          <>
            <button className="af-action af-action-primary" disabled={busyIds.has(friend.userId)} onClick={() => accept(friend)}>
              <Check size={15} /> Accept
            </button>
            <button className="af-action af-action-quiet" disabled={busyIds.has(friend.userId)} onClick={() => decline(friend)}>
              Ignore
            </button>
          </>
        ) : (
          <>
            <span className="af-pending-pill"><Send size={12} /> Pending</span>
            <button className="af-action af-action-quiet" disabled={busyIds.has(friend.userId)} onClick={() => cancel(friend)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <motion.div
      className="af-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="af-shell">
        <header className="af-topbar">
          <button className="af-icon-btn" onClick={close} aria-label="Back"><ArrowLeft size={18} /></button>
          <div className="af-brand"><UserPlus size={18} /><strong>Add Friends</strong></div>
          <span className="af-topbar-note">Find people, send requests, grow your circle.</span>
          <button className="af-icon-btn" onClick={close} aria-label="Close"><X size={18} /></button>
        </header>

        <div className="af-scroll">
          <section className="af-hero">
            <div className="af-glow af-glow-one" />
            <div className="af-glow af-glow-two" />
            <div className="af-hero-inner">
              <span className="af-kicker"><Sparkles size={13} /> people discovery</span>
              <h1>Find your people.</h1>
              <p>Shuffle through available users, or lock onto a specific username.</p>
              <div className="af-search">
                <Search size={19} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Username, name#tag, bio, or status"
                  aria-label="Search users"
                  autoFocus
                />
                {query ? (
                  <button className="af-clear" onClick={() => setQuery('')} aria-label="Clear search"><X size={15} /></button>
                ) : (
                  <kbd>/</kbd>
                )}
              </div>
              <div className="af-hero-hints">
                <span><Check size={12} /> exact matches first</span>
                <span><Users size={12} /> mutual servers highlighted</span>
                <span><Sparkles size={12} /> seeded random shuffle</span>
              </div>
            </div>
          </section>

          <div className="af-body">
            <div className="af-tabs">
              <button className={mode === 'discover' ? 'active' : ''} onClick={() => setMode('discover')}>
                <Sparkles size={15} /> Discover
              </button>
              <button className={mode === 'requests' ? 'active' : ''} onClick={() => setMode('requests')}>
                <Inbox size={15} /> Requests
                {requestsCount > 0 && <span className="af-tab-badge">{requestsCount}</span>}
              </button>
            </div>

            {mode === 'discover' ? (
              <>
                <section className="af-toolbar">
                  <div className="af-toolbar-copy">
                    <strong>{debouncedQuery ? `Results for “${debouncedQuery}”` : 'Available people'}</strong>
                    <span>
                      {total} found · {onlineCount} around now · {mutualCount} share a server
                    </span>
                  </div>
                  <div className="af-toolbar-actions">
                    <div className="af-filters">
                      {([
                        ['all', 'All'],
                        ['online', 'Online'],
                        ['mutual', 'Shared servers'],
                      ] as [Filter, string][]).map(([id, label]) => (
                        <button
                          key={id}
                          className={filter === id ? 'active' : ''}
                          onClick={() => setFilter(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button className="af-shuffle" onClick={() => setSeed(String(Date.now()))} disabled={loading} title="Shuffle the discovery pool">
                      <Shuffle size={15} /> Shuffle
                    </button>
                  </div>
                </section>

                {error && (
                  <div className="af-error">
                    <span>{error}</span>
                    <button onClick={load}><RefreshCw size={13} /> Retry</button>
                  </div>
                )}

                {loading ? (
                  <div className="af-grid">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div className="af-card af-skeleton" key={index}>
                        <div className="af-skel-avatar" />
                        <div className="af-skel-line" />
                        <div className="af-skel-line short" />
                        <div className="af-skel-button" />
                      </div>
                    ))}
                  </div>
                ) : visibleUsers.length ? (
                  <div className="af-grid">
                    <AnimatePresence mode="popLayout">
                      {visibleUsers.map((candidate) => (
                        <motion.article
                          layout
                          key={candidate.id}
                          className="af-card"
                          initial={{ opacity: 0, y: 12, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.97 }}
                          transition={{ duration: 0.22 }}
                        >
                          <div className="af-card-top">
                            <div className="af-avatar-wrap">
                              <Avatar
                                src={avatarUrl(candidate.avatar)}
                                name={candidate.username}
                                className="af-avatar"
                              />
                              <i className={`af-presence ${statusTone(candidate.status)}`} />
                            </div>
                            <div className="af-identity">
                              <strong>@{candidate.username}</strong>
                              <span>{candidate.discriminator ? `#${candidate.discriminator}` : 'blueChat'}</span>
                            </div>
                            {candidate.mutualServers > 0 && (
                              <span className="af-mutual" title={`${candidate.mutualServers} shared server(s)`}>
                                <Users size={12} /> {candidate.mutualServers}
                              </span>
                            )}
                          </div>
                          <p className="af-bio">
                            {candidate.bio || candidate.customStatus || 'No bio yet — say hello first.'}
                          </p>
                          <div className="af-card-foot">
                            <span className={`af-status ${statusTone(candidate.status)}`}>
                              <i /> {statusText(candidate.status)}
                            </span>
                            {actionFor(candidate)}
                          </div>
                        </motion.article>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="af-empty">
                    <Search size={30} />
                    <h3>No one matched that search</h3>
                    <p>Try a shorter username, clear the filter, or shuffle the pool again.</p>
                    <div className="af-empty-actions">
                      <button onClick={() => { setQuery(''); setFilter('all'); }}>Clear search</button>
                      <button onClick={() => setSeed(String(Date.now()))}><Shuffle size={14} /> Shuffle users</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <section className="af-requests">
                <div className="af-requests-head">
                  <div>
                    <h2>Friend requests</h2>
                    <p>Decide who gets into your circle.</p>
                  </div>
                  <button onClick={() => setMode('discover')}><UserPlus size={14} /> Find more people</button>
                </div>

                <div className="af-request-group">
                  <h3>Incoming <span>{incoming.length}</span></h3>
                  {incoming.length ? incoming.map((friend) => requestRow(friend, 'incoming')) : (
                    <div className="af-request-empty"><CheckCheck size={20} /> No incoming requests. You are all caught up.</div>
                  )}
                </div>

                <div className="af-request-group">
                  <h3>Outgoing <span>{outgoing.length}</span></h3>
                  {outgoing.length ? outgoing.map((friend) => requestRow(friend, 'outgoing')) : (
                    <div className="af-request-empty"><Send size={20} /> No pending requests. Go discover someone.</div>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
