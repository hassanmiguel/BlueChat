import { create } from 'zustand';
import { Server, Channel, Message, User, DirectMessage, Friend } from '../types';
import { api } from '../services/api';
import { useAuthStore } from './authStore';

interface ChatState {
  servers: Server[];
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDmId: string | null;
  messages: Record<string, Message[]>;
  directMessages: DirectMessage[];
  friends: Friend[];
  allUsers: User[];
  view: 'server' | 'friends' | 'dm';
  
  // Actions
  setActiveServer: (serverId: string | null) => void;
  setActiveChannel: (channelId: string) => void;
  setActiveDm: (dmId: string) => void;
  setView: (view: 'server' | 'friends' | 'dm') => void;
  
  // Server actions
  createServer: (name: string, icon?: string) => Promise<Server | null>;
  deleteServer: (serverId: string) => Promise<boolean>;
  joinServer: (inviteCode: string) => Promise<boolean>;
  leaveServer: (serverId: string) => Promise<boolean>;
  
  // Channel actions
  createChannel: (serverId: string, name: string, type: Channel['type']) => Promise<Channel | null>;
  
  // Message actions
  sendMessage: (channelId: string, content: string, author: User) => void;
  addReaction: (channelId: string, messageId: string, emoji: string, userId: string) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  editMessage: (channelId: string, messageId: string, content: string) => void;
  
  // DM actions
  createDirectMessage: (userId: string, user: User) => void;
  
  // Friend actions
  sendFriendRequest: (username: string) => Promise<boolean>;
  acceptFriend: (userId: string) => void;
  removeFriend: (userId: string) => void;
  
