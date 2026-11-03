import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { Hash, Megaphone, BookOpen, Volume2, Pin, Users, Search, PlusCircle, Gift, Sticker, Smile, Send, MessageSquare, UserPlus } from 'lucide-react';
import { useUIStore } from '../stores/uiStore';
import { Message } from '../types';
import TypingIndicator from './TypingIndicator';


export default function ChatArea() {
  const { messages, activeChannelId, activeServerId, servers, sendMessage, addReaction, deleteMessage, editMessage, activeDmId, directMessages, view, setView } = useChatStore();
  const { toggleThreadPanel, toggleInviteModal, toggleSearchModal, openProfile, toggleCreateServer } = useUIStore();
  const [messageInput, setMessageInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showPins, setShowPins] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore(s => s.user);

  const activeServer = servers.find(s => s.id === activeServerId);
  const channel = activeServer?.channels.find(c => c.id === activeChannelId);
  const dm = directMessages.find(d => d.id === activeDmId);

  const currentMessages = messages[activeChannelId || activeDmId || ''] || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length]);

  const handleSend = () => {
    if (!messageInput.trim() || !user) return;
    
    const targetId = activeChannelId || activeDmId;
    if (!targetId) return;

    sendMessage(targetId, messageInput, user);
    setMessageInput('');
    setReplyingTo(null);
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
            <div className="w-6 h-6 rounded-full bg-dc-brand flex items-center justify-center text-white text-xs font-bold">
              {dm.isGroup ? '👥' : (otherUser?.username[0] || '?')}
            </div>
          </div>
          <h3 className="font-bold text-white">{dm.isGroup ? dm.name : otherUser?.username}</h3>
          {!dm.isGroup && otherUser && (
            <span className="ml-2 text-xs text-dc-text-muted">
              {otherUser.status === 'online' ? 'Online' : otherUser.status === 'idle' ? 'Idle' : 'Offline'}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button className="p-1.5 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM3 10v4h2v-4H3Z"/>
              </svg>
            </button>
            <button className="p-1.5 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors">
              <Search className="w-5 h-5" />
            </button>
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
        <TypingIndicator />

        {/* Input */}
        <MessageInput
          messageInput={messageInput}
          setMessageInput={setMessageInput}
          handleKeyDown={handleKeyDown}
          handleSend={handleSend}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          channelName={dm.isGroup ? dm.name || 'Group DM' : otherUser?.username || 'DM'}
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
                onClick={() => setView('friends')}
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
                    <p className="text-sm text-dc-text">{msg.content}</p>
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
          <MessageRow
            key={msg.id}
            message={msg}
            isCurrentUser={msg.author.id === user?.id}
            showAvatar={i === 0 || currentMessages[i - 1].author.id !== msg.author.id || new Date(msg.timestamp).getTime() - new Date(currentMessages[i - 1].timestamp).getTime() > 300000}
            onReply={() => setReplyingTo(msg)}
            onEdit={() => { setEditingId(msg.id); setEditContent(msg.content); }}
            onDelete={() => activeChannelId && deleteMessage(activeChannelId, msg.id)}
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
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      <TypingIndicator />

      {/* Message Input */}
      <MessageInput
        messageInput={messageInput}
        setMessageInput={setMessageInput}
        handleKeyDown={handleKeyDown}
        handleSend={handleSend}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        channelName={activeChannel.name}
      />
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

function MessageRow({ message, isCurrentUser, showAvatar, onReply, onEdit, onDelete, onReaction, showEmojiPicker, toggleEmojiPicker, quickEmojis, formatTime, editingId, editContent, setEditContent, handleEdit, setEditingId }: MessageRowProps) {
  const { openProfile } = useUIStore();
  const statusColors: Record<string, string> = {
    online: 'bg-dc-green',
    idle: 'bg-dc-yellow',
    dnd: 'bg-dc-red',
    invisible: 'bg-gray-500',
    offline: 'bg-gray-500',
  };

  const renderContent = (content: string) => {
    // Code blocks
    if (content.includes('```')) {
      const parts = content.split('```');
      return parts.map((part, i) => {
        if (i % 2 === 1) {
          const lines = part.split('\n');
          const lang = lines[0]?.trim();
          const code = lang ? lines.slice(1).join('\n') : part;
          return (
            <pre key={i} className="bg-dc-darker border border-dc-divider/30 rounded-lg p-3 my-1 overflow-x-auto">
              {lang && <div className="text-xs text-dc-text-muted mb-1">{lang}</div>}
              <code className="text-sm text-dc-text">{code}</code>
            </pre>
          );
        }
        return <span key={i}>{part}</span>;
      });
    }

    // Bold
    if (content.includes('**')) {
      const parts = content.split(/\*\*(.*?)\*\*/g);
      return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-bold">{part}</strong> : part);
    }

    // Mentions
    if (content.includes('@')) {
      const parts = content.split(/(@\w+)/g);
      return parts.map((part, i) => 
        part.startsWith('@') ? (
          <span key={i} className="bg-dc-brand/20 text-dc-brand rounded px-0.5 hover:bg-dc-brand/30 cursor-pointer">{part}</span>
        ) : part
      );
    }

    return content;
  };

  return (
    <div className={`message-row group relative py-0.5 px-2 -mx-2 rounded ${showAvatar ? 'mt-4' : ''}`}>
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
                className="w-10 h-10 rounded-full bg-dc-brand flex items-center justify-center text-white text-sm font-bold cursor-pointer hover:opacity-80 transition-opacity"
              >
                {message.author.username[0].toUpperCase()}
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
                {message.author.username}
              </span>
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
            className="absolute -top-10 right-4 bg-dc-dark border border-dc-divider/30 rounded-lg shadow-xl p-2 flex gap-1 z-50"
          >
            {quickEmojis.map(emoji => (
              <button
                key={emoji}
                onClick={() => { onReaction(emoji); toggleEmojiPicker(); }}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-dc-hover transition-colors text-lg"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
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
}

function MessageInput({ messageInput, setMessageInput, handleKeyDown, handleSend, replyingTo, setReplyingTo, channelName }: MessageInputProps) {
  return (
    <div className="px-4 pb-6 pt-2 shrink-0">
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

      <div className={`bg-dc-input rounded-lg flex items-center px-4 ${replyingTo ? 'rounded-t-none' : ''}`}>
        <button className="p-2 text-dc-text-muted hover:text-dc-text transition-colors shrink-0">
          <PlusCircle className="w-6 h-6" />
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
          <button className="p-2 text-dc-text-muted hover:text-dc-text transition-colors">
            <Gift className="w-5 h-5" />
          </button>
          <button className="p-2 text-dc-text-muted hover:text-dc-text transition-colors">
            <Sticker className="w-5 h-5" />
          </button>
          <button className="p-2 text-dc-text-muted hover:text-dc-text transition-colors">
            <Smile className="w-5 h-5" />
          </button>
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
  const { friends } = useChatStore();
  const [activeTab, setActiveTab] = useState('online');

  const filteredFriends = friends.filter(f => {
    if (activeTab === 'online') return f.user.status === 'online';
    if (activeTab === 'pending') return f.status === 'pending' || f.status === 'incoming';
    if (activeTab === 'blocked') return f.status === 'blocked';
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
        <div className="w-px h-6 bg-dc-divider mx-4"></div>
        <div className="flex items-center gap-1">
          {['Online', 'All', 'Pending', 'Blocked'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab.toLowerCase())}
              className={`px-2 py-1 rounded text-sm transition-colors ${
                activeTab === tab.toLowerCase() 
                  ? 'bg-dc-active text-white' 
                  : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-hover'
              }`}
            >
              {tab}
            </button>
          ))}
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
                  <div className="w-8 h-8 rounded-full bg-dc-brand flex items-center justify-center text-white text-sm font-bold">
                    {friend.user.username[0].toUpperCase()}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-dc-chat ${statusColors[friend.user.status]}`}></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{friend.user.username}</p>
                  <p className="text-xs text-dc-text-muted">{friend.user.status === 'online' ? 'Online' : friend.user.status === 'idle' ? 'Idle' : 'Offline'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="w-9 h-9 rounded-full bg-dc-sidebar flex items-center justify-center text-dc-text-muted hover:text-dc-text transition-colors">
                    <MessageCircle className="w-5 h-5" />
                  </button>
                  <button className="w-9 h-9 rounded-full bg-dc-sidebar flex items-center justify-center text-dc-text-muted hover:text-dc-text transition-colors">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm0 14c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4Z"/>
                    </svg>
                  </button>
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
