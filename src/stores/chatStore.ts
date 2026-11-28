import { create } from 'zustand';
import { Server, Channel, Message, User, DirectMessage, Friend, Attachment } from '../types';
import { api } from '../services/api';
import { useAuthStore } from './authStore';

interface ChatState {
  servers: Server[];
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDmId: string | null;
  messages: Record<string, Message[]>;
  unreadFrom: Record<string, string | null>;
  drafts: Record<string, string>;
  directMessages: DirectMessage[];
  friends: Friend[];
  allUsers: User[];
  view: 'server' | 'friends' | 'dm';
  isLoading: boolean;
  error: string | null;

  hydrate: () => Promise<void>;
  refreshFriends: () => Promise<void>;
  refreshDirectMessages: (dmId?: string) => Promise<void>;
  loadMessages: (channelId: string) => Promise<void>;
  loadDmMessages: (dmId: string) => Promise<void>;
  markUnread: (conversationId: string, messageId: string) => void;
  clearUnread: (conversationId: string) => void;
  setDraft: (conversationId: string, value: string) => void;
  setActiveServer: (serverId: string | null) => void;
  setActiveChannel: (channelId: string) => void;
  setActiveDm: (dmId: string) => void;
  setView: (view: 'server' | 'friends' | 'dm') => void;

  createServer: (name: string, icon?: string) => Promise<Server | null>;
  deleteServer: (serverId: string) => Promise<boolean>;
  joinServer: (inviteCode: string) => Promise<boolean>;
  leaveServer: (serverId: string) => Promise<boolean>;
  createChannel: (serverId: string, name: string, type: Channel['type'], topic?: string, categoryId?: string) => Promise<Channel | null>;
  updateChannel: (channelId: string, updates: { name?: string; topic?: string; slowMode?: number; isNsfw?: boolean }) => Promise<boolean>;
  deleteChannel: (channelId: string) => Promise<boolean>;

  sendMessage: (channelId: string, content: string, author: User, replyTo?: string, attachments?: Attachment[]) => Promise<boolean>;
  addReaction: (channelId: string, messageId: string, emoji: string, userId: string) => Promise<void>;
  deleteMessage: (channelId: string, messageId: string) => Promise<boolean>;
  editMessage: (channelId: string, messageId: string, content: string) => Promise<boolean>;
  createDirectMessage: (userId: string, user: User) => Promise<boolean>;
  createGroupDirectMessage: (userIds: string[], name?: string) => Promise<boolean>;
  updateDirectMessage: (dmId: string, updates: { name?: string; description?: string; avatar?: string }) => Promise<boolean>;
  addDmParticipants: (dmId: string, userIds: string[]) => Promise<boolean>;
  removeDmParticipant: (dmId: string, userId: string) => Promise<boolean>;
  transferDmOwner: (dmId: string, userId: string) => Promise<boolean>;
  pinMessage: (conversationId: string, messageId: string) => Promise<boolean>;
  sendFriendRequest: (username: string) => Promise<boolean>;
  acceptFriend: (userId: string) => Promise<boolean>;
  declineFriend: (userId: string) => Promise<boolean>;
  removeFriend: (userId: string) => Promise<boolean>;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;

  applyRemoteMessage: (channelId: string, message: Message) => void;
  applyRemoteEdit: (channelId: string, messageId: string, content: string) => void;
  applyRemoteDelete: (channelId: string, messageId: string) => void;
  applyRemoteReaction: (channelId: string, messageId: string, userId: string, emoji: string, action: 'add' | 'remove') => void;
  applyRemotePin: (channelId: string, messageId: string, isPinned: boolean) => void;
  applyRemoteDmReaction: (dmId: string, messageId: string, userId: string, emoji: string, action: 'add' | 'remove') => void;
  applyRemoteDmPin: (dmId: string, messageId: string, isPinned: boolean) => void;
  clearAll: () => void;
}

const mediaOrigin = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');
const mediaUrl = (value?: string): string => {
  if (!value) return '';
  if (/^(https?:|blob:|data:)/.test(value)) return value;
  return `${mediaOrigin}${value.startsWith('/') ? value : `/${value}`}`;
};

const normalizeUser = (raw: any): User => ({
  id: raw.id,
  username: raw.username,
  discriminator: raw.discriminator || '0001',
  email: raw.email || '',
  avatar: mediaUrl(raw.avatar),
  banner: mediaUrl(raw.banner),
  bio: raw.bio,
  status: String(raw.status || 'offline').toLowerCase() as User['status'],
  customStatus: raw.customStatus,
  createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
});

