import { create } from 'zustand';
import { Server, Channel, Message, User, DirectMessage, Friend } from '../types';

// Mock users
const mockUsers: User[] = [
  { id: '1', username: 'BlueAdmin', discriminator: '0001', email: 'admin@bluechat.com', avatar: '', bio: 'Welcome to blueChat! 🎉', status: 'online', customStatus: 'Building something awesome', createdAt: new Date('2024-01-01') },
  { id: '2', username: 'DevMaster', discriminator: '4242', email: 'dev@bluechat.com', avatar: '', bio: 'Full-stack developer', status: 'online', customStatus: 'Coding...', createdAt: new Date('2024-02-15') },
  { id: '3', username: 'PixelArtist', discriminator: '7777', email: 'pixel@bluechat.com', avatar: '', bio: 'Digital artist & designer', status: 'idle', createdAt: new Date('2024-03-20') },
  { id: '4', username: 'MusicBot', discriminator: '0000', email: 'bot@bluechat.com', avatar: '', bio: '🎵 Playing your favorite tunes', status: 'online', createdAt: new Date('2024-01-01') },
  { id: '5', username: 'NightOwl', discriminator: '3333', email: 'owl@bluechat.com', avatar: '', bio: 'Night coder 🦉', status: 'dnd', customStatus: 'Do not disturb', createdAt: new Date('2024-04-10') },
  { id: '6', username: 'CloudNine', discriminator: '5555', email: 'cloud@bluechat.com', avatar: '', bio: 'Living on cloud nine ☁️', status: 'online', createdAt: new Date('2024-05-01') },
  { id: '7', username: 'GameLover', discriminator: '9999', email: 'game@bluechat.com', avatar: '', bio: 'Gaming is life 🎮', status: 'idle', createdAt: new Date('2024-06-15') },
];

// Mock channels
const generalChannels: Channel[] = [
  { id: 'ch1', name: 'welcome', type: 'text', categoryId: 'cat1', topic: 'Welcome to the server!', isNsfw: false, position: 0 },
  { id: 'ch2', name: 'general', type: 'text', categoryId: 'cat1', topic: 'General discussion', isNsfw: false, position: 1 },
  { id: 'ch3', name: 'off-topic', type: 'text', categoryId: 'cat1', topic: 'Anything goes', isNsfw: false, position: 2 },
  { id: 'ch4', name: 'announcements', type: 'announcement', categoryId: 'cat1', topic: 'Important announcements', isNsfw: false, position: 3 },
];

const devChannels: Channel[] = [
  { id: 'ch5', name: 'help', type: 'text', categoryId: 'cat2', topic: 'Ask for help here', isNsfw: false, position: 0 },
  { id: 'ch6', name: 'showcase', type: 'text', categoryId: 'cat2', topic: 'Show off your projects', isNsfw: false, position: 1 },
  { id: 'ch7', name: 'resources', type: 'text', categoryId: 'cat2', topic: 'Useful links and tools', isNsfw: false, position: 2 },
];

const voiceChannels: Channel[] = [
  { id: 'ch8', name: 'General Voice', type: 'voice', categoryId: 'cat3', isNsfw: false, position: 0 },
  { id: 'ch9', name: 'Music', type: 'voice', categoryId: 'cat3', isNsfw: false, position: 1 },
  { id: 'ch10', name: 'Gaming', type: 'voice', categoryId: 'cat3', isNsfw: false, position: 2 },
];

