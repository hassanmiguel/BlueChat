import { Fragment, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { Hash, Megaphone, BookOpen, Volume2, Pin, Users, Search, Smile, Send, MessageSquare, UserPlus, Ban, Trash2, BarChart3, Clock3 } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { socketService } from '../services/socket';
import { api } from '../services/api';
import { playSound } from '../services/soundService';
import EmojiPicker from './EmojiPicker';
import MessageContent, { useRichContent } from './MessageContent';
import { Message } from '../types';
import TypingIndicator from './TypingIndicator';
import Avatar from './Avatar';
import ContextMenu, { useContextMenu } from './ContextMenu';
import NotificationBell from './NotificationBell';
import ForumChannelView from './ForumChannelView';


export default function ChatArea() {
  const { messages, unreadFrom, activeChannelId, activeServerId, servers, sendMessage, addReaction, deleteMessage, editMessage, activeDmId, directMessages, view, setView, createDirectMessage, clearUnread, pinMessage } = useChatStore();
  const { toggleThreadPanel, toggleInviteModal, toggleSearchModal, openProfile, toggleCreateServer, setShowAddFriend } = useUIStore();
  const [messageInput, setMessageInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | null>(null);
  const typingActive = useRef(false);
  const user = useAuthStore(s => s.user);

  const activeServer = servers.find(s => s.id === activeServerId);
  const channel = activeServer?.channels.find(c => c.id === activeChannelId);
  const dm = directMessages.find(d => d.id === activeDmId);

  const currentMessages = messages[activeChannelId || activeDmId || ''] || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length]);

  useEffect(() => {
    if (view !== 'server' || !activeChannelId || !currentMessages.length) return;
    const latest = currentMessages[currentMessages.length - 1];
    void api.updateChannelReadState(activeChannelId, latest.id);
  }, [view, activeChannelId, currentMessages.length]);

  const notifyTyping = (value: string) => {
    const target = activeChannelId || activeDmId;
    if (!target) return;
    if (!value.trim()) {
      if (typingActive.current) socketService.stopTyping(target);
      typingActive.current = false;
      return;
    }
    if (!typingActive.current) {
      socketService.startTyping(target);
      typingActive.current = true;
    }
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      socketService.stopTyping(target);
      typingActive.current = false;
    }, 2500);
  };

  useEffect(() => () => {
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    if (typingActive.current) {
      const target = activeChannelId || activeDmId;
      if (target) socketService.stopTyping(target);
    }
  }, [activeChannelId, activeDmId]);

  const onComposerChange = (value: string) => {
    setMessageInput(value);
    notifyTyping(value);
  };

  const handleSend = async () => {
    if ((!messageInput.trim() && !pendingFiles.length) || !user) return;

    const targetId = activeChannelId || activeDmId;
    if (!targetId) return;

    const content = messageInput;
    const replyId = replyingTo?.id;
    const files = pendingFiles;
    setMessageInput('');
    setReplyingTo(null);
    setPendingFiles([]);
    socketService.stopTyping(targetId);
    typingActive.current = false;

    try {
      setUploading(true);
      const attachments = [];
      for (const file of files) {
        const response = await api.uploadMedia(file, 'file');
        if (!response.success || !response.data) throw new Error(response.error || 'Upload failed');
        attachments.push({
          id: `${Date.now()}-${file.name}`,
          filename: response.data.name || file.name,
          url: response.data.url,
          size: response.data.size || file.size,
          mimeType: file.type,
          type: file.type.startsWith('image/') ? 'image' as const
            : file.type.startsWith('video/') ? 'video' as const
              : file.type.startsWith('audio/') ? 'audio' as const
                : 'file' as const,
        });
      }
      const sent = await sendMessage(targetId, content || 'Sent an attachment', user, replyId, attachments);
      if (!sent) {
        setMessageInput(content);
        setPendingFiles(files);
      } else void playSound('messageSent');
    } catch (error) {
      setMessageInput(content);
      setPendingFiles(files);
      useUIStore.getState().addNotification('Upload failed', error instanceof Error ? error.message : 'Could not upload file.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEdit = (msgId: string) => {
    if (!editContent.trim() || !activeChannelId) return;
    editMessage(activeChannelId, msgId, editContent);
    setEditingId(null);
    setEditContent('');
  };

  const handlePin = async (msg: Message) => {
    const targetId = activeChannelId || activeDmId;
    if (!targetId) return;
    const ok = await pinMessage(targetId, msg.id);
    useUIStore.getState().addNotification(
      ok ? (msg.isPinned ? 'Message Unpinned' : 'Message Pinned') : 'Error',
      ok ? (msg.isPinned ? 'The message has been unpinned.' : 'The message has been pinned.') : 'Failed to update pin',
      ok ? 'success' : 'error'
    );
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🚀'];

  // Friends view
  if (view === 'friends') {
    return <FriendsView />;
  }

  // DM view
  if (view === 'dm' && dm) {
    const otherUser = dm.participants.find(p => p.id !== user?.id);
    return (
      <div className="flex-1 flex flex-col bg-dc-chat min-w-0">
        {/* Header */}
        <div className="h-12 px-4 flex items-center border-b border-dc-divider/30 shadow-sm shrink-0">
          <div className="relative mr-3">
            <Avatar
              src={dm.isGroup ? undefined : otherUser?.avatar}
              name={dm.isGroup ? '👥' : (otherUser?.username || '?')}
              className="w-6 h-6 rounded-full bg-dc-brand text-white text-xs font-bold overflow-hidden"
            />
          </div>
          <h3 className="font-bold text-white">{dm.isGroup ? dm.name : otherUser?.username}</h3>
          {!dm.isGroup && otherUser && (
            <span className="ml-2 text-xs text-dc-text-muted">
              {otherUser.status === 'online' ? 'Online' : otherUser.status === 'idle' ? 'Idle' : 'Offline'}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button disabled title="Voice calls are not available yet" className="p-1.5 rounded text-dc-text-muted cursor-not-allowed">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM3 10v4h2v-4H3Z"/>
              </svg>
            </button>
            <button onClick={toggleSearchModal} title="Search" className="p-1.5 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors">
              <Search className="w-5 h-5" />
            </button>
            <NotificationBell inline />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {currentMessages.map((msg, i) => (
            <MessageRow
              key={msg.id}
              message={msg}
              isCurrentUser={msg.author.id === user?.id}
              showAvatar={i === 0 || currentMessages[i - 1].author.id !== msg.author.id}
              onReply={() => setReplyingTo(msg)}
              onEdit={() => { setEditingId(msg.id); setEditContent(msg.content); }}
              onDelete={() => deleteMessage(activeDmId!, msg.id)}
              onPin={() => handlePin(msg)}
              onReaction={(emoji) => addReaction(activeDmId!, msg.id, emoji, user?.id || '')}
              showEmojiPicker={showEmojiPicker === msg.id}
              toggleEmojiPicker={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
              quickEmojis={quickEmojis}
              formatTime={formatTime}
              editingId={editingId}
              editContent={editContent}
              setEditContent={setEditContent}
              handleEdit={handleEdit}
              setEditingId={setEditingId}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing Indicator */}
        <TypingIndicator targetId={activeChannelId || (activeDmId ? `dm:${activeDmId}` : undefined)} />

        {/* Input */}
        <MessageInput
          messageInput={messageInput}
          setMessageInput={onComposerChange}
          handleKeyDown={handleKeyDown}
          handleSend={handleSend}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          channelName={dm.isGroup ? dm.name || 'Group DM' : otherUser?.username || 'DM'}
          pendingFiles={pendingFiles}
          onFiles={setPendingFiles}
          uploading={uploading}
        />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dc-chat">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-dc-brand rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-dc-brand/30">
            <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Welcome to blueChat!</h2>
          <p className="text-dc-text-muted mb-6">
            {servers.length === 0 
              ? "You haven't joined any servers yet. Create one or join a friend's server to get started!"
              : "Select a channel from the sidebar to start chatting"
            }
          </p>
          {servers.length === 0 && (
            <div className="flex gap-3 justify-center">
              <button 
                onClick={toggleCreateServer}
                className="px-6 py-2.5 bg-dc-brand hover:bg-dc-brand-hover text-white font-medium rounded-lg transition-colors"
              >
                Create a Server
              </button>
              <button 
                onClick={() => setShowAddFriend(true)}
                className="px-6 py-2.5 bg-dc-input hover:bg-dc-active text-white font-medium rounded-lg transition-colors"
              >
                Add Friends
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // At this point channel is defined
  const activeChannel = channel;

  if (activeChannel.type === 'forum') {
    return <ForumChannelView channelId={activeChannel.id} channelName={activeChannel.name} topic={activeChannel.topic} />;
  }

  const getChannelHeaderIcon = () => {
    switch (activeChannel.type) {
      case 'text': return <Hash className="w-6 h-6 text-dc-text-muted" />;
      case 'voice': return <Volume2 className="w-6 h-6 text-dc-text-muted" />;
      case 'announcement': return <Megaphone className="w-6 h-6 text-dc-text-muted" />;
      case 'forum': return <BookOpen className="w-6 h-6 text-dc-text-muted" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-dc-chat min-w-0">
      {/* Channel Header */}
      <div className="h-12 px-4 flex items-center border-b border-dc-divider/30 shadow-sm shrink-0">
        {getChannelHeaderIcon()}
        <h3 className="font-bold text-white ml-2">{activeChannel.name}</h3>
        {activeChannel.topic && (
          <>
            <div className="w-px h-6 bg-dc-divider mx-3"></div>
            <p className="text-sm text-dc-text-muted truncate">{activeChannel.topic}</p>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button 
            onClick={toggleThreadPanel}
            className="p-1.5 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors"
            title="Threads"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button 
            onClick={toggleInviteModal}
            className="p-1.5 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors"
            title="Invite"
          >
            <UserPlus className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowPins(!showPins)}
            className="p-1.5 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors"
            title="Pinned Messages"
          >
            <Pin className="w-5 h-5" />
          </button>
          <button 
            onClick={toggleSearchModal}
            className="p-1.5 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors"
            title="Search"
          >
            <Search className="w-5 h-5" />
          </button>
          <NotificationBell inline />
        </div>
      </div>

      {/* Pinned messages panel */}
      <AnimatePresence>
        {showPins && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-dc-divider/30"
          >
            <div className="p-4 bg-dc-darker/50">
              <h4 className="text-sm font-bold text-white mb-2">📌 Pinned Messages</h4>
              {currentMessages.filter(m => m.isPinned).length === 0 ? (
                <p className="text-sm text-dc-text-muted">No pinned messages yet</p>
              ) : (
                currentMessages.filter(m => m.isPinned).map(msg => (
                  <div key={msg.id} className="bg-dc-dark/50 rounded-lg p-3 mt-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">{msg.author.username}</span>
                      <span className="text-xs text-dc-text-muted">{formatTime(msg.timestamp)}</span>
                    </div>
                    <p className="text-sm text-dc-text"><MessageContent content={msg.content} /></p>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Channel welcome */}
        <div className="mb-6 pb-6 border-b border-dc-divider/30">
          <div className="w-16 h-16 rounded-full bg-dc-active flex items-center justify-center mb-3">
            {getChannelHeaderIcon()}
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Welcome to #{activeChannel.name}!</h2>
          <p className="text-dc-text-muted">This is the start of the #{activeChannel.name} channel. {activeChannel.topic}</p>
        </div>

        {currentMessages.map((msg, i) => (
          <Fragment key={msg.id}>
            {unreadFrom[activeChannelId || ''] === msg.id && (
              <div className="my-3 flex items-center gap-2">
                <div className="flex-1 h-px bg-dc-red/60" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-dc-red">New messages</span>
                <div className="flex-1 h-px bg-dc-red/60" />
              </div>
            )}
            <MessageRow
              message={msg}
              isCurrentUser={msg.author.id === user?.id}
              showAvatar={i === 0 || currentMessages[i - 1].author.id !== msg.author.id || new Date(msg.timestamp).getTime() - new Date(currentMessages[i - 1].timestamp).getTime() > 300000}
              onReply={() => setReplyingTo(msg)}
              onEdit={() => { setEditingId(msg.id); setEditContent(msg.content); }}
              onDelete={() => activeChannelId && deleteMessage(activeChannelId, msg.id)}
              onPin={() => handlePin(msg)}
              onReaction={(emoji) => activeChannelId && addReaction(activeChannelId, msg.id, emoji, user?.id || '')}
              showEmojiPicker={showEmojiPicker === msg.id}
              toggleEmojiPicker={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
              quickEmojis={quickEmojis}
              formatTime={formatTime}
              editingId={editingId}
              editContent={editContent}
              setEditContent={setEditContent}
              handleEdit={handleEdit}
              setEditingId={setEditingId}
            />
          </Fragment>
        ))}
        <div ref={messagesEndRef} />
        {unreadFrom[activeChannelId || ''] && (
          <button
            onClick={() => clearUnread(activeChannelId || '')}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 mt-2 rounded-full bg-dc-brand px-3 py-1 text-xs font-medium text-white shadow-lg"
          >
            Mark as read
          </button>
        )}
      </div>

      {/* Typing Indicator */}
      <TypingIndicator targetId={activeChannelId || (activeDmId ? `dm:${activeDmId}` : undefined)} />

      {/* Message Input */}
      <MessageInput
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        handleKeyDown={handleKeyDown}
        handleSend={handleSend}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        channelName={activeChannel.name}
        channelId={activeChannel.id}
        pendingFiles={pendingFiles}
        onFiles={setPendingFiles}
        uploading={uploading}
      />
    </div>
  );
}

function PollCard({ poll, channelId }: { poll: NonNullable<Message['poll']>; channelId: string }) {
  const [current, setCurrent] = useState(poll);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setCurrent(poll), [poll]);
  const closed = Boolean(current.closedAt) || Boolean(current.expiresAt && new Date(current.expiresAt) <= new Date());
  const total = current.options.reduce((sum, option) => sum + (option.voteCount || 0), 0);
  const vote = async (optionIds: string[]) => {
    if (busy || closed) return;
    setBusy(true);
    const response = await api.votePoll(current.id, optionIds);
    if (response.success) {
      const refreshed = await api.getChannelPolls(channelId);
      const latest = refreshed.data?.find((item: any) => item.id === current.id);
      if (latest) setCurrent({
        ...latest,
        options: latest.options.map((option: any) => ({
          id: option.id, label: option.label, voteCount: option.voteCount,
          votedByMe: option.votedByMe, voters: option.voters,
        })),
      });
    }
    setBusy(false);
  };
  return (
    <div className="mt-3 max-w-lg rounded-xl border border-dc-divider bg-dc-sidebar/70 p-4">
      <div className="flex items-center justify-between gap-2"><p className="font-semibold text-sm">{current.question}</p><span className="text-[10px] uppercase tracking-wide text-dc-text-muted">{closed ? 'Closed' : current.multipleChoice ? 'Multiple choice' : 'Poll'}</span></div>
      <div className="mt-3 space-y-2">
        {current.options.map((option) => {
          const count = option.voteCount || 0;
          const percent = total ? Math.round(count / total * 100) : 0;
          return (
            <button key={option.id} disabled={busy || closed} onClick={() => current.multipleChoice ? setSelected((old) => old.includes(option.id) ? old.filter((id) => id !== option.id) : [...old, option.id]) : void vote([option.id])} className={`relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-default ${selected.includes(option.id) ? 'border-dc-brand' : 'border-dc-divider'} bg-dc-channel`}>
              <span className="absolute inset-y-0 left-0 bg-dc-brand/20" style={{ width: `${percent}%` }} />
              <span className="relative flex justify-between gap-3"><span>{option.label}{option.votedByMe ? ' ✓' : ''}</span><span className="text-xs text-dc-text-muted">{count} · {percent}%</span></span>
            </button>
          );
        })}
      </div>
      {current.multipleChoice && !closed && <button disabled={busy || selected.length === 0} onClick={() => void vote(selected)} className="mt-3 rounded-lg bg-dc-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Submit vote</button>}
      <p className="mt-2 text-[11px] text-dc-text-muted">{total} vote{total === 1 ? '' : 's'}{current.anonymous ? ' · Anonymous poll' : ''}</p>
    </div>
  );
}

// Message Row Component
interface MessageRowProps {
  message: Message;
  isCurrentUser: boolean;
  showAvatar: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
  onReaction: (emoji: string) => void;
  showEmojiPicker: boolean;
  toggleEmojiPicker: () => void;
  quickEmojis: string[];
  formatTime: (date: Date) => string;
  editingId: string | null;
  editContent: string;
  setEditContent: (content: string) => void;
  handleEdit: (id: string) => void;
  setEditingId: (id: string | null) => void;
}

function MessageRow({ message, isCurrentUser, showAvatar, onReply, onEdit, onDelete, onPin, onReaction, showEmojiPicker, toggleEmojiPicker, quickEmojis, formatTime, editingId, editContent, setEditContent, handleEdit, setEditingId }: MessageRowProps) {
  const { openProfile, addNotification } = useUIStore();
  const markUnread = useChatStore((s) => s.markUnread);
  const { contextMenu, handleContextMenu, closeContextMenu } = useContextMenu();
  const statusColors: Record<string, string> = {
    online: 'bg-dc-green',
    idle: 'bg-dc-yellow',
    dnd: 'bg-dc-red',
    invisible: 'bg-gray-500',
    offline: 'bg-gray-500',
  };

  const renderContent = useRichContent();

  return (
    <div
      className={`message-row group relative py-0.5 px-2 -mx-2 rounded ${showAvatar ? 'mt-4' : ''}`}
      onContextMenu={(e) => handleContextMenu(e, message.id, isCurrentUser)}
    >
      {/* Reply indicator */}
      {message.replyTo && (
        <div className="flex items-center gap-2 ml-12 mb-1 text-xs text-dc-text-muted">
          <div className="w-8 h-0.5 bg-dc-divider rounded-full -mr-1"></div>
          <span className="font-medium text-dc-text hover:underline cursor-pointer">@{message.replyTo.author.username}</span>
          <span className="truncate">{message.replyTo.content}</span>
        </div>
      )}

      <div className="flex gap-4">
        {/* Avatar */}
        <div className="shrink-0 w-10">
          {showAvatar && (
            <div className="relative">
              <div
                onClick={() => openProfile(message.author.id)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Avatar
                  src={message.author.avatar}
                  name={message.author.username}
                  className="w-10 h-10 rounded-full bg-dc-brand text-white text-sm font-bold overflow-hidden"
                />
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-dc-chat ${statusColors[message.author.status] || statusColors.online}`}></div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {showAvatar && (
            <div className="flex items-center gap-2 mb-0.5">
              <span 
                onClick={() => openProfile(message.author.id)}
                className="font-medium text-white hover:underline cursor-pointer"
              >
                {message.botApplication?.name || message.author.username}
              </span>
              {message.botApplication && <span className="rounded bg-dc-brand px-1 py-0.5 text-[9px] font-bold text-white">BOT</span>}
              <span className="text-xs text-dc-text-muted">
                {formatTime(message.timestamp)}
              </span>
              {message.isPinned && <Pin className="w-3 h-3 text-dc-text-muted" />}
            </div>
          )}
          
          {editingId === message.id ? (
            <div className="flex gap-2">
              <input
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 bg-dc-input rounded-lg px-3 py-1.5 text-sm text-dc-text border border-dc-brand"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEdit(message.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                autoFocus
              />
              <span className="text-xs text-dc-text-muted self-end">escape to <button onClick={() => setEditingId(null)} className="text-dc-text-link hover:underline">cancel</button> • enter to <button onClick={() => handleEdit(message.id)} className="text-dc-text-link hover:underline">save</button></span>
            </div>
          ) : (
            <div className="text-sm text-dc-text break-words leading-relaxed">
              {renderContent(message.content)}
              {message.editedAt && <span className="text-xs text-dc-text-muted ml-1">(edited)</span>}
            </div>
          )}

          {message.poll && <PollCard poll={message.poll} channelId={message.channelId} />}

          {message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {message.attachments.map((file) => (
                <div key={file.id} className="max-w-xs">
                  {file.type === 'image' ? (
                    <a href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={file.filename} className="max-h-56 rounded-lg" /></a>
                  ) : file.type === 'video' ? (
                    <video src={file.url} controls className="max-h-56 rounded-lg" />
                  ) : file.type === 'audio' ? (
                    <audio src={file.url} controls />
                  ) : (
                    <a href={file.url} download={file.filename} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-dc-hover px-3 py-2 text-xs text-dc-text hover:underline">
                      📎 {file.filename}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Reactions */}
          {message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {message.reactions.map((reaction, i) => (
                <button
                  key={i}
                  onClick={() => onReaction(reaction.emoji)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    reaction.userIds.includes(message.author.id) 
                      ? 'bg-dc-brand/10 border-dc-brand/30 text-dc-brand' 
                      : 'bg-dc-dark border-dc-divider/30 text-dc-text-muted hover:border-dc-text-muted'
                  }`}
                >
                  <span>{reaction.emoji}</span>
                  <span>{reaction.count}</span>
                </button>
              ))}
              <button
                onClick={toggleEmojiPicker}
                className="flex items-center justify-center w-6 h-6 rounded-full bg-dc-dark border border-dc-divider/30 text-dc-text-muted hover:border-dc-text-muted transition-colors"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Message actions */}
      <div className="message-actions absolute -top-3 right-4 hidden bg-dc-dark border border-dc-divider/30 rounded-lg shadow-lg overflow-hidden">
        <button onClick={toggleEmojiPicker} className="p-1.5 hover:bg-dc-hover text-dc-text-muted hover:text-dc-text transition-colors">
          <Smile className="w-4 h-4" />
        </button>
        <button onClick={onReply} className="p-1.5 hover:bg-dc-hover text-dc-text-muted hover:text-dc-text transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 8.26667V4L3 11.4667L10 18.9333V14.56C15 14.56 18.5 16.2667 21 20C20 14.6667 17 9.33333 10 8.26667Z"/>
          </svg>
        </button>
        <button onClick={onPin} title={message.isPinned ? 'Unpin Message' : 'Pin Message'} className="p-1.5 hover:bg-dc-hover text-dc-text-muted hover:text-dc-text transition-colors">
          <Pin className="w-4 h-4" />
        </button>
        {isCurrentUser && (
          <>
            <button onClick={onEdit} className="p-1.5 hover:bg-dc-hover text-dc-text-muted hover:text-dc-text transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14.486 3.038a3.5 3.5 0 0 1 4.95 0l1.526 1.525a3.5 3.5 0 0 1 0 4.95L8.462 21.913a1 1 0 0 1-.46.263l-4.5 1.5a1 1 0 0 1-1.263-1.263l1.5-4.5a1 1 0 0 1 .263-.46L14.486 3.038Z"/>
              </svg>
            </button>
            <button onClick={onDelete} className="p-1.5 hover:bg-dc-hover text-dc-red hover:text-dc-red transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.405 2.228a.75.75 0 0 0-.633-.22H7.228a.75.75 0 0 0-.633.22L5.505 3.32A1.75 1.75 0 0 0 5 4.563V5h14v-.437a1.75 1.75 0 0 0-.505-1.243l-1.09-1.092ZM3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Zm5 4h8v8a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-8Z"/>
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Emoji picker popup */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-0 right-4 z-50"
          >
            <EmojiPicker
              compact
              quickEmojis={quickEmojis}
              onSelect={(emoji) => {
                onReaction(emoji);
                toggleEmojiPicker();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {contextMenu?.messageId === message.id && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isCurrentUser={isCurrentUser}
          onReply={onReply}
          onAddReaction={toggleEmojiPicker}
          onCopyText={() => { void navigator.clipboard?.writeText(message.content); }}
          onPin={onPin}
          onSave={() => { void api.saveMessage(message.id).then((response) => addNotification(response.success ? 'Message saved' : 'Could not save message', response.success ? 'Added to your saved messages.' : response.error || 'Please try again.', response.success ? 'success' : 'error')); }}
          onCopyLink={() => { void navigator.clipboard?.writeText(`${window.location.origin}/?message=${message.id}`); }}
          onMarkUnread={() => markUnread(message.channelId, message.id)}
          onEdit={isCurrentUser ? onEdit : undefined}
          onDelete={isCurrentUser ? onDelete : undefined}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

// Message Input Component
interface MessageInputProps {
  messageInput: string;
  setMessageInput: (value: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSend: () => void;
  replyingTo: Message | null;
  setReplyingTo: (msg: Message | null) => void;
  channelName: string;
  pendingFiles: File[];
  onFiles: (files: File[]) => void;
  uploading: boolean;
  channelId?: string;
}

function MessageInput({ messageInput, setMessageInput, handleKeyDown, handleSend, replyingTo, setReplyingTo, channelName, pendingFiles, onFiles, uploading, channelId }: MessageInputProps) {
  const [showComposerEmoji, setShowComposerEmoji] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [showScheduleCreator, setShowScheduleCreator] = useState(false);
  const [scheduledContent, setScheduledContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [featureBusy, setFeatureBusy] = useState(false);
  const [featureError, setFeatureError] = useState('');

  return (
    <div className="px-4 pb-6 pt-2 shrink-0">
      {channelId && (showPollCreator || showScheduleCreator) && (
        <div className="mb-3 rounded-xl border border-dc-divider bg-dc-sidebar p-4 space-y-3">
          {featureError && <p className="text-xs text-red-300">{featureError}</p>}
          {showPollCreator && (
            <>
              <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Create a poll</h4><button onClick={() => setShowPollCreator(false)} className="text-xs text-dc-text-muted">Close</button></div>
              <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="Ask a question…" className="w-full rounded-lg bg-dc-input p-2 text-sm" />
              {pollOptions.map((option, index) => <input key={index} value={option} onChange={(e) => setPollOptions((old) => old.map((value, i) => i === index ? e.target.value : value))} placeholder={`Option ${index + 1}`} className="w-full rounded-lg bg-dc-input p-2 text-sm" />)}
              <div className="flex flex-wrap items-center gap-2"><button onClick={() => setPollOptions((old) => old.length < 10 ? [...old, ''] : old)} disabled={pollOptions.length >= 10} className="text-xs text-dc-text-link">Add option</button><label className="ml-auto flex items-center gap-2 text-xs text-dc-text-muted"><input type="checkbox" checked={pollMultiple} onChange={(e) => setPollMultiple(e.target.checked)} /> Allow multiple answers</label></div>
              <button disabled={featureBusy || !pollQuestion.trim() || pollOptions.filter((v) => v.trim()).length < 2} onClick={async () => {
                setFeatureBusy(true); setFeatureError('');
                const sent = await api.sendMessage(channelId, pollQuestion.trim());
                if (!sent.success || !sent.data?.id) { setFeatureError(sent.error || 'Could not create poll message.'); setFeatureBusy(false); return; }
                const created = await api.createPoll(channelId, { messageId: sent.data.id, question: pollQuestion.trim(), options: pollOptions.map((v) => v.trim()).filter(Boolean), multipleChoice: pollMultiple });
                setFeatureBusy(false);
                if (!created.success) { setFeatureError(created.error || 'Message sent, but poll creation failed.'); return; }
                setPollQuestion(''); setPollOptions(['', '']); setPollMultiple(false); setShowPollCreator(false);
              }} className="rounded-lg bg-dc-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{featureBusy ? 'Creating…' : 'Create poll'}</button>
            </>
          )}
          {showScheduleCreator && (
            <>
              <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Schedule a message</h4><button onClick={() => setShowScheduleCreator(false)} className="text-xs text-dc-text-muted">Close</button></div>
              <textarea value={scheduledContent} onChange={(e) => setScheduledContent(e.target.value)} placeholder="Message content…" className="w-full rounded-lg bg-dc-input p-2 text-sm min-h-20" />
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="rounded-lg bg-dc-input p-2 text-sm" />
              <button disabled={featureBusy || !scheduledContent.trim() || !scheduledAt} onClick={async () => {
                setFeatureBusy(true); setFeatureError('');
                const response = await api.scheduleMessage(channelId, scheduledContent.trim(), new Date(scheduledAt).toISOString());
                setFeatureBusy(false);
                if (!response.success) { setFeatureError(response.error || 'Could not schedule message.'); return; }
                setScheduledContent(''); setScheduledAt(''); setShowScheduleCreator(false);
              }} className="rounded-lg bg-dc-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{featureBusy ? 'Scheduling…' : 'Schedule message'}</button>
            </>
          )}
        </div>
      )}
      {/* Reply indicator */}
      <AnimatePresence>
        {replyingTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-dc-sidebar/50 rounded-t-lg px-4 py-2 flex items-center gap-2 text-sm"
          >
            <span className="text-dc-text-muted">Replying to</span>
            <span className="text-white font-medium">@{replyingTo.author.username}</span>
            <button onClick={() => setReplyingTo(null)} className="ml-auto text-dc-text-muted hover:text-dc-text">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingFiles.map((file, index) => (
            <span key={`${file.name}-${index}`} className="flex items-center gap-2 bg-dc-sidebar rounded-full px-3 py-1 text-xs text-dc-text">
              {file.name}
              <button onClick={() => onFiles(pendingFiles.filter((_, i) => i !== index))} className="text-dc-text-muted hover:text-dc-red">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className={`bg-dc-input rounded-lg flex items-center px-4 ${replyingTo ? 'rounded-t-none' : ''}`}>
        <input
          type="file"
          multiple
          hidden
          onChange={(event) => {
            onFiles([...pendingFiles, ...Array.from(event.target.files || [])].slice(0, 10));
            event.target.value = '';
          }}
        />
        <button title="Attach files" className="p-2 text-dc-text-muted hover:text-dc-text transition-colors shrink-0" onClick={(event) => (event.currentTarget.previousElementSibling as HTMLInputElement)?.click()}>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2Z"/></svg>
        </button>
        <input
          type="text"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${channelName}`}
          className="flex-1 bg-transparent py-3 px-2 text-dc-text placeholder-dc-text-muted/50 text-sm border-none"
        />
        <div className="flex items-center gap-1 shrink-0">
          {channelId && <button type="button" title="Create poll" onClick={() => { setShowPollCreator((v) => !v); setShowScheduleCreator(false); setFeatureError(''); }} className="p-2 text-dc-text-muted hover:text-dc-text"><BarChart3 className="w-4 h-4" /></button>}
          {channelId && <button type="button" title="Schedule message" onClick={() => { setShowScheduleCreator((v) => !v); setShowPollCreator(false); setFeatureError(''); }} className="p-2 text-dc-text-muted hover:text-dc-text"><Clock3 className="w-4 h-4" /></button>}
          <button disabled title="Gifts are not available yet" className="p-2 text-dc-text-muted cursor-not-allowed">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-2.18A3 3 0 0 0 12 2.35 3 3 0 0 0 6.18 6H4a2 2 0 0 0-2 2v2h9V6h2v4h9V8a2 2 0 0 0-2-2ZM12 4a1 1 0 1 1 0 2H8a1 1 0 0 1 1-1 1 1 0 0 0 1-1 1 1 0 0 0-1-1h3Zm-8 8v8a2 2 0 0 0 2 2h5v-10H4Zm9 10h5a2 2 0 0 0 2-2v-8h-7v10Z"/></svg>
          </button>
          <button disabled title="Stickers are not available yet" className="p-2 text-dc-text-muted cursor-not-allowed">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.51-.19-.98-.5-1.33-.32-.36-.5-.82-.5-1.33 0-1.1.9-2 2-2h2c3.31 0 6-2.69 6-6 0-5.52-4.48-9.34-11-9.34Zm-3.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>
          </button>
          <div className="chat-emoji-anchor">
            <button
              type="button"
              title="Emoji"
              aria-label="Emoji"
              onClick={() => setShowComposerEmoji((value) => !value)}
              className="p-2 text-dc-text-muted hover:text-dc-text transition-colors"
            >
              <Smile className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {showComposerEmoji && (
                <motion.div
                  className="chat-emoji-pop"
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                >
                  <EmojiPicker
                    onSelect={(value) => {
                      setMessageInput(`${messageInput}${messageInput && !/\s$/.test(messageInput) ? ' ' : ''}${value}`);
                      setShowComposerEmoji(false);
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {messageInput.trim() && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              onClick={handleSend}
              className="p-2 text-dc-brand hover:text-dc-text-link transition-colors"
            >
              <Send className="w-5 h-5" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}

// Friends View
function FriendsView() {
  const { friends, createDirectMessage, removeFriend, blockUser, unblockUser, acceptFriend, declineFriend } = useChatStore();
  const { setShowAddFriend, friendFilter, setFriendFilter, friendSearch, setFriendSearch, addNotification } = useUIStore();

  const filteredFriends = friends.filter(f => {
    if (friendFilter === 'online') return f.status === 'accepted' && f.user.status === 'online';
    if (friendFilter === 'pending') return f.status === 'pending' || f.status === 'incoming';
    if (friendFilter === 'blocked') return f.status === 'blocked';
    if (friendSearch.trim()) {
      const query = friendSearch.trim().toLowerCase();
      if (!f.user.username.toLowerCase().includes(query) && !(f.user.bio || '').toLowerCase().includes(query)) return false;
    }
    return true;
  });

  const statusColors: Record<string, string> = {
    online: 'bg-dc-green',
    idle: 'bg-dc-yellow',
    dnd: 'bg-dc-red',
    invisible: 'bg-gray-500',
    offline: 'bg-gray-500',
  };

  return (
    <div className="flex-1 flex flex-col bg-dc-chat min-w-0">
      {/* Header */}
      <div className="h-12 px-4 flex items-center border-b border-dc-divider/30 shadow-sm shrink-0">
        <Users className="w-6 h-6 text-dc-text-muted mr-2" />
        <h3 className="font-bold text-white">Friends</h3>
        <button
          onClick={() => setShowAddFriend(true)}
          className="ml-auto mr-3 px-2.5 py-1.5 rounded bg-dc-brand hover:bg-dc-brand-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <UserPlus className="w-4 h-4" /> Add Friend
        </button>
        <NotificationBell inline />
        <div className="w-px h-6 bg-dc-divider mx-1"></div>
        <div className="flex items-center gap-1">
          {(['online', 'all', 'pending', 'blocked'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFriendFilter(tab)}
              className={`px-2 py-1 rounded text-sm transition-colors ${
                friendFilter === tab
                  ? 'bg-dc-active text-white'
                  : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-hover'
              }`}
            >
              {tab === 'all' ? 'All' : tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="relative ml-3">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-dc-text-muted" />
          <input
            value={friendSearch}
            onChange={(e) => setFriendSearch(e.target.value)}
            placeholder="Search friends"
            className="bg-dc-input text-sm text-dc-text placeholder-dc-text-muted/50 rounded pl-8 pr-2 py-1.5 w-40 border-none"
          />
        </div>
      </div>

      {/* Friends list */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredFriends.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-dc-text-muted">No friends to show here.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredFriends.map(friend => (
              <div key={friend.userId} className="flex items-center gap-3 px-2 py-3 rounded-lg hover:bg-dc-hover transition-colors border-t border-dc-divider/20">
                <div className="relative">
                  <Avatar
                    src={friend.user.avatar}
                    name={friend.user.username}
                    className="w-8 h-8 rounded-full bg-dc-brand text-white text-sm font-bold overflow-hidden"
                  />
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-dc-chat ${statusColors[friend.user.status]}`}></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{friend.user.username}</p>
                  <p className="text-xs text-dc-text-muted">{friend.user.status === 'online' ? 'Online' : friend.user.status === 'idle' ? 'Idle' : 'Offline'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {friend.status === 'incoming' && (
                    <>
                      <button
                        onClick={async () => { if (await acceptFriend(friend.userId)) addNotification('Friend added', `You and @${friend.user.username} are friends.`, 'success'); }}
                        title="Accept request"
                        className="px-3 h-9 rounded-full bg-dc-brand text-white text-xs font-medium hover:bg-dc-brand-hover"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => declineFriend(friend.userId)}
                        title="Reject request"
                        className="px-3 h-9 rounded-full bg-dc-input text-xs text-dc-text-muted hover:text-dc-text"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {friend.status === 'pending' && (
                    <button
                      onClick={() => declineFriend(friend.userId)}
                      title="Cancel request"
                      className="px-3 h-9 rounded-full bg-dc-input text-xs text-dc-text-muted hover:text-dc-text"
                    >
                      Cancel
                    </button>
                  )}
                  {(friend.status === 'accepted' || friend.status === 'incoming') && (
                    <button
                      onClick={() => createDirectMessage(friend.userId, friend.user)}
                      title="Message"
                      className="w-9 h-9 rounded-full bg-dc-sidebar flex items-center justify-center text-dc-text-muted hover:text-dc-text transition-colors"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </button>
                  )}
                  {friend.status === 'accepted' && (
                    <>
                      <button
                        onClick={async () => {
                          if (await removeFriend(friend.userId)) addNotification('Friend removed', `@${friend.user.username} was removed.`, 'success');
                          else addNotification('Error', 'Could not remove friend.', 'error');
                        }}
                        title="Remove friend"
                        className="w-9 h-9 rounded-full bg-dc-sidebar flex items-center justify-center text-dc-text-muted hover:text-dc-red transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={async () => {
                          if (await blockUser(friend.userId)) addNotification('User blocked', `@${friend.user.username} was blocked.`, 'success');
                          else addNotification('Error', 'Could not block user.', 'error');
                        }}
                        title="Block user"
                        className="w-9 h-9 rounded-full bg-dc-sidebar flex items-center justify-center text-dc-text-muted hover:text-dc-red transition-colors"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {friend.status === 'blocked' && (
                    <button
                      onClick={async () => {
                        if (await unblockUser(friend.userId)) addNotification('User unblocked', `@${friend.user.username} can reach you again.`, 'success');
                      }}
                      title="Unblock user"
                      className="px-3 h-9 rounded-full bg-dc-sidebar text-xs text-dc-text-muted hover:text-dc-text transition-colors"
                    >
                      Unblock
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageCircle(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  );
}