  // Data loading
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

// Load persisted data
const loadPersistedData = () => {
  try {
    const data = localStorage.getItem('bluechat_data');
    if (data) return JSON.parse(data);
  } catch (e) {}
  return null;
};

const persisted = loadPersistedData();

export const useChatStore = create<ChatState>((set, get) => ({
  servers: persisted?.servers || [],
  activeServerId: persisted?.activeServerId || null,
  activeChannelId: persisted?.activeChannelId || null,
  activeDmId: persisted?.activeDmId || null,
  messages: persisted?.messages || {},
  directMessages: persisted?.directMessages || [],
  friends: persisted?.friends || [],
  allUsers: persisted?.allUsers || [],
  view: 'friends',

  setActiveServer: (serverId) => {
    const server = get().servers.find(s => s.id === serverId);
    const firstTextChannel = server?.channels.find(c => c.type === 'text');
    set({ 
      activeServerId: serverId, 
      activeChannelId: firstTextChannel?.id || null,
      activeDmId: null,
      view: 'server',
    });
    get().saveToStorage();
  },

  setActiveChannel: (channelId) => {
    set({ activeChannelId: channelId, view: 'server' });
    get().saveToStorage();
  },

  setActiveDm: (dmId) => {
    set({ activeDmId: dmId, activeServerId: null, view: 'dm' });
    get().saveToStorage();
  },

  setView: (view) => {
    set({ view, activeServerId: view === 'server' ? get().activeServerId : null });
    get().saveToStorage();
  },

  createServer: async (name, icon) => {
    const user = useAuthStore.getState().user;
    if (!user) return null;

    // Try API first
    const response = await api.createServer({ name, icon });
    if (response.success && response.data) {
      const newServer = response.data as Server;
      set(state => ({ servers: [...state.servers, newServer] }));
      get().saveToStorage();
      return newServer;
    }

    // Fallback: create locally
    const serverId = `server_${Date.now()}`;
    const generalCategoryId = `cat_${Date.now()}_1`;
    const voiceCategoryId = `cat_${Date.now()}_2`;
    
    const newServer: Server = {
      id: serverId,
      name,
      icon: icon || '',
      ownerId: user.id,
      memberCount: 1,
      channels: [
        { id: `ch_${Date.now()}_1`, name: 'general', type: 'text', categoryId: generalCategoryId, topic: 'General discussion', isNsfw: false, position: 0 },
        { id: `ch_${Date.now()}_2`, name: 'off-topic', type: 'text', categoryId: generalCategoryId, topic: 'Anything goes', isNsfw: false, position: 1 },
        { id: `ch_${Date.now()}_3`, name: 'General', type: 'voice', categoryId: voiceCategoryId, isNsfw: false, position: 0 },
      ],
      roles: [
        { id: `role_${Date.now()}_1`, name: 'Admin', color: '#da373c', permissions: ['*'], position: 1 },
        { id: `role_${Date.now()}_2`, name: 'Member', color: '#949ba4', permissions: [], position: 0 },
      ],
      members: [{ userId: user.id, user, roleIds: [`role_${Date.now()}_1`], joinedAt: new Date() }],
    };

    set(state => ({ servers: [...state.servers, newServer] }));
    get().saveToStorage();
    return newServer;
  },

  deleteServer: async (serverId) => {
    await api.deleteServer(serverId);
    const currentServers = get().servers;
    const currentActiveServerId = get().activeServerId;
    set({
      servers: currentServers.filter(s => s.id !== serverId) as Server[],
      activeServerId: currentActiveServerId === serverId ? null : currentActiveServerId,
      activeChannelId: currentActiveServerId === serverId ? null : get().activeChannelId,
    });
    get().saveToStorage();
    return true;
  },

  joinServer: async (inviteCode) => {
    const response = await api.joinServer(inviteCode);
    if (response.success && response.data) {
      const server = response.data as Server;
      const currentServers = get().servers;
      set({ servers: [...currentServers, server] as Server[] });
      get().saveToStorage();
      return true;
    }
    return false;
  },

  leaveServer: async (serverId) => {
    await api.leaveServer(serverId);
    set(state => ({
      servers: state.servers.filter(s => s.id !== serverId),
      activeServerId: state.activeServerId === serverId ? null : state.activeServerId,
    }));
    get().saveToStorage();
    return true;
  },

  createChannel: async (serverId, name, type) => {
    const response = await api.createChannel(serverId, { name, type });
    if (response.success && response.data) {
      const channel = response.data as Channel;
      const currentServers = get().servers;
      set({
        servers: currentServers.map(s => 
          s.id === serverId ? { ...s, channels: [...s.channels, channel] } : s
        ) as Server[],
      });
      get().saveToStorage();
      return channel;
    }

    // Fallback
    const newChannel: Channel = {
      id: `ch_${Date.now()}`,
      name: name.toLowerCase().replace(/\s+/g, '-'),
      type,
      categoryId: `cat_${Date.now()}`,
      isNsfw: false,
      position: 0,
    };

    set(state => ({
      servers: state.servers.map(s => 
        s.id === serverId ? { ...s, channels: [...s.channels, newChannel] } : s
      ),
    }));
    get().saveToStorage();
    return newChannel;
  },

  sendMessage: (channelId, content, author) => {
    const newMessage: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      author,
      channelId,
      timestamp: new Date(),
      attachments: [],
      reactions: [],
      isPinned: false,
      mentions: [],
    };

    // Try API
    api.sendMessage(channelId, content);

    set(state => ({
      messages: {
        ...state.messages,
        [channelId]: [...(state.messages[channelId] || []), newMessage],
      },
    }));
    get().saveToStorage();
  },

  addReaction: (channelId, messageId, emoji, userId) => {
    set(state => {
      const channelMessages = state.messages[channelId] || [];
      const updatedMessages = channelMessages.map(msg => {
        if (msg.id === messageId) {
          const existingReaction = msg.reactions.find(r => r.emoji === emoji);
          if (existingReaction) {
            if (existingReaction.userIds.includes(userId)) {
              const newUserIds = existingReaction.userIds.filter(id => id !== userId);
              if (newUserIds.length === 0) {
                return { ...msg, reactions: msg.reactions.filter(r => r.emoji !== emoji) };
              }
              return { ...msg, reactions: msg.reactions.map(r => r.emoji === emoji ? { ...r, count: r.count - 1, userIds: newUserIds } : r) };
            }
            return { ...msg, reactions: msg.reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId] } : r) };
          }
          return { ...msg, reactions: [...msg.reactions, { emoji, count: 1, userIds: [userId] }] };
        }
        return msg;
      });
      return { messages: { ...state.messages, [channelId]: updatedMessages } };
    });
    get().saveToStorage();
  },

  deleteMessage: (channelId, messageId) => {
    api.deleteMessage(messageId);
    set(state => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).filter(msg => msg.id !== messageId),
      },
    }));
    get().saveToStorage();
  },

  editMessage: (channelId, messageId, content) => {
    api.editMessage(messageId, content);
    set(state => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map(msg => 
          msg.id === messageId ? { ...msg, content, editedAt: new Date() } : msg
        ),
      },
    }));
    get().saveToStorage();
  },

  createDirectMessage: (userId, user) => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;

    const existingDm = get().directMessages.find(dm => 
      !dm.isGroup && dm.participants.some(p => p.id === userId) && dm.participants.some(p => p.id === currentUser.id)
    );

    if (existingDm) {
      set({ activeDmId: existingDm.id, activeServerId: null, view: 'dm' });
      get().saveToStorage();
      return;
    }

    const newDm: DirectMessage = {
      id: `dm_${Date.now()}`,
      participants: [currentUser, user],
      isGroup: false,
    };

    set(state => ({
      directMessages: [...state.directMessages, newDm],
      activeDmId: newDm.id,
      activeServerId: null,
      view: 'dm',
    }));
    get().saveToStorage();
  },

  sendFriendRequest: async (username) => {
    const response = await api.sendFriendRequest(username);
    if (response.success) return true;
    
    // Fallback: check local accounts
    const storedAccounts = JSON.parse(localStorage.getItem('bluechat_accounts') || '[]');
    const targetUser = storedAccounts.find((a: any) => a.username.toLowerCase() === username.toLowerCase());
    
    if (!targetUser) return false;
    if (targetUser.id === useAuthStore.getState().user?.id) return false;

    const existingFriend = get().friends.find(f => f.userId === targetUser.id);
    if (existingFriend) return false;

    const { password: _, ...userWithoutPassword } = targetUser;
    const newFriend: Friend = {
      userId: targetUser.id,
      user: userWithoutPassword,
      status: 'pending',
    };

    set(state => ({ 
      friends: [...state.friends, newFriend],
      allUsers: [...state.allUsers.filter(u => u.id !== userWithoutPassword.id), userWithoutPassword],
    }));
    get().saveToStorage();
    return true;
  },

  acceptFriend: (userId) => {
    set(state => ({
      friends: state.friends.map(f => 
        f.userId === userId ? { ...f, status: 'accepted' as const } : f
      ),
    }));
    get().saveToStorage();
  },

  removeFriend: (userId) => {
    set(state => ({
      friends: state.friends.filter(f => f.userId !== userId),
    }));
    get().saveToStorage();
  },

  loadFromStorage: () => {
    const data = loadPersistedData();
    if (data) {
      set({
        servers: data.servers || [],
        activeServerId: data.activeServerId || null,
        activeChannelId: data.activeChannelId || null,
        activeDmId: data.activeDmId || null,
        messages: data.messages || {},
        directMessages: data.directMessages || [],
        friends: data.friends || [],
        allUsers: data.allUsers || [],
      });
    }
  },

  saveToStorage: () => {
    const state = get();
    const data = {
      servers: state.servers,
      activeServerId: state.activeServerId,
      activeChannelId: state.activeChannelId,
      activeDmId: state.activeDmId,
      messages: state.messages,
      directMessages: state.directMessages,
      friends: state.friends,
      allUsers: state.allUsers,
    };
    localStorage.setItem('bluechat_data', JSON.stringify(data));
  },
}));
