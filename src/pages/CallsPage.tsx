import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpRight, Clock3, Mic, PhoneCall, PhoneMissed, PhoneOff, RefreshCw,
  Trash2, Video, X,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useCallStore, type CallRecord, type CallType } from '../stores/callStore';
import { useUIStore } from '../stores/uiStore';
import { callService, formatDuration } from '../services/callService';
import { requestMediaAccess, stopMediaTracks } from '../services/mediaPermission';
import Avatar from '../components/Avatar';
import './calls.css';

const relativeTime = (timestamp: number) => {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const statusLabel = (record: CallRecord) => {
  if (record.status === 'missed') return record.direction === 'incoming' ? 'Missed' : 'No answer';
  if (record.status === 'declined') return 'Declined';
  if (record.status === 'busy') return 'Busy';
  if (record.status === 'failed') return 'Failed';
  return formatDuration(record.duration);
};

export default function CallsPage() {
  const close = useUIStore((s) => s.setShowCalls);
  const addNotification = useUIStore((s) => s.addNotification);
  const user = useAuthStore((s) => s.user);
  const { friends, directMessages, createDirectMessage, setView } = useChatStore();
  const { history, clearHistory } = useCallStore();
  const [tab, setTab] = useState<'all' | 'missed'>('all');
  const [permissionBusy, setPermissionBusy] = useState(false);

  const people = useMemo(() => {
    const map = new Map<string, { id: string; username: string; avatar?: string; status?: string }>();
    friends.filter((f) => f.status === 'accepted').forEach((f) => {
      map.set(f.userId, { id: f.userId, username: f.user.username, avatar: f.user.avatar, status: f.user.status });
    });
    directMessages.forEach((dm) => {
      if (dm.isGroup) return;
      dm.participants.filter((p) => p.id !== user?.id).forEach((p) => {
        if (!map.has(p.id)) map.set(p.id, { id: p.id, username: p.username, avatar: p.avatar, status: p.status });
      });
    });
    return [...map.values()];
  }, [friends, directMessages, user?.id]);

  const visibleHistory = tab === 'missed' ? history.filter((item) => item.status === 'missed') : history;
  const missedCount = history.filter((item) => item.status === 'missed').length;

  const start = async (peerId: string, peerName: string, type: CallType, dmId?: string) => {
    let finalDmId = dmId;
    if (!finalDmId) {
      const existing = directMessages.find(
        (dm) => !dm.isGroup && dm.participants.some((p) => p.id === peerId),
      );
      finalDmId = existing?.id;
      if (!finalDmId) {
        const friend = friends.find((f) => f.userId === peerId);
        if (friend) {
          const ok = await createDirectMessage(peerId, friend.user);
          if (!ok) return;
          finalDmId = useChatStore.getState().directMessages.find(
            (dm) => !dm.isGroup && dm.participants.some((p) => p.id === peerId),
          )?.id;
        }
      }
    }
    if (!finalDmId) {
      addNotification('No conversation yet', 'Add this person as a friend before calling them.', 'warning');
      return;
    }
    const peer = people.find((p) => p.id === peerId) || { id: peerId, username: peerName };
    const ok = await callService.startCall({ dmId: finalDmId, peer, type });
    if (ok) close(false);
  };

  const allowMedia = async () => {
    setPermissionBusy(true);
    const result = await requestMediaAccess('both');
    stopMediaTracks(result.stream);
    setPermissionBusy(false);
    addNotification(result.ok ? 'Access ready' : 'Access not granted', result.message, result.ok ? 'success' : 'error');
  };

  return (
    <motion.div
      className="calls-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(event) => { if (event.target === event.currentTarget) close(false); }}
    >
      <motion.div
        className="calls-shell"
        initial={{ scale: 0.96, y: 14, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 14, opacity: 0 }}
      >
        <aside className="calls-side">
          <div className="calls-side-head">
            <div>
              <h1>Calls</h1>
              <p>Your recent audio &amp; video activity</p>
            </div>
            <button className="calls-icon-btn" onClick={() => close(false)} aria-label="Close calls"><X size={17} /></button>
          </div>
          <div className="calls-tabs">
            <button className={`calls-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>All · {history.length}</button>
            <button className={`calls-tab${tab === 'missed' ? ' active' : ''}`} onClick={() => setTab('missed')}>Missed · {missedCount}</button>
          </div>
          <div className="calls-list">
            {visibleHistory.length === 0 && (
              <div className="calls-empty">
                <PhoneCall size={28} />
                <p>{tab === 'missed' ? 'No missed calls. Nice.' : 'No calls yet. Start one from the right.'}</p>
              </div>
            )}
            {visibleHistory.map((record) => {
              const missed = record.status === 'missed';
              return (
                <button
                  key={record.id}
                  className="calls-row"
                  onClick={() => void start(record.peerId, record.peerName, record.type, record.dmId)}
                  title={`Call ${record.peerName} again`}
                >
                  <span className="calls-row-avatar">
                    <Avatar src={undefined} name={record.peerName} className="call-avatar-img" />
                    <i className={missed ? 'missed' : record.status === 'failed' ? '' : 'done'} />
                  </span>
                  <span className="calls-row-copy">
                    <strong>{record.peerName}</strong>
                    <small className={missed ? 'missed' : ''}>
                      {record.direction === 'incoming' ? <ArrowUpRight size={12} /> : <PhoneCall size={12} />}
                      {relativeTime(record.timestamp)} · {statusLabel(record)}
                    </small>
                  </span>
                  <span className="calls-row-kind">
                    {record.type === 'video' ? <Video size={16} /> : <Mic size={16} />}
                  </span>
                </button>
              );
            })}
          </div>
          {history.length > 0 && (
            <div style={{ padding: '10px 18px 16px' }}>
              <button
                className="calls-tab"
                onClick={() => clearHistory(user?.id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#ff858a' }}
              >
                <Trash2 size={13} /> Clear history
              </button>
            </div>
          )}
        </aside>

        <main className="calls-main">
          <div className="calls-main-head">
            <div>
              <h1>Start a call</h1>
              <p>Peer-to-peer audio and video, right inside blueChat</p>
            </div>
            <span className="calls-live" style={{ position: 'static' }}><i /> READY</span>
          </div>
          <div className="calls-main-body">
            <div className="calls-feature">
              <h2>Talk face to face</h2>
              <p>
                Pick a friend below to ring them instantly. Calls connect directly between browsers,
                with mute, camera, and screen sharing controls while you talk.
              </p>
              <div className="calls-feature-actions">
                <span className="calls-secondary-btn" style={{ cursor: 'default' }}><Mic size={15} /> Voice call</span>
                <span className="calls-secondary-btn" style={{ cursor: 'default' }}><Video size={15} /> Video call</span>
                <span className="calls-secondary-btn" style={{ cursor: 'default' }}><Clock3 size={15} /> Saved locally</span>
              </div>
            </div>

            <div className="calls-section-label">PEOPLE YOU CAN CALL · {people.length}</div>
            {people.length === 0 ? (
              <div className="calls-empty">
                <PhoneOff size={26} />
                <p>Add a friend first, then you can call them here.</p>
                <button className="calls-primary-btn" onClick={() => { setView('friends'); close(false); }}>Go to friends</button>
              </div>
            ) : (
              <div className="calls-people">
                {people.map((person) => {
                  const dm = directMessages.find(
                    (item) => !item.isGroup && item.participants.some((p) => p.id === person.id),
                  );
                  return (
                    <div className="calls-person" key={person.id}>
                      <span className="calls-person-avatar">
                        <Avatar src={person.avatar} name={person.username} className="call-avatar-img" />
                      </span>
                      <span className="calls-person-copy">
                        <strong>{person.username}</strong>
                        <small>{person.status === 'online' ? 'Online now' : 'Available'}</small>
                      </span>
                      <span className="calls-person-actions">
                        <button title={`Voice call ${person.username}`} onClick={() => void start(person.id, person.username, 'audio', dm?.id)}><Mic size={15} /></button>
                        <button title={`Video call ${person.username}`} onClick={() => void start(person.id, person.username, 'video', dm?.id)}><Video size={15} /></button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="calls-section-label" style={{ marginTop: 26 }}>TIP</div>
            <div className="calls-permission">
              <div>
                Calls need microphone permission. Video calls also need a camera. If the person doesn’t answer,
                it lands in your notifications and Missed tab automatically. <RefreshCw size={12} /> Reconnects are handled for you.
              </div>
              <button className="calls-primary-btn" onClick={() => void allowMedia()} disabled={permissionBusy}>
                {permissionBusy ? 'Waiting...' : 'Allow mic & camera'}
              </button>
            </div>
          </div>
        </main>
      </motion.div>
    </motion.div>
  );
}
