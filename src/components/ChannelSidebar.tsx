import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { Hash, Volume2, ChevronDown, ChevronRight, Plus, Megaphone, BookOpen, Settings, UserPlus, Search, MessageCircle, Inbox, HelpCircle, Phone, Pin } from 'lucide-react';
import { Channel, ChannelType } from '../types';
import VoiceControls from './VoiceControls';

export default function ChannelSidebar() {
  const { servers, activeServerId, activeChannelId, setActiveChannel, view, directMessages, setActiveDm, activeDmId, friends, setView } = useChatStore();
  const { toggleUserSettings, toggleServerSettings, toggleCreateServer, toggleInviteModal } = useUIStore();
  const { joinVoice, isInVoice, voiceChannelId } = useUIStore();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
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
          <button className="ml-auto p-1 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors">
            <UserPlus className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-2">
          <input
            type="text"
            placeholder="Find or start a conversation"
            className="w-full bg-dc-darker text-sm text-dc-text placeholder-dc-text-muted/50 rounded px-2 py-1.5 border-none"
          />
        </div>

        {/* Navigation */}
        <div className="px-2 space-y-0.5">
          <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded bg-dc-hover/50 text-white transition-colors text-sm font-medium">
            <MessageCircle className="w-5 h-5" />
            Friends
          </button>
          {['Online', 'All', 'Pending', 'Blocked'].map((tab) => (
            <button
              key={tab}
              className="w-full flex items-center gap-3 px-2 py-1.5 rounded text-dc-text-muted hover:text-dc-text hover:bg-dc-hover transition-colors text-sm"
            >
              {tab === 'Online' && <div className="w-2 h-2 rounded-full bg-dc-green"></div>}
              {tab === 'Pending' && <div className="w-2 h-2 rounded-full bg-dc-yellow"></div>}
              {tab}
            </button>
          ))}
          <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded text-dc-green hover:bg-dc-hover transition-colors text-sm font-medium">
            <UserPlus className="w-5 h-5" />
            Add Friend
          </button>
        </div>

        {/* Separator */}
        <div className="px-4 py-2 mt-2 flex items-center justify-between">
          <h3 className="text-xs font-bold text-dc-text-muted uppercase">Direct Messages</h3>
          <button className="text-dc-text-muted hover:text-dc-text">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* DMs */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {directMessages.map((dm) => {
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
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isGroup ? 'bg-dc-brand' : 'bg-dc-active'}`}>
                    {isGroup ? '👥' : (otherUser?.username[0] || '?')}
                  </div>
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
            <button
              onClick={() => toggleCategory(catId)}
              className="flex items-center gap-0.5 px-1 mb-1 w-full group"
            >
              {collapsedCategories.has(catId) ? (
                <ChevronRight className="w-3 h-3 text-dc-text-muted" />
              ) : (
                <ChevronDown className="w-3 h-3 text-dc-text-muted" />
              )}
              <span className="text-xs font-bold text-dc-text-muted uppercase tracking-wide group-hover:text-dc-text transition-colors">
                {cat.name}
              </span>
              <Plus className="w-4 h-4 text-dc-text-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            
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
                    <div key={channel.id}>
                      <button
                        onClick={() => {
                          if (channel.type === 'voice') {
                            joinVoice(channel.id, channel.name);
                          } else {
                            setActiveChannel(channel.id);
                          }
                        }}
                        className={`channel-item w-full flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors group ${
                          (channel.type === 'voice' && isInVoice && voiceChannelId === channel.id) || (channel.type !== 'voice' && activeChannelId === channel.id) ? 'active' : 'text-dc-text-muted hover:text-dc-text'
                        }`}
                      >
                        {getChannelIcon(channel.type)}
                        <span className="text-sm truncate flex-1 text-left">{channel.name}</span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {channel.type === 'voice' && isInVoice && voiceChannelId === channel.id && (
                            <Phone className="w-4 h-4 text-dc-green" />
                          )}
                          <Settings className="w-4 h-4 text-dc-text-muted hover:text-dc-text" />
                        </div>
                      </button>
                      {/* Show connected users in voice channel */}
                      {channel.type === 'voice' && isInVoice && voiceChannelId === channel.id && user && (
                        <div className="ml-6 mt-0.5 space-y-0.5">
                          <div className="flex items-center gap-1.5 py-0.5">
                            <div className="w-5 h-5 rounded-full bg-dc-brand flex items-center justify-center text-white text-[10px] font-bold">
                              {user.username[0]}
                            </div>
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
  const { toggleUserSettings } = useUIStore();
  const [showMenu, setShowMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

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
        <div className="w-8 h-8 rounded-full bg-dc-brand flex items-center justify-center text-white text-sm font-bold">
          {user.username[0].toUpperCase()}
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-dc-darker ${statusColors[user.status] || statusColors.online}`}></div>
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={toggleUserSettings}>
        <p className="text-sm font-medium text-white truncate">{user.username}</p>
        <p className="text-xs text-dc-text-muted truncate">{user.customStatus || `#${user.discriminator}`}</p>
      </div>
      <div className="flex items-center gap-0.5">
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className={`p-1.5 rounded transition-colors ${isMuted ? 'text-dc-red hover:bg-dc-red/10' : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-active'}`}
        >
          {isMuted ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6.7 11H5C5 12.19 5.34 13.3 5.9 14.28L7.13 13.05C6.86 12.43 6.7 11.74 6.7 11ZM9.01 11.085C9.015 11.1125 9.02 11.14 9.02 11.17L15 5.18V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 11.03 9.005 11.0575 9.01 11.085ZM11.72 14.28L12.95 13.05C12.68 12.43 12.52 11.74 12.52 11H10.82C10.82 11.74 10.99 12.43 11.26 13.05L11.72 14.28ZM19 11H17.29C17.29 11 17.29 11 17.29 11C17.29 7.93 14.87 5.32 11.72 5.01V3C11.72 2.45 11.28 2 10.72 2C10.17 2 9.72 2.45 9.72 3V5.01C6.57 5.32 4.15 7.93 4.15 11H2.44C1.89 11 1.44 11.45 1.44 12C1.44 12.55 1.89 13 2.44 13H4.07C4.29 15.47 5.82 17.53 7.94 18.56L7.02 19.48C6.63 19.87 6.63 20.51 7.02 20.9C7.41 21.29 8.05 21.29 8.44 20.9L19.44 9.9C19.83 9.51 19.83 8.87 19.44 8.48C19.05 8.09 18.41 8.09 18.02 8.48L17.29 9.21V11H19C19.55 11 20 11.45 20 12C20 12.55 19.55 11 19 11ZM14.74 11.17L11.02 14.89C11.34 15.56 11.82 16.13 12.42 16.54L14.74 14.22V11.17ZM15.64 18.31C14.83 18.75 13.95 19 13 19H11V21H13C14.19 21 15.31 20.69 16.29 20.15L15.64 18.31Z"/></svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2ZM17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.93V21H13V17.93C16.39 17.43 19 14.53 19 11H17Z"/></svg>
          )}
        </button>
        <button 
          onClick={() => setIsDeafened(!isDeafened)}
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
