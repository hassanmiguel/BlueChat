import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Check, ChevronLeft, Info, MessageCircle, MoreHorizontal,
  Pencil, Phone, Pin, Plus, Search, Send, Smile, Sparkles, Trash2, UserPlus, Users, Video, X, Ban, Reply, Download,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useUIStore } from '../stores/uiStore';
import Avatar from '../components/Avatar';
import TypingIndicator from '../components/TypingIndicator';
import { callService } from '../services/callService';
import { playSound } from '../services/soundService';
import { socketService } from '../services/socket';
import { api } from '../services/api';
import EmojiPicker from '../components/EmojiPicker';
import NotificationBell from '../components/NotificationBell';
import MessageContent from '../components/MessageContent';
import type { Attachment, DirectMessage, Message, User } from '../types';
import './dm.css';

const QUICK_EMOJIS = ['😀', '😂', '🥹', '😍', '👍', '🔥', '🎉', '❤️', '🙏', '👀', '💬', '🚀'];

const statusClass = (status?: User['status']) => {
  switch (status) {
    case 'online': return 'dm-status-online';
    case 'idle': return 'dm-status-idle';
    case 'dnd': return 'dm-status-dnd';
    default: return 'dm-status-offline';
  }
};

const statusLabel = (status?: User['status']) => {
  switch (status) {
    case 'online': return 'Online';
    case 'idle': return 'Idle';
    case 'dnd': return 'Do not disturb';
    case 'invisible': return 'Invisible';
    default: return 'Offline';
  }
};

const timeLabel = (value?: Date) => {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const otherParticipant = (dm: DirectMessage, userId?: string) =>
  dm.participants.find((p) => p.id !== userId) || dm.participants[0];

const attachmentKind = (mime: string): Attachment['type'] => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
};