const normalizeChannel = (raw: any): Channel => ({
  id: raw.id,
  name: raw.name,
  type: String(raw.type || 'text').toLowerCase() as Channel['type'],
  categoryId: raw.categoryId ?? undefined,
  topic: raw.topic ?? undefined,
  isNsfw: Boolean(raw.isNsfw),
  slowMode: raw.slowMode ?? undefined,
  position: raw.position ?? 0,
});

const normalizeServer = (raw: any): Server => ({
  id: raw.id,
  name: raw.name,
  icon: raw.icon || '',
  banner: raw.banner ?? undefined,
  ownerId: raw.ownerId,
  inviteCode: raw.inviteCode,
  memberCount: raw.members?.length ?? raw._count?.members ?? 1,
  channels: (raw.channels || []).map(normalizeChannel),
  roles: (raw.roles || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    color: r.color || '#949ba4',
    permissions: r.permissions || [],
    position: r.position || 0,
  })),
  members: (raw.members || []).map((m: any) => ({
    userId: m.userId ?? m.user?.id,
    user: normalizeUser(m.user || {}),
    roleIds: (m.roles || []).map((rm: any) => rm.roleId ?? rm.role?.id).filter(Boolean),
    joinedAt: m.joinedAt ? new Date(m.joinedAt) : new Date(),
  })),
});

export const normalizeMessage = (raw: any, channelId?: string): Message => ({
  id: raw.id,
  content: raw.content,
  author: normalizeUser(raw.author || {}),
  channelId: raw.channelId || channelId || '',
  timestamp: raw.createdAt ? new Date(raw.createdAt) : new Date(),
  editedAt: raw.updatedAt && raw.updatedAt !== raw.createdAt ? new Date(raw.updatedAt) : undefined,
  attachments: (raw.attachments || []).map((item: any) => ({
    id: item.id,
    filename: item.filename || item.name || 'attachment',
    url: mediaUrl(item.url),
    size: item.size || 0,
    mimeType: item.mimeType || item.type,
    type: String(item.mimeType || item.type || '').startsWith('image/')
      ? 'image'
      : String(item.mimeType || item.type || '').startsWith('video/')
        ? 'video'
        : String(item.mimeType || item.type || '').startsWith('audio/')
          ? 'audio'
          : 'file',
  })),
  reactions: raw.reactions || [],
  replyTo: raw.replyTo ? normalizeMessage(raw.replyTo) : undefined,
  isPinned: Boolean(raw.isPinned),
  mentions: [],
  botApplication: raw.botApplication ? { id: raw.botApplication.id, name: raw.botApplication.name, avatar: mediaUrl(raw.botApplication.avatar) } : undefined,
  poll: raw.poll ? {
    id: raw.poll.id,
    question: raw.poll.question,
    multipleChoice: Boolean(raw.poll.multipleChoice),
    anonymous: Boolean(raw.poll.anonymous),
    closedAt: raw.poll.closedAt,
    expiresAt: raw.poll.expiresAt,
    options: (raw.poll.options || []).map((option: any) => ({
      id: option.id,
      label: option.label,
      voteCount: option.votes?.length ?? option.voteCount ?? 0,
      votedByMe: option.votedByMe ?? option.votes?.some((vote: any) => vote.userId === useAuthStore.getState().user?.id),
      voters: option.voters ?? option.votes?.map((vote: any) => vote.userId),
    })),
  } : undefined,
});

const normalizeDm = (raw: any): DirectMessage => ({
  id: raw.id,
  participants: (raw.participants || []).map((p: any) => normalizeUser(p.user || {})),
  isGroup: Boolean(raw.isGroup),
  name: raw.name || undefined,
  description: raw.description || undefined,
  avatar: mediaUrl(raw.avatar),
  ownerId: raw.ownerId || undefined,
  lastMessage: raw.messages?.[0] ? normalizeMessage(raw.messages[0], raw.id) : undefined,
});