// Mock messages
const generateMessages = (channelId: string): Message[] => {
  const messages: Message[] = [
    { id: `${channelId}-1`, content: 'Hey everyone! Welcome to blueChat! 🎉', author: mockUsers[0], channelId, timestamp: new Date(Date.now() - 3600000 * 5), attachments: [], reactions: [{ emoji: '🎉', count: 5, userIds: ['2', '3', '4', '5', '6'] }, { emoji: '❤️', count: 3, userIds: ['2', '3', '5'] }], isPinned: true, mentions: [] },
    { id: `${channelId}-2`, content: 'This is awesome! Love the interface.', author: mockUsers[1], channelId, timestamp: new Date(Date.now() - 3600000 * 4), attachments: [], reactions: [{ emoji: '💯', count: 2, userIds: ['1', '3'] }], isPinned: false, mentions: [] },
    { id: `${channelId}-3`, content: 'Has anyone tried the new features yet?', author: mockUsers[2], channelId, timestamp: new Date(Date.now() - 3600000 * 3), attachments: [], reactions: [], isPinned: false, mentions: [] },
    { id: `${channelId}-4`, content: 'Yeah! The voice channels are working great. The latency is super low.', author: mockUsers[4], channelId, timestamp: new Date(Date.now() - 3600000 * 2), attachments: [], reactions: [{ emoji: '🔥', count: 4, userIds: ['1', '2', '3', '6'] }], isPinned: false, mentions: [] },
    { id: `${channelId}-5`, content: '@BlueAdmin when is the next update coming?', author: mockUsers[5], channelId, timestamp: new Date(Date.now() - 3600000), attachments: [], reactions: [], isPinned: false, mentions: ['1'] },
    { id: `${channelId}-6`, content: "We're working on forum channels and screen sharing improvements! Stay tuned 🚀", author: mockUsers[0], channelId, timestamp: new Date(Date.now() - 1800000), attachments: [], reactions: [{ emoji: '🚀', count: 7, userIds: ['2', '3', '4', '5', '6', '7', '1'] }, { emoji: '👀', count: 3, userIds: ['2', '5', '7'] }], isPinned: false, mentions: [], replyTo: { id: `${channelId}-5`, content: '@BlueAdmin when is the next update coming?', author: mockUsers[5], channelId, timestamp: new Date(Date.now() - 3600000), attachments: [], reactions: [], isPinned: false, mentions: ['1'] } },
    { id: `${channelId}-7`, content: "```typescript\nconst blueChat = 'amazing';\nconsole.log(blueChat);\n```", author: mockUsers[1], channelId, timestamp: new Date(Date.now() - 900000), attachments: [], reactions: [{ emoji: '😂', count: 2, userIds: ['3', '5'] }], isPinned: false, mentions: [] },
    { id: `${channelId}-8`, content: "Just finished my latest project! Check it out in #showcase", author: mockUsers[6], channelId, timestamp: new Date(Date.now() - 300000), attachments: [], reactions: [], isPinned: false, mentions: [] },
  ];
  return messages;
};

// Mock servers
const mockServers: Server[] = [
  {
    id: 'server1',
    name: 'blueChat HQ',
    icon: '',
    ownerId: '1',
    memberCount: 1247,
    channels: [...generalChannels, ...devChannels, ...voiceChannels],
    roles: [
      { id: 'role1', name: 'Admin', color: '#da373c', permissions: ['*'], position: 3 },
      { id: 'role2', name: 'Moderator', color: '#23a559', permissions: ['kick', 'ban', 'timeout'], position: 2 },
      { id: 'role3', name: 'Developer', color: '#5865f2', permissions: ['manage_channels'], position: 1 },
      { id: 'role4', name: 'Member', color: '#949ba4', permissions: [], position: 0 },
    ],
    members: mockUsers.map(u => ({ userId: u.id, user: u, roleIds: [u.id === '1' ? 'role1' : 'role4'], joinedAt: new Date() })),
  },
  {
    id: 'server2',
    name: 'Gaming Zone',
    icon: '',
    ownerId: '6',
    memberCount: 523,
    channels: [
      { id: 'ch20', name: 'general', type: 'text', categoryId: 'cat10', topic: 'Gaming chat', isNsfw: false, position: 0 },
      { id: 'ch21', name: 'lfg', type: 'text', categoryId: 'cat10', topic: 'Looking for group', isNsfw: false, position: 1 },
      { id: 'ch22', name: 'clips', type: 'text', categoryId: 'cat10', topic: 'Share your best clips', isNsfw: false, position: 2 },
      { id: 'ch23', name: 'Game Night', type: 'voice', categoryId: 'cat11', isNsfw: false, position: 0 },
    ],
    roles: [
      { id: 'role10', name: 'Owner', color: '#f0b232', permissions: ['*'], position: 2 },
      { id: 'role11', name: 'Gamer', color: '#5865f2', permissions: [], position: 1 },
    ],
    members: mockUsers.slice(0, 5).map(u => ({ userId: u.id, user: u, roleIds: ['role11'], joinedAt: new Date() })),
  },
  {
    id: 'server3',
    name: 'Art & Design',
    icon: '',
    ownerId: '2',
    memberCount: 891,
    channels: [
      { id: 'ch30', name: 'gallery', type: 'text', categoryId: 'cat20', topic: 'Share your art', isNsfw: false, position: 0 },
      { id: 'ch31', name: 'feedback', type: 'text', categoryId: 'cat20', topic: 'Get constructive feedback', isNsfw: false, position: 1 },
      { id: 'ch32', name: 'tutorials', type: 'forum', categoryId: 'cat20', topic: 'Share tutorials', isNsfw: false, position: 2 },
      { id: 'ch33', name: 'Creative Studio', type: 'voice', categoryId: 'cat21', isNsfw: false, position: 0 },
    ],
    roles: [
      { id: 'role20', name: 'Artist', color: '#eb459e', permissions: ['*'], position: 1 },
      { id: 'role21', name: 'Viewer', color: '#949ba4', permissions: [], position: 0 },
    ],
    members: mockUsers.slice(1, 6).map(u => ({ userId: u.id, user: u, roleIds: ['role21'], joinedAt: new Date() })),
  },
];