export default function DmPage() {
  const user = useAuthStore((s) => s.user);
  const {
    directMessages, activeDmId, setActiveDm, messages, unreadFrom, drafts, setDraft,
    sendMessage, deleteMessage, editMessage, addReaction, pinMessage, markUnread, clearUnread,
    friends, createDirectMessage, createGroupDirectMessage, updateDirectMessage,
    addDmParticipants, removeDmParticipant, transferDmOwner, blockUser,
  } = useChatStore();
  const { openProfile, toggleSearchModal, addNotification, setShowAddFriend } = useUIStore();

  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [showInfo, setShowInfo] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | null>(null);
  const typingActive = useRef(false);

  const activeDm = directMessages.find((dm) => dm.id === activeDmId);
  const peer = activeDm ? otherParticipant(activeDm, user?.id) : undefined;
  const currentMessages = messages[activeDmId || ''] || [];
  const draft = activeDmId ? drafts[activeDmId] || '' : '';

  const sortedDms = useMemo(() => [...directMessages].sort((a, b) => {
    const at = a.lastMessage?.timestamp ? new Date(a.lastMessage.timestamp).getTime() : 0;
    const bt = b.lastMessage?.timestamp ? new Date(b.lastMessage.timestamp).getTime() : 0;
    return bt - at;
  }), [directMessages]);

  const filteredDms = sortedDms.filter((dm) => {
    const text = query.trim().toLowerCase();
    if (!text) return true;
    const person = otherParticipant(dm, user?.id);
    return `${person?.username || ''} ${dm.name || ''} ${dm.lastMessage?.content || ''}`.toLowerCase().includes(text);
  });

  const acceptedFriends = friends.filter((f) => f.status === 'accepted');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length, activeDmId]);

  useEffect(() => {
    setEditingId(null);
    setReplyingTo(null);
    setShowEmoji(false);
    setShowPins(false);
    setShowSearch(false);
    setPendingFiles([]);
    if (activeDmId) void api.markDmRead(activeDmId);
  }, [activeDmId]);

  useEffect(() => {
    if (!activeDmId) return;
    const room = `dm:${activeDmId}`;
    socketService.joinDm(activeDmId);
    return () => { socketService.stopTyping(room); };
  }, [activeDmId]);

  useEffect(() => () => {
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
  }, []);

  useEffect(() => {
    if (!showSearch || !searchQuery.trim() || !activeDmId) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    api.searchDmMessages(activeDmId, searchQuery.trim()).then((response) => {
      if (cancelled) return;
      setSearchResults(response.success && Array.isArray(response.data) ? response.data : []);
      setSearching(false);
    });
    return () => { cancelled = true; };
  }, [showSearch, searchQuery, activeDmId]);

  const notifyTyping = (value: string) => {
    if (!activeDmId) return;
    const room = `dm:${activeDmId}`;
    if (!value.trim()) {
      if (typingActive.current) socketService.stopTyping(room);
      typingActive.current = false;
      return;
    }
    if (!typingActive.current) {
      socketService.startTyping(room);
      typingActive.current = true;
    }
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      socketService.stopTyping(room);
      typingActive.current = false;
    }, 2500);
  };

  const changeDraft = (value: string) => {
    if (!activeDmId) return;
    setDraft(activeDmId, value);
    notifyTyping(value);
  };

  const handleSend = async () => {
    const content = draft.trim();
    if ((!content && !pendingFiles.length) || !activeDm || !user) return;
    setDraft(activeDm.id, '');
    setPendingFiles([]);
    setShowEmoji(false);
    setReplyingTo(null);
    if (typingActive.current) socketService.stopTyping(`dm:${activeDm.id}`);
    typingActive.current = false;
    setUploading(true);

    let attachments: Attachment[] = [];
    try {
      for (const file of pendingFiles) {
        const response = await api.uploadMedia(file, 'file');
        if (!response.success || !response.data) throw new Error(response.error || 'Upload failed');
        attachments.push({
          id: `${Date.now()}-${file.name}`,
          filename: response.data.name || file.name,
          url: response.data.url,
          size: response.data.size || file.size,
          type: attachmentKind(file.type),
          mimeType: file.type,
        });
      }
      const ok = await sendMessage(activeDm.id, content || 'Sent an attachment', user, replyingTo?.id, attachments);
      if (!ok) {
        setDraft(activeDm.id, content);
        addNotification('Message not sent', 'Check your connection and try again.', 'error');
      } else {
        void playSound('messageSent');
      }
    } catch (error) {
      setDraft(activeDm.id, content);
      addNotification('Upload failed', error instanceof Error ? error.message : 'Could not upload file.', 'error');
    } finally {
      setUploading(false);
      inputRef.current?.focus();
    }
  };

  const handleEdit = async (messageId: string) => {
    const content = editDraft.trim();
    if (!content || !activeDm) return;
    const ok = await editMessage(activeDm.id, messageId, content);
    if (ok) {
      setEditingId(null);
      setEditDraft('');
    } else {
      addNotification('Could not edit', 'Your change was not saved.', 'error');
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!activeDm) return;
    const ok = await deleteMessage(activeDm.id, messageId);
    if (!ok) addNotification('Could not delete', 'Try again in a moment.', 'error');
  };

  const selectDm = (dmId: string) => {
    setActiveDm(dmId);
    setMobileChat(true);
  };

  const toggleMemberSelection = (userId: string) => {
    setSelectedMembers((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  };

  return (
    <div className="dm-root">
      <aside className={`dm-sidebar${mobileChat ? ' mobile-hidden' : ''}`}>
        <div className="dm-sidebar-head">
          <div>
            <span className="dm-eyebrow">YOUR SPACE</span>
            <h1>Messages</h1>
          </div>
          <button className="dm-icon-btn accent" onClick={() => { setGroupName(''); setSelectedMembers([]); setShowNew(true); }} title="New message" aria-label="New message">
            <Plus size={19} />
          </button>
        </div>

        <div className="dm-search">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
        </div>

        <div className="dm-quick">
          {acceptedFriends.slice(0, 6).map((friend) => (
            <button
              key={friend.userId}
              className="dm-quick-person"
              title={`Message ${friend.user.username}`}
              onClick={async () => {
                const ok = await createDirectMessage(friend.userId, friend.user);
                if (ok) setMobileChat(true);
              }}
            >
              <span className="dm-quick-avatar">
                <Avatar src={friend.user.avatar} name={friend.user.username} className="dm-avatar-img" />
                <i className={statusClass(friend.user.status)} />
              </span>
              <span>{friend.user.username.split(' ')[0]}</span>
            </button>
          ))}
        </div>

        <div className="dm-list-label"><span>RECENT</span><span>{filteredDms.length}</span></div>

        <div className="dm-conversation-list">
          {filteredDms.length === 0 && (
            <div className="dm-empty-list">
              <MessageCircle size={26} />
              <p>{query ? 'No conversations matched.' : 'No messages yet.'}</p>
              <button onClick={() => setShowNew(true)}>Start one</button>
            </div>
          )}
          {filteredDms.map((dm) => {
            const person = otherParticipant(dm, user?.id);
            const isGroup = Boolean(dm.isGroup);
            return (
              <button key={dm.id} className={`dm-conversation${activeDmId === dm.id ? ' active' : ''}`} onClick={() => selectDm(dm.id)}>
                <span className="dm-conversation-avatar">
                  <Avatar
                    src={isGroup ? dm.avatar : person?.avatar}
                    name={isGroup ? dm.name || '👥' : person?.username || '?'}
                    className="dm-avatar-img"
                  />
                  {!isGroup && person && <i className={statusClass(person.status)} />}
                </span>
                <span className="dm-conversation-copy">
                  <span className="dm-conversation-top">
                    <strong>{isGroup ? dm.name || 'Group' : person?.username || 'Unknown'}</strong>
                    <small>{timeLabel(dm.lastMessage?.timestamp)}</small>
                  </span>
                  <span className="dm-conversation-preview">
                    {dm.lastMessage
                      ? `${dm.lastMessage.author.id === user?.id ? 'You: ' : ''}${dm.lastMessage.content}`
                      : 'Say hello 👋'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="dm-sidebar-foot">
          <Avatar src={user?.avatar} name={user?.username || '?'} className="dm-avatar-img" />
          <span><strong>{user?.username}</strong><small>{statusLabel(user?.status)}</small></span>
          <button onClick={() => setShowAddFriend(true)} title="Add friend" aria-label="Add friend"><UserPlus size={17} /></button>
        </div>
      </aside>

      <main className={`dm-chat${mobileChat ? '' : ' mobile-hidden'}`}>
        {activeDm && peer ? (
          <>
            <header className="dm-chat-head">
              <button className="dm-icon-btn mobile-back" onClick={() => setMobileChat(false)} aria-label="Back to conversations"><ArrowLeft size={18} /></button>
              <div className="dm-chat-person" onClick={() => openProfile(peer.id)} role="button" tabIndex={0}>
                <span className="dm-conversation-avatar">
                  <Avatar
                    src={activeDm.isGroup ? activeDm.avatar : peer.avatar}
                    name={activeDm.isGroup ? activeDm.name || '👥' : peer.username}
                    className="dm-avatar-img"
                  />
                  {!activeDm.isGroup && <i className={statusClass(peer.status)} />}
                </span>
                <span>
                  <strong>{activeDm.isGroup ? activeDm.name || 'Group' : peer.username}</strong>
                  <small>{activeDm.isGroup ? `${activeDm.participants.length} members` : `${statusLabel(peer.status)}${peer.customStatus ? ` · ${peer.customStatus}` : ''}`}</small>
                </span>
              </div>
              <div className="dm-chat-actions">
                {!activeDm.isGroup && (
                  <>
                    <button className="dm-icon-btn call" onClick={() => void callService.startCall({ dmId: activeDm.id, peer, type: 'audio' })} title={`Voice call ${peer.username}`} aria-label="Start voice call"><Phone size={18} /></button>
                    <button className="dm-icon-btn call" onClick={() => void callService.startCall({ dmId: activeDm.id, peer, type: 'video' })} title={`Video call ${peer.username}`} aria-label="Start video call"><Video size={18} /></button>
                    <span className="dm-actions-divider" />
                  </>
                )}
                <button className={`dm-icon-btn${showSearch ? ' selected' : ''}`} onClick={() => setShowSearch((value) => !value)} title="Search in conversation" aria-label="Search in conversation"><Search size={18} /></button>
                <button className={`dm-icon-btn${showPins ? ' selected' : ''}`} onClick={() => setShowPins((value) => !value)} title="Pinned messages" aria-label="Pinned messages"><Pin size={18} /></button>
                <button className="dm-icon-btn" onClick={toggleSearchModal} title="Global search" aria-label="Global search"><Sparkles size={18} /></button>
                <button className={`dm-icon-btn${showInfo ? ' selected' : ''}`} onClick={() => setShowInfo((v) => !v)} title="Conversation details" aria-label="Conversation details"><Info size={18} /></button>
                <NotificationBell inline />
              </div>
            </header>

            <AnimatePresence>
              {showSearch && (
                <motion.div className="dm-search-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <div className="dm-search-row">
                    <Search size={15} />
                    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search this conversation" autoFocus />
                    <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} aria-label="Close search"><X size={15} /></button>
                  </div>
                  {searching && <p className="dm-search-note">Searching...</p>}
                  {searchResults.slice(0, 8).map((result) => (
                    <button key={result.id} className="dm-search-result" onClick={() => { bottomRef.current?.scrollIntoView(); setShowSearch(false); }}>
                      <strong>{result.author.username}</strong>
                      <span>{result.content.slice(0, 140)}</span>
                    </button>
                  ))}
                </motion.div>
              )}
              {showPins && (
                <motion.div className="dm-search-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <div className="dm-search-row"><Pin size={15} /><strong>Pinned messages</strong><button onClick={() => setShowPins(false)} aria-label="Close pinned"><X size={15} /></button></div>
                  {currentMessages.filter((message) => message.isPinned).length === 0
                    ? <p className="dm-search-note">Nothing pinned yet.</p>
                    : currentMessages.filter((message) => message.isPinned).map((message) => (
                      <div key={message.id} className="dm-search-result"><strong>{message.author.username}</strong><span>{message.content.slice(0, 140)}</span></div>
                    ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="dm-messages">
              <div className="dm-intro">
                <span className="dm-intro-avatar">
                  <Avatar src={activeDm.isGroup ? activeDm.avatar : peer.avatar} name={activeDm.isGroup ? activeDm.name || '👥' : peer.username} className="dm-avatar-img" />
                </span>
                <h2>{activeDm.isGroup ? activeDm.name || 'Group conversation' : peer.username}</h2>
                <p>
                  This is the beginning of your conversation
                  {!activeDm.isGroup && <> with <strong>@{peer.username}</strong></>}. Say something good.
                </p>
              </div>

              {currentMessages.map((msg, index) => {
                const mine = msg.author.id === user?.id;
                const prev = currentMessages[index - 1];
                const newDay = !prev || new Date(prev.timestamp).toDateString() !== new Date(msg.timestamp).toDateString();
                return (
                  <Fragment key={msg.id}>
                    {newDay && <div className="dm-day"><span>{new Date(msg.timestamp).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>}
                    {unreadFrom[activeDmId || ''] === msg.id && <div className="dm-unread"><span>New messages</span></div>}
                    <DmMessage
                      message={msg}
                      mine={mine}
                      onProfile={() => openProfile(msg.author.id)}
                      onEditStart={() => { setEditingId(msg.id); setEditDraft(msg.content); }}
                      onDelete={() => handleDelete(msg.id)}
                      onReply={() => { setReplyingTo(msg); inputRef.current?.focus(); }}
                      onReact={(emoji) => addReaction(activeDm.id, msg.id, emoji, user?.id || '')}
                      onPin={async () => {
                        const ok = await pinMessage(activeDm.id, msg.id);
                        addNotification(ok ? 'Pin updated' : 'Error', ok ? 'Pinned messages updated.' : 'Could not update pin.', ok ? 'success' : 'error');
                      }}
                      onCopy={() => { void navigator.clipboard?.writeText(msg.content); }}
                      onMarkUnread={() => markUnread(activeDm.id, msg.id)}
                      editing={editingId === msg.id}
                      editDraft={editDraft}
                      setEditDraft={setEditDraft}
                      onEditSave={() => handleEdit(msg.id)}
                      onEditCancel={() => setEditingId(null)}
                    />
                  </Fragment>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <TypingIndicator targetId={`dm:${activeDmId || ''}`} />

            <div className="dm-composer-wrap">
              {replyingTo && (
                <div className="dm-reply-bar">
                  <Reply size={14} />
                  <span>Replying to <strong>@{replyingTo.author.username}</strong></span>
                  <button onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><X size={14} /></button>
                </div>
              )}
              {pendingFiles.length > 0 && (
                <div className="dm-pending-files">
                  {pendingFiles.map((file, index) => (
                    <span key={`${file.name}-${index}`}>{file.name}<button onClick={() => setPendingFiles((files) => files.filter((_, i) => i !== index))} aria-label="Remove file"><X size={12} /></button></span>
                  ))}
                </div>
              )}
              <AnimatePresence>
                {showEmoji && (
                  <motion.div className="dm-emoji-pop" initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }}>
                    <EmojiPicker
                      compact
                      quickEmojis={QUICK_EMOJIS}
                      onSelect={(value) => {
                        changeDraft(`${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}${value}`);
                        setShowEmoji(false);
                        inputRef.current?.focus();
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="dm-composer">
                <button className="dm-composer-btn" onClick={() => fileRef.current?.click()} title="Attach file" aria-label="Attach file"><Plus size={20} /></button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []).slice(0, 10);
                    setPendingFiles((current) => [...current, ...files].slice(0, 10));
                    event.target.value = '';
                  }}
                />
                <button className="dm-composer-btn" onClick={() => setShowEmoji((v) => !v)} title="Emoji" aria-label="Emoji"><Smile size={20} /></button>
                <textarea
                  ref={inputRef}
                  value={draft}
                  rows={1}
                  onChange={(e) => changeDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  onBlur={() => {
                    if (typingActive.current && activeDmId) socketService.stopTyping(`dm:${activeDmId}`);
                    typingActive.current = false;
                  }}
                  placeholder={`Message ${activeDm.isGroup ? activeDm.name || 'group' : `@${peer.username}`}`}
                  aria-label="Message"
                />
                <button className="dm-send" onClick={() => void handleSend()} disabled={(!draft.trim() && !pendingFiles.length) || uploading} title="Send" aria-label="Send">
                  {uploading ? '...' : <Send size={18} />}
                </button>
              </div>
              <div className="dm-composer-hint"><strong>Enter</strong> to send · <strong>Shift + Enter</strong> for a new line</div>
              {unreadFrom[activeDmId || ''] && (
                <button className="dm-mark-read" onClick={() => clearUnread(activeDmId || '')}>Mark as read</button>
              )}
            </div>
          </>
        ) : (
          <div className="dm-chat-empty">
            <span className="dm-chat-empty-glow" />
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="dm-chat-empty-icon"><MessageCircle size={34} /></div>
              <h2>Pick a conversation</h2>
              <p>Your best chats live here. Choose someone on the left, or start something new.</p>
              <button onClick={() => setShowNew(true)}><Plus size={16} /> New message</button>
            </motion.div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {showInfo && activeDm && peer && (
          <motion.aside className="dm-info" initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
            <div className="dm-info-inner">
              <div className="dm-info-head"><span>About this chat</span><button onClick={() => setShowInfo(false)} aria-label="Close details"><X size={17} /></button></div>
              <div className="dm-info-profile">
                <Avatar src={activeDm.isGroup ? activeDm.avatar : peer.avatar} name={activeDm.isGroup ? activeDm.name || '👥' : peer.username} className="dm-info-avatar" />
                <h3>{activeDm.isGroup ? activeDm.name || 'Group' : peer.username}</h3>
                <p className="dm-info-status"><i className={statusClass(peer.status)} /> {statusLabel(peer.status)}</p>
                {activeDm.description && <p className="dm-info-bio">{activeDm.description}</p>}
                {!activeDm.isGroup && peer.bio && <p className="dm-info-bio">{peer.bio}</p>}
              </div>
              {activeDm.isGroup && (
                <div className="dm-info-block">
                  <span className="dm-info-label">GROUP SETTINGS</span>
                  <input
                    className="dm-info-input"
                    defaultValue={activeDm.name || ''}
                    placeholder="Group name"
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value && value !== activeDm.name) void updateDirectMessage(activeDm.id, { name: value });
                    }}
                  />
                  <div className="dm-info-members wide">
                    {activeDm.participants.map((participant) => (
                      <div key={participant.id} className="dm-member-row">
                        <button onClick={() => openProfile(participant.id)}><Avatar src={participant.avatar} name={participant.username} className="dm-avatar-img" /> {participant.username}</button>
                        {activeDm.ownerId === user?.id && participant.id !== user?.id && (
                          <>
                            <button title="Transfer ownership" onClick={() => void transferDmOwner(activeDm.id, participant.id)}><Check size={13} /></button>
                            <button title="Remove from group" onClick={() => void removeDmParticipant(activeDm.id, participant.id)}><X size={13} /></button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <button className="dm-info-profile-btn" onClick={() => { setGroupName(''); setSelectedMembers([]); setShowNew(true); }}><UserPlus size={15} /> Add members</button>
                  {activeDm.ownerId === user?.id && (
                    <button className="dm-info-profile-btn danger" onClick={() => user && void removeDmParticipant(activeDm.id, user.id)}>Leave group</button>
                  )}
                </div>
              )}
              <div className="dm-info-block">
                <span className="dm-info-label">MEMBERS</span>
                <div className="dm-info-members">
                  {activeDm.participants.slice(0, 5).map((p) => (
                    <button key={p.id} onClick={() => openProfile(p.id)} title={p.username}><Avatar src={p.avatar} name={p.username} className="dm-avatar-img" /></button>
                  ))}
                  {activeDm.participants.length > 5 && <span>+{activeDm.participants.length - 5}</span>}
                </div>
              </div>
              <div className="dm-info-block">
                <span className="dm-info-label">DETAILS</span>
                <div className="dm-info-row"><MessageCircle size={15} /> {currentMessages.length} messages</div>
                <div className="dm-info-row"><Users size={15} /> {activeDm.participants.length} {activeDm.participants.length === 1 ? 'person' : 'people'}</div>
              </div>
              {!activeDm.isGroup && peer && (
                <button
                  className="dm-info-profile-btn danger"
                  onClick={async () => {
                    if (await blockUser(peer.id)) addNotification('User blocked', `@${peer.username} was blocked.`, 'success');
                  }}
                >
                  <Ban size={15} /> Block user
                </button>
              )}
              <button className="dm-info-profile-btn" onClick={() => openProfile(peer.id)}>View full profile <ChevronLeft size={15} /></button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNew && (
          <motion.div className="dm-modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowNew(false)}>
            <motion.div className="dm-modal" initial={{ scale: 0.95, y: 14, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 14, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="dm-modal-head">
                <div><span className="dm-eyebrow">NEW CONVERSATION</span><h2>Who are we messaging?</h2></div>
                <button onClick={() => setShowNew(false)} aria-label="Close"><X size={18} /></button>
              </div>
              <div className="dm-modal-body">
                {acceptedFriends.length === 0 ? (
                  <div className="dm-modal-empty"><UserPlus size={26} /><p>Add a friend first, then you can start chatting here.</p><button onClick={() => { setShowNew(false); setShowAddFriend(true); }}>Add a friend</button></div>
                ) : acceptedFriends.map((friend) => (
                  <button
                    key={friend.userId}
                    className={`dm-modal-person${selectedMembers.includes(friend.userId) ? ' selected' : ''}`}
                    onClick={() => toggleMemberSelection(friend.userId)}
                  >
                    <Avatar src={friend.user.avatar} name={friend.user.username} className="dm-avatar-img" />
                    <span><strong>{friend.user.username}</strong><small>{statusLabel(friend.user.status)}</small></span>
                    {selectedMembers.includes(friend.userId) ? <Check size={17} /> : <Plus size={17} />}
                  </button>
                ))}
              </div>
              {selectedMembers.length > 1 && (
                <div className="dm-new-group-name">
                  <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name (optional)" />
                </div>
              )}
              <div className="dm-modal-foot">
                <span>{selectedMembers.length ? `${selectedMembers.length} selected` : 'Select one person or several for a group'}</span>
                <button
                  className="dm-modal-create"
                  disabled={!selectedMembers.length}
                  onClick={async () => {
                    const ok = selectedMembers.length === 1
                      ? await createDirectMessage(selectedMembers[0], acceptedFriends.find((f) => f.userId === selectedMembers[0])!.user)
                      : await createGroupDirectMessage(selectedMembers, groupName.trim() || undefined);
                    setShowNew(false);
                    setSelectedMembers([]);
                    setGroupName('');
                    if (ok) setMobileChat(true);
                  }}
                >
                  Start
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DmMessageProps {
  message: Message;
  mine: boolean;
  onProfile: () => void;
  onEditStart: () => void;
  onDelete: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onPin: () => void;
  onCopy: () => void;
  onMarkUnread: () => void;
  editing: boolean;
  editDraft: string;
  setEditDraft: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
}

function DmMessage({
  message, mine, onProfile, onEditStart, onDelete, onReply, onReact, onPin, onCopy, onMarkUnread,
  editing, editDraft, setEditDraft, onEditSave, onEditCancel,
}: DmMessageProps) {
  const [menu, setMenu] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  return (
    <div className={`dm-message${mine ? ' mine' : ''}`} onContextMenu={(event) => { event.preventDefault(); setMenu(true); }}>
      {!mine && <button className="dm-message-avatar" onClick={onProfile} aria-label={`View ${message.author.username}'s profile`}><Avatar src={message.author.avatar} name={message.author.username} className="dm-avatar-img" /></button>}
      <div className="dm-message-main">
        {!mine && <button className="dm-message-name" onClick={onProfile}>{message.author.username}</button>}
        {message.replyTo && (
          <div className="dm-reply-preview"><strong>@{message.replyTo.author.username}</strong><span>{message.replyTo.content.slice(0, 120)}</span></div>
        )}
        {editing ? (
          <div className="dm-edit-box">
            <input autoFocus value={editDraft} onChange={(e) => setEditDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onEditSave(); if (e.key === 'Escape') onEditCancel(); }} />
            <button onClick={onEditSave} title="Save"><Check size={16} /></button>
            <button onClick={onEditCancel} title="Cancel"><X size={16} /></button>
          </div>
        ) : (
          <>
            <div className="dm-bubble"><MessageContent content={message.content} /></div>
            {message.attachments.length > 0 && (
              <div className="dm-attachments">
                {message.attachments.map((file) => (
                  <div key={file.id} className="dm-attachment">
                    {file.type === 'image' ? (
                      <a href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={file.filename} /></a>
                    ) : file.type === 'video' ? (
                      <video src={file.url} controls playsInline />
                    ) : file.type === 'audio' ? (
                      <audio src={file.url} controls />
                    ) : (
                      <a href={file.url} target="_blank" rel="noreferrer" download={file.filename}><Download size={14} /> {file.filename}</a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {message.reactions.length > 0 && (
          <div className="dm-reactions">
            {message.reactions.map((reaction) => (
              <button key={reaction.emoji} onClick={() => onReact(reaction.emoji)} className={reaction.userIds.includes(message.author.id) ? 'active' : ''}>
                {reaction.emoji} <span>{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
        <div className="dm-message-meta">
          {message.isPinned && <Pin size={11} />}
          {message.editedAt && <span>edited</span>}
          <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
      {!editing && (
        <div className="dm-message-tools">
          <button onClick={() => setMenu((v) => !v)} aria-label="Message options"><MoreHorizontal size={16} /></button>
          {showEmoji && (
            <div className="dm-message-emoji">
              <EmojiPicker compact quickEmojis={QUICK_EMOJIS} onSelect={(emoji) => { onReact(emoji); setShowEmoji(false); }} />
            </div>
          )}
          {menu && (
            <div className="dm-message-menu">
              <button onClick={() => { setMenu(false); onReply(); }}><Reply size={14} /> Reply</button>
              <button onClick={() => { setMenu(false); setShowEmoji(true); }}><Smile size={14} /> React</button>
              <button onClick={() => { setMenu(false); onPin(); }}><Pin size={14} /> {message.isPinned ? 'Unpin' : 'Pin'}</button>
              <button onClick={() => { setMenu(false); onCopy(); }}><MessageCircle size={14} /> Copy text</button>
              <button onClick={() => { setMenu(false); onMarkUnread(); }}><MessageCircle size={14} /> Mark unread</button>
              {mine && <button onClick={() => { setMenu(false); onEditStart(); }}><Pencil size={14} /> Edit</button>}
              {mine && <button className="danger" onClick={() => { setMenu(false); onDelete(); }}><Trash2 size={14} /> Delete</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
