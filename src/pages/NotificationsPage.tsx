import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AtSign, Bell, BellRing, CheckCheck, Inbox, Info, MessageCircle,
  Phone, Trash2, UserPlus, X,
} from 'lucide-react';
import { useActivityStore, type ActivityItem, type ActivityType } from '../stores/activityStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { navigateActivity } from '../services/activityNavigation';
import './notifications.css';

type Filter = 'all' | 'unread' | ActivityType;

const FILTERS: { id: Filter; label: string; icon: typeof Bell }[] = [
  { id: 'all', label: 'All activity', icon: Inbox },
  { id: 'unread', label: 'Unread', icon: BellRing },
  { id: 'message', label: 'Messages', icon: MessageCircle },
  { id: 'mention', label: 'Mentions', icon: AtSign },
  { id: 'call', label: 'Calls', icon: Phone },
  { id: 'friend', label: 'Friends', icon: UserPlus },
  { id: 'system', label: 'System', icon: Info },
];

const iconFor = (type: ActivityType) => {
  if (type === 'call') return <Phone size={17} />;
  if (type === 'mention') return <AtSign size={17} />;
  if (type === 'friend') return <UserPlus size={17} />;
  if (type === 'system') return <Info size={17} />;
  return <MessageCircle size={17} />;
};

const fullTime = (timestamp: number) => new Date(timestamp).toLocaleString([], {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function NotificationsPage() {
  const close = useUIStore((s) => s.setShowNotifications);
  const user = useAuthStore((s) => s.user);
  const { items, markRead, markAllRead, clear } = useActivityStore();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => ({
    all: items.length,
    unread: items.filter((item) => !item.read).length,
    message: items.filter((item) => item.type === 'message').length,
    mention: items.filter((item) => item.type === 'mention').length,
    call: items.filter((item) => item.type === 'call').length,
    friend: items.filter((item) => item.type === 'friend').length,
    system: items.filter((item) => item.type === 'system').length,
  }), [items]);

  const visible = filter === 'all'
    ? items
    : filter === 'unread'
      ? items.filter((item) => !item.read)
      : items.filter((item) => item.type === filter);

  const open = (item: ActivityItem) => {
    markRead(user?.id, item.id);
    navigateActivity(item);
    close(false);
  };

  return (
    <motion.div
      className="notif-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(event) => { if (event.target === event.currentTarget) close(false); }}
    >
      <motion.div
        className="notif-shell"
        initial={{ scale: 0.96, y: 14, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 14, opacity: 0 }}
      >
        <aside className="notif-side">
          <div className="notif-side-head">
            <h1>Notifications</h1>
            <p>Everything that needs your attention</p>
          </div>
          {FILTERS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`notif-filter${filter === id ? ' active' : ''}`}
              onClick={() => setFilter(id)}
            >
              <Icon size={16} /> <span>{label}</span> <span>{counts[id]}</span>
            </button>
          ))}
          <div className="notif-side-foot">
            <button onClick={() => clear(user?.id)}><Trash2 size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> Clear all</button>
          </div>
        </aside>

        <main className="notif-main">
          <div className="notif-main-head">
            <strong>{FILTERS.find((f) => f.id === filter)?.label} <span style={{ color: '#949ba4', fontWeight: 400 }}>· {visible.length}</span></strong>
            <div style={{ display: 'flex', gap: 14 }}>
              <button onClick={() => markAllRead(user?.id)}><CheckCheck size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Mark all read</button>
              <button onClick={() => close(false)} aria-label="Close notifications"><X size={17} /></button>
            </div>
          </div>
          <div className="notif-main-list">
            {visible.length === 0 && (
              <div className="notif-empty">
                <Bell size={34} />
                <p>Nothing here yet.<br />You’re all caught up.</p>
              </div>
            )}
            {visible.map((item) => (
              <div key={item.id} className={`notif-main-item${item.read ? '' : ' unread'}`}>
                <button className="notif-item" onClick={() => open(item)}>
                  <span className={`notif-item-icon ${item.type}`}>{iconFor(item.type)}</span>
                  <span className="notif-item-copy">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <small>{fullTime(item.timestamp)}</small>
                  </span>
                  {!item.read && <i className="notif-unread-dot" />}
                </button>
                <div className="notif-main-item-actions">
                  <button onClick={() => open(item)}>Open</button>
                  {!item.read && <button onClick={() => markRead(user?.id, item.id)}>Mark read</button>}
                </div>
              </div>
            ))}
          </div>
        </main>
      </motion.div>
    </motion.div>
  );
}
