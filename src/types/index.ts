// User types
export interface User {
  id: string;
  username: string;
  discriminator: string;
  email: string;
  avatar: string;
  banner?: string;
  bio?: string;
  status: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';
  customStatus?: string;
  createdAt: Date;
}

// Server/Guild types
export interface Server {
  id: string;
  name: string;
  icon: string;
  banner?: string;
  ownerId: string;
  inviteCode?: string;
  memberCount: number;
  channels: Channel[];
  roles: Role[];
  members: ServerMember[];
}

export interface ServerMember {
  userId: string;
  user: User;
  roleIds: string[];
  joinedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  color: string;
  permissions: string[];
  position: number;
}

// Channel types
export type ChannelType = 'text' | 'voice' | 'announcement' | 'forum';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  categoryId?: string;
  topic?: string;
  isNsfw: boolean;
  slowMode?: number;
  position: number;
}

export interface Category {
  id: string;
  name: string;
  position: number;
  channels: string[];
}

// Message types
export interface Message {
  id: string;
  content: string;
  author: User;
  channelId: string;
  timestamp: Date;
  editedAt?: Date;
  attachments: Attachment[];
  reactions: Reaction[];
  replyTo?: Message;
  isPinned: boolean;
  mentions: string[];
}

export interface Attachment {
  id: string;
  filename: string;
  url: string;
  type: 'image' | 'video' | 'audio' | 'file';
  size: number;
  mimeType?: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  userIds: string[];
}

// DM types
export interface DirectMessage {
  id: string;
  participants: User[];
  isGroup: boolean;
  name?: string;
  description?: string;
  avatar?: string;
  ownerId?: string;
  lastMessage?: Message;
  unreadCount?: number;
}

// Auth types
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

// Chat state types
export interface ChatState {
  servers: Server[];
  activeServerId: string | null;
  activeChannelId: string | null;
  activeDmId: string | null;
  messages: Record<string, Message[]>;
  directMessages: DirectMessage[];
  friends: Friend[];
  setActiveServer: (serverId: string | null) => void;
  setActiveChannel: (channelId: string) => void;
  setActiveDm: (dmId: string) => void;
  sendMessage: (channelId: string, content: string) => void;
  addReaction: (channelId: string, messageId: string, emoji: string) => void;
}

// Friend types
export interface Friend {
  userId: string;
  user: User;
  status: 'accepted' | 'pending' | 'blocked' | 'incoming';
  requestId?: string;
}