// Mock DMs
const mockDMs: DirectMessage[] = [
  { id: 'dm1', participants: [mockUsers[0], mockUsers[1]], isGroup: false, lastMessage: { id: 'dm1-1', content: 'Hey! How is the project going?', author: mockUsers[1], channelId: 'dm1', timestamp: new Date(Date.now() - 600000), attachments: [], reactions: [], isPinned: false, mentions: [] } },
  { id: 'dm2', participants: [mockUsers[0], mockUsers[2]], isGroup: false, lastMessage: { id: 'dm2-1', content: 'Check out this design I made!', author: mockUsers[2], channelId: 'dm2', timestamp: new Date(Date.now() - 3600000), attachments: [], reactions: [], isPinned: false, mentions: [] } },
  { id: 'dm3', participants: [mockUsers[0], mockUsers[1], mockUsers[2], mockUsers[5]], isGroup: true, name: 'Project Team', lastMessage: { id: 'dm3-1', content: 'Meeting at 3pm tomorrow', author: mockUsers[5], channelId: 'dm3', timestamp: new Date(Date.now() - 7200000), attachments: [], reactions: [], isPinned: false, mentions: [] } },
];

// Mock friends
const mockFriends: Friend[] = [
  { userId: '2', user: mockUsers[1], status: 'accepted' },
  { userId: '3', user: mockUsers[2], status: 'accepted' },
  { userId: '5', user: mockUsers[4], status: 'accepted' },
  { userId: '6', user: mockUsers[5], status: 'pending' },
  { userId: '7', user: mockUsers[6], status: 'incoming' },
];

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
  setActiveServer: (serverId: string | null) => void;
  setActiveChannel: (channelId: string) => void;
  setActiveDm: (dmId: string) => void;
  setView: (view: 'server' | 'friends' | 'dm') => void;
  sendMessage: (channelId: string, content: string, author: User) => void;
  addReaction: (channelId: string, messageId: string, emoji: string, userId: string) => void;
  deleteMessage: (channelId: string, messageId: string) => void;
  editMessage: (channelId: string, messageId: string, content: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  servers: mockServers,
  activeServerId: 'server1',
  activeChannelId: 'ch2',
  activeDmId: null,
  messages: {
    'ch1': generateMessages('ch1'),
    'ch2': generateMessages('ch2'),
    'ch3': generateMessages('ch3'),
    'ch5': generateMessages('ch5'),
    'ch6': generateMessages('ch6'),
    'dm1': [{ id: 'dm1-1', content: 'Hey! How is the project going?', author: mockUsers[1], channelId: 'dm1', timestamp: new Date(Date.now() - 600000), attachments: [], reactions: [], isPinned: false, mentions: [] }],
    'dm2': [{ id: 'dm2-1', content: 'Check out this design I made!', author: mockUsers[2], channelId: 'dm2', timestamp: new Date(Date.now() - 3600000), attachments: [], reactions: [], isPinned: false, mentions: [] }],
    'dm3': [{ id: 'dm3-1', content: 'Meeting at 3pm tomorrow', author: mockUsers[5], channelId: 'dm3', timestamp: new Date(Date.now() - 7200000), attachments: [], reactions: [], isPinned: false, mentions: [] }],
  },
  directMessages: mockDMs,
  friends: mockFriends,
  allUsers: mockUsers,
  view: 'server',

  setActiveServer: (serverId) => {
    const server = get().servers.find(s => s.id === serverId);
    const firstTextChannel = server?.channels.find(c => c.type === 'text');
    set({ 
      activeServerId: serverId, 
      activeChannelId: firstTextChannel?.id || null,
      activeDmId: null,
      view: 'server',
    });
  },

  setActiveChannel: (channelId) => {
    set({ activeChannelId: channelId, view: 'server' });
  },

  setActiveDm: (dmId) => {
    set({ activeDmId: dmId, activeServerId: null, view: 'dm' });
  },

  setView: (view) => {
    set({ view, activeServerId: view === 'server' ? get().activeServerId : null });
  },

  sendMessage: (channelId, content, author) => {
    const newMessage: Message = {
      id: `${channelId}-${Date.now()}`,
      content,
      author,
      channelId,
      timestamp: new Date(),
      attachments: [],
      reactions: [],
      isPinned: false,
      mentions: [],
    };
    
    set(state => ({
      messages: {
        ...state.messages,
        [channelId]: [...(state.messages[channelId] || []), newMessage],
      },
    }));
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
  },

  deleteMessage: (channelId, messageId) => {
    set(state => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).filter(msg => msg.id !== messageId),
      },
    }));
  },

  editMessage: (channelId, messageId, content) => {
    set(state => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] || []).map(msg => 
          msg.id === messageId ? { ...msg, content, editedAt: new Date() } : msg
        ),
      },
    }));
  },
}));
