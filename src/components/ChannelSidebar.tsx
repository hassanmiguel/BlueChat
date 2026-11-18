import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { Hash, Volume2, ChevronDown, ChevronRight, Plus, Megaphone, BookOpen, Settings, UserPlus, Search, MessageCircle, Phone, X, Trash2 } from 'lucide-react';
import { Channel, ChannelType } from '../types';
import { socketService } from '../services/socket';
import VoiceControls from './VoiceControls';
import Avatar from './Avatar';

export default function ChannelSidebar() {
  const { servers, activeServerId, activeChannelId, setActiveChannel, view, directMessages, setActiveDm, activeDmId, setView, createChannel, updateChannel, deleteChannel } = useChatStore();
  const { toggleUserSettings, toggleServerSettings, setShowAddFriend, friendFilter, setFriendFilter, friendSearch, setFriendSearch } = useUIStore();
  const { joinVoice, isInVoice, voiceChannelId } = useUIStore();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [dmSearch, setDmSearch] = useState('');
  const [channelModal, setChannelModal] = useState<{ mode: 'create' | 'edit'; categoryId?: string; channel?: Channel } | null>(null);
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState<ChannelType>('text');
  const [channelTopic, setChannelTopic] = useState('');
  const [channelSlowMode, setChannelSlowMode] = useState(0);
  const [channelNsfw, setChannelNsfw] = useState(false);
  const [channelBusy, setChannelBusy] = useState(false);
  const user = useAuthStore(s => s.user);

  const activeServer = servers.find(s => s.id === activeServerId);

  const toggleCategory = (catId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const openCreateChannel = (categoryId?: string) => {
    setChannelName('');
    setChannelType('text');
    setChannelTopic('');
    setChannelSlowMode(0);
    setChannelNsfw(false);
    setChannelModal({ mode: 'create', categoryId });
  };

  const openEditChannel = (channel: Channel) => {
    setChannelName(channel.name);
    setChannelType(channel.type);
    setChannelTopic(channel.topic || '');
    setChannelSlowMode(channel.slowMode || 0);
    setChannelNsfw(channel.isNsfw);
    setChannelModal({ mode: 'edit', channel });
  };

  const saveChannel = async () => {
    if (!activeServer || !channelName.trim() || channelBusy) return;
    setChannelBusy(true);
    const modal = channelModal;
    if (modal?.mode === 'edit' && modal.channel) {
      const ok = await updateChannel(modal.channel.id, {
        name: channelName.trim(),
        topic: channelTopic,
        slowMode: channelSlowMode,
        isNsfw: channelNsfw,
      });
      if (ok) setChannelModal(null);
    } else {
      const created = await createChannel(activeServer.id, channelName.trim(), channelType, channelTopic, modal?.categoryId);
      if (created) {
        setChannelModal(null);
        if (created.type !== 'voice') setActiveChannel(created.id);
      }
    }
    setChannelBusy(false);
  };

  const removeChannel = async () => {
    const channel = channelModal?.channel;
    if (!channel || channelBusy) return;
    setChannelBusy(true);
    const ok = await deleteChannel(channel.id);
    setChannelBusy(false);
    if (ok) setChannelModal(null);
  };

  const getChannelIcon = (type: ChannelType) => {
    switch (type) {
      case 'text': return <Hash className="w-5 h-5 text-dc-text-muted shrink-0" />;
      case 'voice': return <Volume2 className="w-5 h-5 text-dc-text-muted shrink-0" />;
      case 'announcement': return <Megaphone className="w-5 h-5 text-dc-text-muted shrink-0" />;
      case 'forum': return <BookOpen className="w-5 h-5 text-dc-text-muted shrink-0" />;
    }
  };

  const getChannelsByCategory = () => {
    if (!activeServer) return {};
    const categories: Record<string, { name: string; channels: Channel[] }> = {};
    
    activeServer.channels.forEach(channel => {
      const catId = channel.categoryId || 'uncategorized';
      if (!categories[catId]) {
        categories[catId] = { name: catId === 'cat1' ? 'TEXT CHANNELS' : catId === 'cat2' ? 'DEVELOPMENT' : catId === 'cat3' ? 'VOICE CHANNELS' : catId === 'cat10' ? 'GENERAL' : catId === 'cat11' ? 'VOICE' : catId === 'cat20' ? 'ART' : catId === 'cat21' ? 'VOICE' : 'CHANNELS', channels: [] };
      }
      categories[catId].channels.push(channel);
    });
    
    return categories;
  };

  // Friends view
  if (view === 'friends') {
    return (
      <div className="w-60 bg-dc-sidebar flex flex-col shrink-0">
        {/* Header */}
        <div className="h-12 px-4 flex items-center border-b border-dc-divider/30 shadow-sm">
          <h2 className="font-bold text-white truncate">Friends</h2>
          <button onClick={() => setShowAddFriend(true)} title="Add Friend" className="ml-auto p-1 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors">
            <UserPlus className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-dc-text-muted" />
            <input
              type="text"
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              placeholder="Search friends"
              className="w-full bg-dc-darker text-sm text-dc-text placeholder-dc-text-muted/50 rounded pl-8 pr-2 py-1.5 border-none"
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="px-2 space-y-0.5">
          <button onClick={() => setView('friends')} className="w-full flex items-center gap-3 px-2 py-1.5 rounded bg-dc-hover/50 text-white transition-colors text-sm font-medium">
            <MessageCircle className="w-5 h-5" />
            Friends
          </button>
          {(['online', 'all', 'pending', 'blocked'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFriendFilter(tab)}
              className={`w-full flex items-center gap-3 px-2 py-1.5 rounded text-sm transition-colors ${
                friendFilter === tab ? 'bg-dc-hover text-dc-text' : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-hover'
              }`}
            >
              {tab === 'online' && <div className="w-2 h-2 rounded-full bg-dc-green"></div>}
              {tab === 'pending' && <div className="w-2 h-2 rounded-full bg-dc-yellow"></div>}
              {tab === 'blocked' && <div className="w-2 h-2 rounded-full bg-dc-red"></div>}
              {tab === 'all' ? 'All Friends' : `${tab[0].toUpperCase()}${tab.slice(1)}`}
            </button>
          ))}
          <button onClick={() => setShowAddFriend(true)} className="w-full flex items-center gap-3 px-2 py-1.5 rounded text-dc-green hover:bg-dc-hover transition-colors text-sm font-medium">
            <UserPlus className="w-5 h-5" />
            Add Friend
          </button>
        </div>

        {/* Separator */}
        <div className="px-4 py-2 mt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-dc-text-muted uppercase">Direct Messages</h3>
            <button onClick={() => setShowAddFriend(true)} title="Find people to message" className="text-dc-text-muted hover:text-dc-text transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <input
            type="text"
            value={dmSearch}
            onChange={(e) => setDmSearch(e.target.value)}
            placeholder="Find a conversation"
            className="mt-2 w-full bg-dc-darker text-sm text-dc-text placeholder-dc-text-muted/50 rounded px-2 py-1.5 border-none"
          />
        </div>

        {/* DMs */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {directMessages.filter(dm => {
            if (!dmSearch.trim()) return true;
            const query = dmSearch.toLowerCase();
            const otherUser = dm.participants.find(p => p.id !== user?.id);
            return (dm.name || '').toLowerCase().includes(query) || (otherUser?.username || '').toLowerCase().includes(query);
          }).map((dm) => {
            const otherUser = dm.participants.find(p => p.id !== user?.id);
            const isGroup = dm.isGroup;
            return (
              <button
                key={dm.id}
                onClick={() => setActiveDm(dm.id)}
                className={`w-full flex items-center gap-3 px-2 py-1.5 rounded transition-colors ${
                  activeDmId === dm.id ? 'bg-dc-active text-white' : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-hover'
                }`}
              >
                <div className="relative">
                  <Avatar
                    src={isGroup ? undefined : otherUser?.avatar}
                    name={isGroup ? '👥' : (otherUser?.username || '?')}
                    className={`w-8 h-8 rounded-full text-xs font-bold overflow-hidden ${isGroup ? 'bg-dc-brand' : 'bg-dc-active'}`}
                  />
                  {!isGroup && otherUser && (
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-dc-sidebar ${
                      otherUser.status === 'online' ? 'bg-dc-green' : otherUser.status === 'idle' ? 'bg-dc-yellow' : otherUser.status === 'dnd' ? 'bg-dc-red' : 'bg-gray-500'
                    }`}></div>
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">{isGroup ? dm.name : otherUser?.username}</p>
                  {dm.lastMessage && (
                    <p className="text-xs text-dc-text-muted truncate">{dm.lastMessage.content}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* User Panel */}
        <UserPanel />
      </div>
    );
  }

  if (!activeServer) return null;

  const categories = getChannelsByCategory();

  return (
    <div className="w-60 bg-dc-sidebar flex flex-col shrink-0">
      {/* Server Header */}
      <button 
        onClick={toggleServerSettings}
        className="h-12 px-4 flex items-center justify-between border-b border-dc-divider/30 shadow-sm hover:bg-dc-hover transition-colors"
      >
        <h2 className="font-bold text-white truncate">{activeServer.name}</h2>
        <ChevronDown className="w-4 h-4 text-dc-text-muted" />
      </button>

      {/* Channels */}
      <div className="flex-1 overflow-y-auto pt-4 px-2 space-y-4">
        {Object.entries(categories).map(([catId, cat]) => (
          <div key={catId}>
            <div className="flex items-center gap-0.5 px-1 mb-1 w-full group">
              <button
                onClick={() => toggleCategory(catId)}
                className="flex flex-1 items-center gap-0.5 text-left"
              >
                {collapsedCategories.has(catId) ? (
                  <ChevronRight className="w-3 h-3 text-dc-text-muted" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-dc-text-muted" />
                )}
                <span className="text-xs font-bold text-dc-text-muted uppercase tracking-wide group-hover:text-dc-text transition-colors">
                  {cat.name}
                </span>
              </button>
              <button
                onClick={() => openCreateChannel(catId === 'uncategorized' ? undefined : catId)}
                title="Create channel"
                className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-dc-text-muted hover:text-dc-text"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <AnimatePresence>
              {!collapsedCategories.has(catId) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-0.5 overflow-hidden"
                >
                  {cat.channels.map((channel) => (
                    <div key={channel.id} className="group/channel relative">
                      <button
                        onClick={() => {
                          if (channel.type === 'voice') {
                            joinVoice(channel.id, channel.name);
                            socketService.joinVoice(channel.id);
                          } else {
                            setActiveChannel(channel.id);
                          }
                        }}
                        className={`channel-item w-full flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors ${
                          (channel.type === 'voice' && isInVoice && voiceChannelId === channel.id) || (channel.type !== 'voice' && activeChannelId === channel.id) ? 'active' : 'text-dc-text-muted hover:text-dc-text'
                        }`}
                      >
                        {getChannelIcon(channel.type)}
                        <span className="text-sm truncate flex-1 text-left">{channel.name}</span>
                        {channel.type === 'voice' && isInVoice && voiceChannelId === channel.id && (
                          <Phone className="w-4 h-4 text-dc-green" />
                        )}
                      </button>
                      <button
                        onClick={() => openEditChannel(channel)}
                        title="Channel settings"
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/channel:opacity-100 transition-opacity p-0.5 text-dc-text-muted hover:text-dc-text"
                      >
                        <Settings className="w-3.5 h-3.5" />
                      </button>
                      {/* Show connected users in voice channel */}
                      {channel.type === 'voice' && isInVoice && voiceChannelId === channel.id && user && (
                        <div className="ml-6 mt-0.5 space-y-0.5">
                          <div className="flex items-center gap-1.5 py-0.5">
                            <Avatar src={user.avatar} name={user.username} className="w-5 h-5 rounded-full bg-dc-brand text-white text-[10px] font-bold overflow-hidden" />
                            <span className="text-xs text-dc-text-muted">{user.username} (You)</span>
                          </div>
                        </div>
                      )}                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {channelModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => setChannelModal(null)}>
          <div className="w-full max-w-sm rounded-xl border border-dc-divider/40 bg-dc-popout p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-dc-text">{channelModal.mode === 'create' ? 'Create channel' : 'Edit channel'}</h3>
              <button onClick={() => setChannelModal(null)} className="text-dc-text-muted hover:text-dc-text"><X className="w-4 h-4" /></button>
            </div>
            <label className="block text-xs font-bold uppercase text-dc-text-muted mb-1">Name</label>
            <input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="new-channel"
              className="w-full bg-dc-input rounded px-3 py-2 text-sm text-dc-text border-none mb-3"
            />
            {channelModal.mode === 'create' && (
              <>
                <label className="block text-xs font-bold uppercase text-dc-text-muted mb-1">Type</label>
                <select
                  value={channelType}
                  onChange={(e) => setChannelType(e.target.value as ChannelType)}
                  className="w-full bg-dc-input rounded px-3 py-2 text-sm text-dc-text border-none mb-3"
                >
                  <option value="text">Text</option>
                  <option value="voice">Voice</option>
                  <option value="announcement">Announcement</option>
                  <option value="forum">Forum</option>
                </select>
              </>
            )}
            <label className="block text-xs font-bold uppercase text-dc-text-muted mb-1">Topic</label>
            <input
              value={channelTopic}
              onChange={(e) => setChannelTopic(e.target.value)}
              placeholder="What is this channel for?"
              className="w-full bg-dc-input rounded px-3 py-2 text-sm text-dc-text border-none mb-3"
            />
            <label className="block text-xs font-bold uppercase text-dc-text-muted mb-1">Slow mode (seconds)</label>
            <input
              type="number"
              min={0}
              value={channelSlowMode}
              onChange={(e) => setChannelSlowMode(Math.max(0, Number(e.target.value)))}
              className="w-full bg-dc-input rounded px-3 py-2 text-sm text-dc-text border-none mb-3"
            />
            <label className="flex items-center gap-2 text-sm text-dc-text mb-4">
              <input type="checkbox" checked={channelNsfw} onChange={(e) => setChannelNsfw(e.target.checked)} />
              Age-restricted channel
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={saveChannel}
                disabled={channelBusy || !channelName.trim()}
                className="flex-1 bg-dc-brand hover:bg-dc-brand-hover text-white rounded py-2 text-sm font-medium disabled:opacity-50"
              >
                {channelBusy ? 'Saving...' : channelModal.mode === 'create' ? 'Create channel' : 'Save changes'}
              </button>
              {channelModal.mode === 'edit' && (
                <button onClick={removeChannel} disabled={channelBusy} title="Delete channel" className="p-2 rounded bg-dc-input text-dc-red hover:bg-dc-red/10">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            {useChatStore.getState().error && (
              <p className="mt-3 text-xs text-dc-red">{useChatStore.getState().error}</p>
            )}
          </div>
        </div>
      )}

      {/* Voice Controls (when in voice) */}
      <VoiceControls />

      {/* User Panel */}
      <UserPanel />
    </div>
  );
}

function UserPanel() {
  const user = useAuthStore(s => s.user);
  const { logout } = useAuthStore();
  const { toggleUserSettings, isMuted, isDeafened, toggleMute, toggleDeafen, voiceChannelId } = useUIStore();
  const [showMenu, setShowMenu] = useState(false);

  const handleToggleMute = () => {
    toggleMute();
    if (voiceChannelId) socketService.setMuted(voiceChannelId, !isMuted);
  };

  const handleToggleDeafen = () => {
    toggleDeafen();
    if (voiceChannelId) socketService.setDeafened(voiceChannelId, !isDeafened);
  };

  if (!user) return null;

  const statusColors: Record<string, string> = {
    online: 'bg-dc-green',
    idle: 'bg-dc-yellow',
    dnd: 'bg-dc-red',
    invisible: 'bg-gray-500',
    offline: 'bg-gray-500',
  };

  return (
    <div className="bg-dc-darker/60 p-2 flex items-center gap-2 relative">
      <div className="relative">
        <Avatar src={user.avatar} name={user.username} className="w-8 h-8 rounded-full bg-dc-brand text-white text-sm font-bold overflow-hidden" />
        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-dc-darker ${statusColors[user.status] || statusColors.online}`}></div>
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={toggleUserSettings}>
        <p className="text-sm font-medium text-white truncate">{user.username}</p>
        <p className="text-xs text-dc-text-muted truncate">{user.customStatus || `#${user.discriminator}`}</p>
      </div>
      <div className="flex items-center gap-0.5">
        <button 
          onClick={handleToggleMute}
          className={`p-1.5 rounded transition-colors ${isMuted ? 'text-dc-red hover:bg-dc-red/10' : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-active'}`}
        >
          {isMuted ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6.7 11H5C5 12.19 5.34 13.3 5.9 14.28L7.13 13.05C6.86 12.43 6.7 11.74 6.7 11ZM9.01 11.085C9.015 11.1125 9.02 11.14 9.02 11.17L15 5.18V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 11.03 9.005 11.0575 9.01 11.085ZM11.72 14.28L12.95 13.05C12.68 12.43 12.52 11.74 12.52 11H10.82C10.82 11.74 10.99 12.43 11.26 13.05L11.72 14.28ZM19 11H17.29C17.29 11 17.29 11 17.29 11C17.29 7.93 14.87 5.32 11.72 5.01V3C11.72 2.45 11.28 2 10.72 2C10.17 2 9.72 2.45 9.72 3V5.01C6.57 5.32 4.15 7.93 4.15 11H2.44C1.89 11 1.44 11.45 1.44 12C1.44 12.55 1.89 13 2.44 13H4.07C4.29 15.47 5.82 17.53 7.94 18.56L7.02 19.48C6.63 19.87 6.63 20.51 7.02 20.9C7.41 21.29 8.05 21.29 8.44 20.9L19.44 9.9C19.83 9.51 19.83 8.87 19.44 8.48C19.05 8.09 18.41 8.09 18.02 8.48L17.29 9.21V11H19C19.55 11 20 11.45 20 12C20 12.55 19.55 11 19 11ZM14.74 11.17L11.02 14.89C11.34 15.56 11.82 16.13 12.42 16.54L14.74 14.22V11.17ZM15.64 18.31C14.83 18.75 13.95 19 13 19H11V21H13C14.19 21 15.31 20.69 16.29 20.15L15.64 18.31Z"/></svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2ZM17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.93V21H13V17.93C16.39 17.43 19 14.53 19 11H17Z"/></svg>
          )}
        </button>
        <button 
          onClick={handleToggleDeafen}
          className={`p-1.5 rounded transition-colors ${isDeafened ? 'text-dc-red hover:bg-dc-red/10' : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-active'}`}
        >
          {isDeafened ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12V20C2 21.1 2.9 22 4 22H6C7.1 22 8 21.1 8 20V17C8 15.9 7.1 15 6 15H4V12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12V15H18C16.9 15 16 15.9 16 17V20C16 21.1 16.9 22 18 22H20C21.1 22 22 21.1 22 20V12C22 6.48 17.52 2 12 2ZM3.44 2.56L2 4L20.56 22.56L22 21.12L3.44 2.56Z"/></svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12V20C2 21.1 2.9 22 4 22H6C7.1 22 8 21.1 8 20V17C8 15.9 7.1 15 6 15H4V12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12V15H18C16.9 15 16 15.9 16 17V20C16 21.1 16.9 22 18 22H20C21.1 22 22 21.1 22 20V12C22 6.48 17.52 2 12 2Z"/></svg>
          )}
        </button>
        <button 
          onClick={() => setShowMenu(!showMenu)}
          className="p-1.5 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
      
      {/* Menu popup */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-14 left-2 right-2 bg-dc-popout rounded-lg shadow-xl border border-dc-divider/30 p-1.5 z-50"
          >
            <button onClick={() => { toggleUserSettings(); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-dc-text hover:bg-dc-hover rounded transition-colors flex items-center gap-2">
              <Settings className="w-4 h-4" />
              User Settings
            </button>
            <div className="border-t border-dc-divider/30 my-1"></div>
            <button onClick={() => { logout(); setShowMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-dc-red hover:bg-dc-red/10 rounded transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M16 17V14H9V10H16V7L21 12L16 17ZM14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.89 22 5.99 22H14C15.1 22 16 21.1 16 20V19H14V20H6V4H14V5H16V4C16 2.9 15.1 2 14 2Z"/></svg>
              Log Out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