const normalizeFriends = (data: any): Friend[] => {
  const friends: Friend[] = [];
  for (const item of data?.acceptedFriends || []) {
    const other = item.senderId === useAuthStore.getState().user?.id ? item.receiver : item.sender;
    friends.push({ requestId: item.id, userId: other.id, user: normalizeUser(other), status: 'accepted' });
  }
  for (const item of data?.sentRequests || []) {
    if (item.status === 'PENDING') {
      friends.push({ requestId: item.id, userId: item.receiver.id, user: normalizeUser(item.receiver), status: 'pending' });
    }
  }
  for (const item of data?.receivedRequests || []) {
    friends.push({ requestId: item.id, userId: item.sender.id, user: normalizeUser(item.sender), status: 'incoming' });
  }
  for (const item of data?.blocks || []) {
    friends.push({ userId: item.blocked.id, user: normalizeUser(item.blocked), status: 'blocked' });
  }
  return friends;
};

const errorMessage = (response: { error?: string }, fallback: string) => response.error || fallback;

export const useChatStore = create<ChatState>((set, get) => ({
  servers: [],
  activeServerId: null,
  activeChannelId: null,
  activeDmId: null,
  messages: {},
  unreadFrom: {},
  drafts: {},
  directMessages: [],
  friends: [],
  allUsers: [],
  view: 'friends',
  isLoading: false,
  error: null,

  hydrate: async () => {
    set({ isLoading: true, error: null });
    const [serversRes, dmsRes, friendsRes] = await Promise.all([
      api.getServers(),
      api.getDirectMessages(),
      api.getFriends(),
    ]);

    if (!serversRes.success || !dmsRes.success || !friendsRes.success) {
      set({
        isLoading: false,
        error: errorMessage(serversRes as any, errorMessage(dmsRes as any, errorMessage(friendsRes as any, 'Failed to load data'))),
      });
      return;
    }

    const servers = (serversRes.data as any[]).map(normalizeServer);
    const directMessages = (dmsRes.data as any[]).map(normalizeDm);
    const friends = normalizeFriends(friendsRes.data);
    const allUsers = [
      ...friends.map((f) => f.user),
      ...servers.flatMap((s) => s.members.map((m) => m.user)),
      ...directMessages.flatMap((dm) => dm.participants),
    ].filter((user, index, users) => users.findIndex((u) => u.id === user.id) === index);

    const activeServerId = servers.some((s) => s.id === get().activeServerId) ? get().activeServerId : null;
    const activeServer = servers.find((s) => s.id === activeServerId);
    const activeChannelId = activeServer?.channels.find((c) => c.id === get().activeChannelId)?.id
      ?? activeServer?.channels.find((c) => c.type === 'text')?.id
      ?? null;
    const activeDmId = directMessages.some((dm) => dm.id === get().activeDmId) ? get().activeDmId : null;

    set({
      servers,
      directMessages,
      friends,
      allUsers,
      activeServerId,
      activeChannelId,
      activeDmId,
      isLoading: false,
    });

    if (activeChannelId) await get().loadMessages(activeChannelId);
    if (activeDmId) await get().loadDmMessages(activeDmId);
  },

  refreshFriends: async () => {
    const response = await api.getFriends();
    if (response.success && response.data) {
      const friends = normalizeFriends(response.data);
      set((state) => ({
        friends,
        allUsers: [
          ...friends.map((f) => f.user),
          ...state.servers.flatMap((s) => s.members.map((m) => m.user)),
          ...state.directMessages.flatMap((dm) => dm.participants),
        ].filter((user, index, users) => users.findIndex((u) => u.id === user.id) === index),
      }));
    }
  },

  refreshDirectMessages: async (dmId) => {
    const response = await api.getDirectMessages();
    if (!response.success || !response.data) return;
    const directMessages = (response.data as any[]).map(normalizeDm);
    set((state) => ({
      directMessages,
      allUsers: [
        ...state.friends.map((friend) => friend.user),
        ...state.servers.flatMap((server) => server.members.map((member) => member.user)),
        ...directMessages.flatMap((dm) => dm.participants),
      ].filter((user, index, users) => users.findIndex((item) => item.id === user.id) === index),
    }));
    if (dmId && get().activeDmId === dmId) await get().loadDmMessages(dmId);
  },

  loadMessages: async (channelId) => {
    const response = await api.getMessages(channelId);
    if (response.success && response.data) {
      const messages = (response.data as any[]).map((raw) => normalizeMessage(raw, channelId));
      set((state) => ({ messages: { ...state.messages, [channelId]: messages } }));
    }
  },

  loadDmMessages: async (dmId) => {
    const response = await api.getDmMessages(dmId);
    if (response.success && response.data) {
      const messages = (response.data as any[]).map((raw) => normalizeMessage(raw, dmId));
      set((state) => ({ messages: { ...state.messages, [dmId]: messages } }));
    }
  },

  markUnread: (conversationId, messageId) => {
    set((state) => ({ unreadFrom: { ...state.unreadFrom, [conversationId]: messageId } }));
  },

  clearUnread: (conversationId) => {
    set((state) => {
      if (!state.unreadFrom[conversationId]) return state;
      const next = { ...state.unreadFrom };
      delete next[conversationId];
      return { unreadFrom: next };
    });
  },

  setDraft: (conversationId, value) => {
    set((state) => ({ drafts: { ...state.drafts, [conversationId]: value } }));
  },

  setActiveServer: (serverId) => {
    const server = get().servers.find((s) => s.id === serverId);
    const firstTextChannel = server?.channels.find((c) => c.type === 'text');
    set({
      activeServerId: serverId,
      activeChannelId: firstTextChannel?.id || null,
      activeDmId: null,
      view: 'server',
    });
    if (firstTextChannel) get().loadMessages(firstTextChannel.id);
  },

  setActiveChannel: (channelId) => {
    set({ activeChannelId: channelId, view: 'server' });
    get().clearUnread(channelId);
    if (!get().messages[channelId]) get().loadMessages(channelId);
  },

  setActiveDm: (dmId) => {
    set({ activeDmId: dmId, activeServerId: null, view: 'dm' });
    get().clearUnread(dmId);
    void api.markDmRead(dmId);
    if (!get().messages[dmId]) get().loadDmMessages(dmId);
  },

  setView: (view) => {
    set({ view, activeServerId: view === 'server' ? get().activeServerId : null });
  },

  createServer: async (name, icon) => {
    const response = await api.createServer({ name, icon });
    if (response.success && response.data) {
      const server = normalizeServer(response.data);
      set((state) => ({ servers: [...state.servers, server], activeServerId: server.id }));
      return server;
    }
    set({ error: errorMessage(response, 'Failed to create server') });
    return null;
  },

  deleteServer: async (serverId) => {
    const response = await api.deleteServer(serverId);
    if (!response.success) {
      set({ error: errorMessage(response, 'Failed to delete server') });
      return false;
    }
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== serverId),
      activeServerId: state.activeServerId === serverId ? null : state.activeServerId,
      activeChannelId: state.activeServerId === serverId ? null : state.activeChannelId,
      view: state.activeServerId === serverId ? 'friends' : state.view,
    }));
    return true;
  },

  joinServer: async (inviteCode) => {
    const response = await api.joinServer(inviteCode);
    if (response.success && response.data) {
      const server = normalizeServer(response.data);
      set((state) => ({
        servers: state.servers.some((s) => s.id === server.id) ? state.servers : [...state.servers, server],
      }));
      return true;
    }
    set({ error: errorMessage(response, 'Invalid invite code') });
    return false;
  },

  leaveServer: async (serverId) => {
    const response = await api.leaveServer(serverId);
    if (!response.success) {
      set({ error: errorMessage(response, 'Failed to leave server') });
      return false;
    }
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== serverId),
      activeServerId: state.activeServerId === serverId ? null : state.activeServerId,
      activeChannelId: state.activeServerId === serverId ? null : state.activeChannelId,
      view: state.activeServerId === serverId ? 'friends' : state.view,
    }));
    return true;
  },

  createChannel: async (serverId, name, type, topic, categoryId) => {
    const response = await api.createChannel(serverId, {
      name,
      type: type.toUpperCase(),
      topic,
      categoryId,
    });
    if (response.success && response.data) {
      const channel = normalizeChannel(response.data);
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === serverId ? { ...s, channels: [...s.channels, channel] } : s
        ),
      }));
      return channel;
    }
    set({ error: errorMessage(response, 'Failed to create channel') });
    return null;
  },

  updateChannel: async (channelId, updates) => {
    const response = await api.updateChannel(channelId, updates);
    if (!response.success || !response.data) {
      set({ error: errorMessage(response, 'Failed to update channel') });
      return false;
    }
    const channel = normalizeChannel(response.data);
    set((state) => ({
      servers: state.servers.map((server) => ({
        ...server,
        channels: server.channels.map((item) => (item.id === channelId ? channel : item)),
      })),
    }));
    return true;
  },

  deleteChannel: async (channelId) => {
    const response = await api.deleteChannel(channelId);
    if (!response.success) {
      set({ error: errorMessage(response, 'Failed to delete channel') });
      return false;
    }
    set((state) => ({
      servers: state.servers.map((server) => ({
        ...server,
        channels: server.channels.filter((item) => item.id !== channelId),
      })),
      activeChannelId: state.activeChannelId === channelId ? null : state.activeChannelId,
      messages: Object.fromEntries(Object.entries(state.messages).filter(([id]) => id !== channelId)),
    }));
    return true;
  },

  sendMessage: async (channelId, content, author, replyTo, attachments) => {
    const isDm = get().directMessages.some((dm) => dm.id === channelId);
    const response = isDm
      ? await api.sendDmMessage(channelId, content, replyTo, attachments?.map((file) => ({
        url: file.url,
        filename: file.filename,
        mimeType: file.mimeType || file.type,
        size: file.size,
      })))
      : await api.sendMessage(channelId, content, replyTo);

    if (response.success && response.data) {
      const message = normalizeMessage(response.data, channelId);
      if (!message.author?.id) message.author = author;
      set((state) => {
        const existing = state.messages[channelId] || [];
        return {
          messages: {
            ...state.messages,
            [channelId]: existing.some((item) => item.id === message.id)
              ? existing
              : [...existing, message],
          },
        };
      });
      return true;
    }
    set({ error: errorMessage(response, 'Failed to send message') });
    return false;
  },

  addReaction: async (channelId, messageId, emoji, userId) => {
    if (get().directMessages.some((dm) => dm.id === channelId)) {
      const response = await api.toggleDmReaction(messageId, emoji);
      if (!response.success) {
        set({ error: errorMessage(response, 'Failed to add reaction') });
        return;
      }
      const current = (get().messages[channelId] || []).find((msg) => msg.id === messageId);
      const hadReaction = Boolean(current?.reactions.find((reaction) => reaction.emoji === emoji)?.userIds.includes(userId));
      get().applyRemoteDmReaction(channelId, messageId, userId, emoji, hadReaction ? 'remove' : 'add');
      return;
    }
    const response = await api.addReaction(messageId, emoji);
    if (!response.success) return;

    set((state) => {
      const channelMessages = state.messages[channelId] || [];
      const updatedMessages = channelMessages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const existing = msg.reactions.find((r) => r.emoji === emoji);
        if (existing) {
          const hasUser = existing.userIds.includes(userId);
          const userIds = hasUser
            ? existing.userIds.filter((id) => id !== userId)
            : [...existing.userIds, userId];
          if (!userIds.length) return { ...msg, reactions: msg.reactions.filter((r) => r.emoji !== emoji) };
          return {
            ...msg,
            reactions: msg.reactions.map((r) => (r.emoji === emoji ? { ...r, count: userIds.length, userIds } : r)),
          };
        }
        return { ...msg, reactions: [...msg.reactions, { emoji, count: 1, userIds: [userId] }] };
      });
      return { messages: { ...state.messages, [channelId]: updatedMessages } };
    });
  },

  deleteMessage: async (channelId, messageId) => {
    const isDm = get().directMessages.some((dm) => dm.id === channelId);
    const response = isDm
      ? await api.deleteDmMessage(messageId)
      : await api.deleteMessage(messageId);
    if (!response.success) {
      set({ error: errorMessage(response, 'Failed to delete message') });
      return false;
    }
    get().applyRemoteDelete(channelId, messageId);
    return true;
  },

  editMessage: async (channelId, messageId, content) => {
    const isDm = get().directMessages.some((dm) => dm.id === channelId);
    const response = isDm
      ? await api.editDmMessage(messageId, content)
      : await api.editMessage(messageId, content);
    if (!response.success) {
      set({ error: errorMessage(response, 'Failed to edit message') });
      return false;
    }
    get().applyRemoteEdit(channelId, messageId, content);
    return true;
  },

  createDirectMessage: async (userId, _user) => {
    const existing = get().directMessages.find(
      (dm) => !dm.isGroup && dm.participants.length === 2 && dm.participants.some((p) => p.id === userId)
    );
    if (existing) {
      get().setActiveDm(existing.id);
      return true;
    }

    const response = await api.createDirectMessage([userId]);
    if (response.success && response.data) {
      const dm = normalizeDm(response.data);
      set((state) => ({
        directMessages: state.directMessages.some((d) => d.id === dm.id)
          ? state.directMessages
          : [dm, ...state.directMessages],
      }));
      get().setActiveDm(dm.id);
      return true;
    }
    set({ error: errorMessage(response, 'Failed to open conversation') });
    return false;
  },

  createGroupDirectMessage: async (userIds, name) => {
    const response = await api.createDirectMessage(userIds, name);
    if (response.success && response.data) {
      const dm = normalizeDm(response.data);
      set((state) => ({
        directMessages: state.directMessages.some((item) => item.id === dm.id)
          ? state.directMessages
          : [dm, ...state.directMessages],
      }));
      get().setActiveDm(dm.id);
      return true;
    }
    set({ error: errorMessage(response, 'Failed to create group') });
    return false;
  },

  updateDirectMessage: async (dmId, updates) => {
    const response = await api.updateDirectMessage(dmId, updates);
    if (!response.success || !response.data) {
      set({ error: errorMessage(response, 'Failed to update conversation') });
      return false;
    }
    const dm = normalizeDm(response.data);
    set((state) => ({ directMessages: state.directMessages.map((item) => item.id === dmId ? dm : item) }));
    return true;
  },

  addDmParticipants: async (dmId, userIds) => {
    const response = await api.addDmParticipants(dmId, userIds);
    if (!response.success || !response.data) {
      set({ error: errorMessage(response, 'Failed to add participants') });
      return false;
    }
    set((state) => ({ directMessages: state.directMessages.map((item) => item.id === dmId ? normalizeDm(response.data) : item) }));
    return true;
  },

  removeDmParticipant: async (dmId, userId) => {
    const response = await api.removeDmParticipant(dmId, userId);
    if (!response.success) {
      set({ error: errorMessage(response, 'Failed to remove participant') });
      return false;
    }
    set((state) => ({
      directMessages: state.directMessages
        .filter((item) => item.id !== dmId || userId !== useAuthStore.getState().user?.id)
        .map((item) => item.id === dmId
          ? { ...item, participants: item.participants.filter((participant) => participant.id !== userId) }
          : item),
      activeDmId: state.activeDmId === dmId && userId === useAuthStore.getState().user?.id ? null : state.activeDmId,
    }));
    return true;
  },

  transferDmOwner: async (dmId, userId) => {
    const response = await api.transferDmOwner(dmId, userId);
    if (!response.success || !response.data) {
      set({ error: errorMessage(response, 'Failed to transfer ownership') });
      return false;
    }
    set((state) => ({ directMessages: state.directMessages.map((item) => item.id === dmId ? normalizeDm(response.data) : item) }));
    return true;
  },

  pinMessage: async (conversationId, messageId) => {
    const isDm = get().directMessages.some((dm) => dm.id === conversationId);
    const response = isDm ? await api.pinDmMessage(messageId) : await api.pinMessage(messageId);
    if (!response.success) {
      set({ error: errorMessage(response, 'Failed to update pin') });
      return false;
    }
    const current = (get().messages[conversationId] || []).find((msg) => msg.id === messageId);
    const next = isDm ? Boolean((response as any).data?.isPinned) : !current?.isPinned;
    if (isDm) get().applyRemoteDmPin(conversationId, messageId, next);
    else get().applyRemotePin(conversationId, messageId, next);
    return true;
  },

  sendFriendRequest: async (username) => {
    const response = await api.sendFriendRequest(username);
    if (response.success) return true;
    set({ error: errorMessage(response, 'Failed to send friend request') });
    return false;
  },

  acceptFriend: async (userId) => {
    const friend = get().friends.find((f) => f.userId === userId);
    if (!friend) return false;
    const requestId = (friend as any).requestId;
    if (!requestId) return false;
    const response = await api.acceptFriendRequest(requestId);
    if (response.success) {
      set((state) => ({
        friends: state.friends.map((f) => (f.userId === userId ? { ...f, status: 'accepted' } : f)),
      }));
      return true;
    }
    return false;
  },

  declineFriend: async (userId) => {
    const friend = get().friends.find((f) => f.userId === userId);
    const requestId = (friend as any)?.requestId;
    const response = requestId ? await api.declineFriendRequest(requestId) : { success: true };
    if (response.success) {
      set((state) => ({ friends: state.friends.filter((f) => f.userId !== userId) }));
      return true;
    }
    return false;
  },

  removeFriend: async (userId) => {
    const friend = get().friends.find((f) => f.userId === userId);
    const requestId = (friend as any)?.requestId;
    const response = requestId ? await api.removeFriend(requestId) : { success: true };
    if (response.success) {
      set((state) => ({ friends: state.friends.filter((f) => f.userId !== userId) }));
      return true;
    }
    set({ error: errorMessage(response, 'Failed to remove friend') });
    return false;
  },

  blockUser: async (userId) => {
    const response = await api.blockUser(userId);
    if (!response.success) {
      set({ error: errorMessage(response, 'Failed to block user') });
      return false;
    }
    await get().refreshFriends();
    return true;
  },

  unblockUser: async (userId) => {
    const response = await api.unblockUser(userId);
    if (!response.success) {
      set({ error: errorMessage(response, 'Failed to unblock user') });
      return false;
    }
    await get().refreshFriends();
    return true;
  },

  applyRemoteMessage: (channelId, message) => {
    set((state) => {
      const existing = state.messages[channelId] || [];
      return {
        messages: {
          ...state.messages,
          [channelId]: existing.some((item) => item.id === message.id)
            ? existing
            : [...existing, message],
        },
      };
    });
  },

  applyRemoteEdit: (channelId, messageId, content) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map((msg) =>
          msg.id === messageId ? { ...msg, content, editedAt: new Date() } : msg
        ),
      },
    }));
  },

  applyRemoteDelete: (channelId, messageId) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).filter((msg) => msg.id !== messageId),
      },
    }));
  },

  applyRemoteReaction: (channelId, messageId, userId, emoji, action) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map((msg) => {
          if (msg.id !== messageId) return msg;
          const existing = msg.reactions.find((reaction) => reaction.emoji === emoji);
          if (!existing) {
            return action === 'add'
              ? { ...msg, reactions: [...msg.reactions, { emoji, count: 1, userIds: [userId] }] }
              : msg;
          }
          const userIds = action === 'add'
            ? existing.userIds.includes(userId) ? existing.userIds : [...existing.userIds, userId]
            : existing.userIds.filter((id) => id !== userId);
          if (!userIds.length) {
            return { ...msg, reactions: msg.reactions.filter((reaction) => reaction.emoji !== emoji) };
          }
          return {
            ...msg,
            reactions: msg.reactions.map((reaction) => reaction.emoji === emoji
              ? { ...reaction, userIds, count: userIds.length }
              : reaction),
          };
        }),
      },
    }));
  },

  applyRemotePin: (channelId, messageId, isPinned) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map((msg) =>
          msg.id === messageId ? { ...msg, isPinned } : msg
        ),
      },
    }));
  },

  applyRemoteDmReaction: (dmId, messageId, userId, emoji, action) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [dmId]: (state.messages[dmId] || []).map((msg) => {
          if (msg.id !== messageId) return msg;
          const existing = msg.reactions.find((reaction) => reaction.emoji === emoji);
          if (!existing) {
            return action === 'add'
              ? { ...msg, reactions: [...msg.reactions, { emoji, count: 1, userIds: [userId] }] }
              : msg;
          }
          const userIds = action === 'add'
            ? existing.userIds.includes(userId) ? existing.userIds : [...existing.userIds, userId]
            : existing.userIds.filter((id) => id !== userId);
          if (!userIds.length) return { ...msg, reactions: msg.reactions.filter((reaction) => reaction.emoji !== emoji) };
          return {
            ...msg,
            reactions: msg.reactions.map((reaction) => reaction.emoji === emoji
              ? { ...reaction, userIds, count: userIds.length }
              : reaction),
          };
        }),
      },
    }));
  },

  applyRemoteDmPin: (dmId, messageId, isPinned) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [dmId]: (state.messages[dmId] || []).map((msg) => msg.id === messageId ? { ...msg, isPinned } : msg),
      },
    }));
  },

  clearAll: () => {
    set({
      servers: [],
      activeServerId: null,
      activeChannelId: null,
      activeDmId: null,
      messages: {},
      unreadFrom: {},
      drafts: {},
      directMessages: [],
      friends: [],
      allUsers: [],
      view: 'friends',
      error: null,
    });
  },
}));
