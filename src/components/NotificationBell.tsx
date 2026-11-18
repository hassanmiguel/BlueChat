import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, MessageCircle, Phone, AtSign, UserPlus, Info } from 'lucide-react';
import { useActivityStore, selectUnreadCount, type ActivityType } from '../stores/activityStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { navigateActivity } from '../services/activityNavigation';
import '../pages/notifications.css';

const iconFor = (type: ActivityType) => {
  if (type === 'call') return <Phone size={16} />;
  if (type === 'mention') return <AtSign size={16} />;
  if (type === 'friend') return <UserPlus size={16} />;
  if (type === 'system') return <Info size={16} />;
  return <MessageCircle size={16} />;
};

const relative = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function NotificationBell({ inline = false }: { inline?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const { items, markRead, markAllRead } = useActivityStore();
  const unread = useActivityStore(selectUnreadCount);
  const setShowNotifications = useUIStore((s) => s.setShowNotifications);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [open]);

  return (
    <div className={`notif-bell-wrap${inline ? ' inline' : ''}`} ref={wrapRef}>
      <button
        className="notif-bell"
        onClick={() => setOpen((value) => !value)}
        title="Notifications"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell size={19} />
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="notif-popover"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
          >
            <div className="notif-popover-head">
              <strong>Notifications {unread > 0 && <span style={{ color: '#8ea0ff' }}>· {unread} new</span>}</strong>
              <button onClick={() => markAllRead(user?.id)}>Mark all read</button>
            </div>
            <div className="notif-popover-list">
              {items.length === 0 && (
                <div className="calls-empty" style={{ padding: '36px 18px' }}>
                  <Bell size={24} />
                  <p>You’re all caught up. New messages and calls will show up here.</p>
                </div>
              )}
              {items.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  className={`notif-item${item.read ? '' : ' unread'}`}
                  onClick={() => {
                    markRead(user?.id, item.id);
                    navigateActivity(item);
                    setOpen(false);
                  }}
                >
                  <span className={`notif-item-icon ${item.type}`}>{iconFor(item.type)}</span>
                  <span className="notif-item-copy">
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <small>{relative(item.timestamp)}</small>
                  </span>
                  {!item.read && <i className="notif-unread-dot" />}
                </button>
              ))}
            </div>
            <div className="notif-popover-foot">
              <button onClick={() => { setOpen(false); setShowNotifications(true); }}>Open notification center →</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
