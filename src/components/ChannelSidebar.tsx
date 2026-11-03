import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { Hash, Volume2, ChevronDown, ChevronRight, Plus, Megaphone, BookOpen, Settings, UserPlus } from 'lucide-react';
import { Channel, ChannelType } from '../types';

export default function ChannelSidebar() {
  const { servers, activeServerId, activeChannelId, setActiveChannel, view, directMessages, setActiveDm, activeDmId, friends, setView } = useChatStore();
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

  // Group channels by category
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
          <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded bg-dc-hover/50 text-dc-green hover:bg-dc-hover transition-colors text-sm font-medium">
            <UserPlus className="w-5 h-5" />
            Add Friend
          </button>
        </div>

        {/* Separator */}
        <div className="px-4 py-2 mt-2">
          <h3 className="text-xs font-bold text-dc-text-muted uppercase">Direct Messages</h3>
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
      </div>
    );
  }

  if (!activeServer) return null;

  const categories = getChannelsByCategory();

  return (
    <div className="w-60 bg-dc-sidebar flex flex-col shrink-0">
      {/* Server Header */}
      <button className="h-12 px-4 flex items-center justify-between border-b border-dc-divider/30 shadow-sm hover:bg-dc-hover transition-colors">
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
                    <button
                      key={channel.id}
                      onClick={() => channel.type !== 'voice' && setActiveChannel(channel.id)}
                      className={`channel-item w-full flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors group ${
                        activeChannelId === channel.id ? 'active' : 'text-dc-text-muted hover:text-dc-text'
                      }`}
                    >
                      {getChannelIcon(channel.type)}
                      <span className="text-sm truncate flex-1 text-left">{channel.name}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Settings className="w-4 h-4 text-dc-text-muted hover:text-dc-text" />
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* User Panel */}
      <UserPanel />
    </div>
  );
}

function UserPanel() {
  const user = useAuthStore(s => s.user);
  const { logout } = useAuthStore();
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  if (!user) return null;

  const statusColors: Record<string, string> = {
    online: 'bg-dc-green',
    idle: 'bg-dc-yellow',
    dnd: 'bg-dc-red',
    invisible: 'bg-gray-500',
    offline: 'bg-gray-500',
  };

  return (
    <div className="bg-dc-darker/60 p-2 flex items-center gap-2">
      <div className="relative">
        <div className="w-8 h-8 rounded-full bg-dc-brand flex items-center justify-center text-white text-sm font-bold">
          {user.username[0].toUpperCase()}
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-dc-darker ${statusColors[user.status] || statusColors.online}`}></div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{user.username}</p>
        <p className="text-xs text-dc-text-muted truncate">{user.customStatus || `#${user.discriminator}`}</p>
      </div>
      <div className="flex items-center gap-1">
        <button className="p-1.5 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM3 10v4h2v-4H3Zm13.14 1.33a1 1 0 0 1 .13 1.4A6 6 0 0 1 11.5 15a1 1 0 0 1 0-2 4 4 0 0 0 3.17-1.54 1 1 0 0 1 1.47-.13Z"/>
          </svg>
        </button>
        <button className="p-1.5 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.00305C6.486 2.00305 2 6.48805 2 12.0031V20.0031C2 21.1071 2.895 22.0031 4 22.0031H6C7.104 22.0031 8 21.1071 8 20.0031V17.0031C8 15.8991 7.104 15.0031 6 15.0031H4V12.0031C4 7.59105 7.589 4.00305 12 4.00305C16.411 4.00305 20 7.59105 20 12.0031V15.0031H18C16.896 15.0031 16 15.8991 16 17.0031V20.0031C16 21.1071 16.896 22.0031 18 22.0031H20C21.104 22.0031 22 21.1071 22 20.0031V12.0031C22 6.48805 17.514 2.00305 12 2.00305Z"/>
          </svg>
        </button>
        <button 
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          className="p-1.5 rounded hover:bg-dc-active text-dc-text-muted hover:text-dc-text transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
      
      {/* Status menu */}
      <AnimatePresence>
        {showStatusMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-16 left-2 bg-dc-popout rounded-lg shadow-xl border border-dc-divider/30 p-2 z-50 min-w-[180px]"
          >
            <button onClick={() => { logout(); setShowStatusMenu(false); }} className="w-full text-left px-3 py-2 text-sm text-dc-red hover:bg-dc-hover rounded transition-colors">
              Log Out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
