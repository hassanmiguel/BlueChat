import { useEffect, useState } from 'react';
import { useAuthStore } from './stores/authStore';
import { useChatStore } from './stores/chatStore';
import { socketService } from './services/socket';
import { api } from './services/api';
import { normalizeMessage } from './stores/chatStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ServerSidebar from './components/ServerSidebar';
import ChannelSidebar from './components/ChannelSidebar';
import ChatArea from './components/ChatArea';
import MemberSidebar from './components/MemberSidebar';
import SettingsModal from './components/SettingsModal';
import SettingsPage from './pages/SettingsPage';
import DiscoveryPage from './pages/DiscoveryPage';
import DmPage from './pages/DmPage';
import AppBackdrop from './components/AppBackdrop';
import { useUIStore } from './stores/uiStore';
import ProfilePopup from './components/ProfilePopup';
import CreateServerModal from './components/CreateServerModal';
import InviteModal from './components/InviteModal';
import SearchModal from './components/SearchModal';
import ThreadPanel from './components/ThreadPanel';
import Notifications from './components/Notifications';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import QuickSwitcher from './components/QuickSwitcher';
import CallOverlay from './components/CallOverlay';
import CallsPage from './pages/CallsPage';
import NotificationsPage from './pages/NotificationsPage';
import AddFriendPage from './pages/AddFriendPage';
import CommunityHubPage from './pages/CommunityHubPage';
import { useActivityStore } from './stores/activityStore';
import { readPrefs } from './services/localProfile';
import { loadCustomEmojis } from './services/emojiService';
import { primeAudioOnGesture } from './services/soundService';
import { watchTheme } from './services/theme';
import { motion, AnimatePresence } from 'framer-motion';

function AuthFlowPage({ flow }: { flow: 'verify-email' | 'reset-password' }) {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!token) return setStatus('Missing token.');
    setBusy(true);
    const response = flow === 'verify-email'
      ? await api.verifyEmail(token)
      : await api.resetPassword(token, password);
    setStatus(response.success
      ? (flow === 'verify-email' ? 'Email verified. You can close this page.' : 'Password updated. You can now log in.')
      : response.error || 'Request failed.');
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dc-dark text-dc-text p-6">
      <div className="bg-dc-darker border border-dc-divider rounded-xl p-8 w-full max-w-md">
        <h1 className="text-xl font-bold mb-4">
          {flow === 'verify-email' ? 'Verify email' : 'Reset password'}
        </h1>
        <input
          className="w-full bg-dc-channel border border-dc-divider rounded p-2 mb-3"
          placeholder="Token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        {flow === 'reset-password' && (
          <input
            type="password"
            className="w-full bg-dc-channel border border-dc-divider rounded p-2 mb-3"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <button
          onClick={submit}
          disabled={busy}
          className="w-full bg-dc-brand text-white rounded p-2 disabled:opacity-50"
        >
          {busy ? 'Working...' : 'Submit'}
        </button>
        {status && <p className="mt-4 text-sm text-dc-text-muted">{status}</p>}
        <a href="/" className="block mt-4 text-sm text-dc-text-link hover:underline">Back to blueChat</a>
      </div>
    </div>
  );
}

function MainApp() {
  const showUserSettings = useUIStore((s) => s.showUserSettings);
  const showServerSettings = useUIStore((s) => s.showServerSettings);
  const showDiscovery = useUIStore((s) => s.showDiscovery);
  const hydrate = useChatStore((s) => s.hydrate);
  const clearAll = useChatStore((s) => s.clearAll);
  const activeServerId = useChatStore((s) => s.activeServerId);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const activeDmId = useChatStore((s) => s.activeDmId);
  const view = useChatStore((s) => s.view);
  const applyRemoteMessage = useChatStore((s) => s.applyRemoteMessage);
  const applyRemoteEdit = useChatStore((s) => s.applyRemoteEdit);
  const applyRemoteDelete = useChatStore((s) => s.applyRemoteDelete);
  const applyRemoteReaction = useChatStore((s) => s.applyRemoteReaction);
  const applyRemotePin = useChatStore((s) => s.applyRemotePin);
  const applyRemoteDmReaction = useChatStore((s) => s.applyRemoteDmReaction);
  const applyRemoteDmPin = useChatStore((s) => s.applyRemoteDmPin);
  const user = useAuthStore((s) => s.user);
  const pushActivity = useActivityStore((s) => s.push);
  const loadActivity = useActivityStore((s) => s.load);
  const loadRemoteNotifications = useActivityStore((s) => s.loadRemote);
  const pushRemoteNotification = useActivityStore((s) => s.pushRemote);
  const showCalls = useUIStore((s) => s.showCalls);
  const showNotifications = useUIStore((s) => s.showNotifications);
  const showCommunityHub = useUIStore((s) => s.showCommunityHub);
  const showAddFriend = useUIStore((s) => s.showAddFriend);
  const addToast = useUIStore((s) => s.addNotification);
  const refreshFriends = useChatStore((s) => s.refreshFriends);

  useEffect(() => {
    void loadCustomEmojis();
    primeAudioOnGesture();
    loadActivity(user?.id);
    void loadRemoteNotifications();
    hydrate();
    socketService.connect();
    return () => {
      socketService.disconnect();
      clearAll();
    };
  }, [hydrate, clearAll, loadActivity, loadRemoteNotifications, user?.id]);

  useEffect(() => {
    if (activeServerId) socketService.joinServer(activeServerId);
    if (activeChannelId) socketService.joinChannel(activeChannelId);
    if (activeDmId) socketService.joinDm(activeDmId);
    return () => {
      if (activeChannelId) socketService.leaveChannel(activeChannelId);
    };
  }, [activeServerId, activeChannelId, activeDmId]);

  useEffect(() => {
    const offConnected = socketService.on('connected', () => {
      if (activeServerId) socketService.joinServer(activeServerId);
      if (activeChannelId) socketService.joinChannel(activeChannelId);
      if (activeDmId) socketService.joinDm(activeDmId);
    });
    return offConnected;
  }, [activeServerId, activeChannelId, activeDmId]);

  useEffect(() => {
    const offNew = socketService.on('message:new', ({ channelId, message }: any) => {
      applyRemoteMessage(channelId, normalizeMessage(message, channelId));
      const normalized = normalizeMessage(message, channelId);
      const prefs = readPrefs().notifications;
      const mentioned = Boolean(user && normalized.content.toLowerCase().includes(`@${user.username.toLowerCase()}`));
      if (mentioned ? !prefs.mentions : !prefs.serverMessages) return;
      if (normalized.author.id === user?.id) return;
      if (channelId === activeChannelId && view === 'server') return;
      pushActivity(user?.id, {
        id: `channel:${message.id}`,
        type: mentioned ? 'mention' : 'message',
        title: mentioned ? `Mentioned by ${normalized.author.username}` : normalized.author.username,
        body: normalized.content.slice(0, 160),
        channelId,
        serverId: useChatStore.getState().servers.find((server) => server.channels.some((c) => c.id === channelId))?.id,
      });
    });
    const offDm = socketService.on('dm:message:new', ({ dmId, message }: any) => {
      applyRemoteMessage(dmId, normalizeMessage(message, dmId));
      const normalized = normalizeMessage(message, dmId);
      if (!readPrefs().notifications.dmMessages) return;
      if (normalized.author.id === user?.id) return;
      if (dmId === activeDmId && view === 'dm') return;
      pushActivity(user?.id, {
        id: `dm:${message.id}`,
        type: 'message',
        title: normalized.author.username,
        body: normalized.content.slice(0, 160),
        dmId,
      });
    });
    const offEdit = socketService.on('message:edit', ({ channelId, messageId, content }: any) => {
      applyRemoteEdit(channelId, messageId, content);
    });
    const offDelete = socketService.on('message:delete', ({ channelId, messageId }: any) => {
      applyRemoteDelete(channelId, messageId);
    });
    const offDmDelete = socketService.on('dm:message:delete', ({ dmId, messageId }: any) => {
      applyRemoteDelete(dmId, messageId);
    });
    const offDmEdit = socketService.on('dm:message:edit', ({ dmId, messageId, content }: any) => {
      applyRemoteEdit(dmId, messageId, content);
    });
    const offReaction = socketService.on('message:reaction', ({ channelId, messageId, userId, emoji, action }: any) => {
      applyRemoteReaction(channelId, messageId, userId, emoji, action);
    });
    const offPin = socketService.on('message:pin', ({ channelId, messageId, isPinned }: any) => {
      applyRemotePin(channelId, messageId, isPinned);
    });
    const offDmReaction = socketService.on('dm:message:reaction', ({ dmId, messageId, userId, emoji, action }: any) => {
      applyRemoteDmReaction(dmId, messageId, userId, emoji, action);
    });
    const offDmPin = socketService.on('dm:message:pin', ({ dmId, messageId, isPinned }: any) => {
      applyRemoteDmPin(dmId, messageId, isPinned);
    });
    const offDmUpdated = socketService.on('dm:updated', (payload: any) => {
      const { refreshDirectMessages } = useChatStore.getState();
      void refreshDirectMessages(payload?.dmId);
    });
    const offDmParticipants = socketService.on('dm:participants', (payload: any) => {
      const { refreshDirectMessages } = useChatStore.getState();
      void refreshDirectMessages(payload?.dmId);
    });
    return () => {
      offNew(); offDm(); offEdit(); offDelete(); offDmDelete(); offDmEdit(); offReaction(); offPin();
      offDmReaction(); offDmPin(); offDmUpdated(); offDmParticipants();
    };
  }, [applyRemoteMessage, applyRemoteEdit, applyRemoteDelete, applyRemoteReaction, applyRemotePin, applyRemoteDmReaction, applyRemoteDmPin, pushActivity, user?.id, activeChannelId, activeDmId, view]);

  useEffect(() => {
    const offRequest = socketService.on('friend:request', (payload: any) => {
      refreshFriends();
      const from = payload?.sender?.username || 'Someone';
      pushActivity(user?.id, {
        id: `friend:request:${payload?.requestId || Date.now()}`,
        type: 'friend',
        title: 'New friend request',
        body: `@${from} wants to be friends.`,
      });
      addToast('New friend request', `@${from} wants to be friends.`, 'info');
    });
    const offAccepted = socketService.on('friend:accepted', (payload: any) => {
      refreshFriends();
      const name = payload?.user?.username || 'Someone';
      pushActivity(user?.id, {
        id: `friend:accepted:${payload?.requestId || Date.now()}`,
        type: 'friend',
        title: 'Friend request accepted',
        body: `You and @${name} are now friends.`,
      });
      addToast('You are friends now', `@${name} accepted your request.`, 'success');
    });
    return () => {
      offRequest();
      offAccepted();
    };
  }, [refreshFriends, pushActivity, user?.id, addToast]);

  useEffect(() => {
    const offNotification = socketService.on('notification:new', (payload: any) => {
      pushRemoteNotification(payload);
      addToast(payload?.title || 'Notification', payload?.body || '', 'info');
    });
    return () => offNotification();
  }, [pushRemoteNotification, addToast]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative h-screen w-screen overflow-hidden bg-dc-channel"
    >
      <AppBackdrop />
      <div className="relative z-10 flex h-full w-full">
        <ServerSidebar />
        <ChannelSidebar />
        {view === 'dm' ? <DmPage /> : <ChatArea />}
        <ThreadPanel />
        <MemberSidebar />
      </div>
      {showServerSettings && <SettingsModal />}
      <ProfilePopup />
      <CreateServerModal />
      <InviteModal />
      <SearchModal />
      <KeyboardShortcuts />
      <QuickSwitcher />
      <Notifications />
      <CallOverlay />
      <AnimatePresence>
        {showCalls && <CallsPage key="calls" />}
        {showNotifications && <NotificationsPage key="notifications" />}
        {showAddFriend && <AddFriendPage key="add-friend" />}
      </AnimatePresence>
      {showUserSettings && <SettingsPage />}
      {showCommunityHub && <CommunityHubPage />}
      {showDiscovery && <DiscoveryPage />}
    </motion.div>
  );
}

export default function App() {
  const { isAuthenticated, isLoading, initialize } = useAuthStore();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const pathname = window.location.pathname;

  useEffect(() => watchTheme(), []);

  useEffect(() => {
    localStorage.removeItem('bluechat_accounts');
    localStorage.removeItem('bluechat_data');
    localStorage.removeItem('bluechat_user');
    localStorage.removeItem('bluechat_token');

    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth') === 'success' || params.get('oauth') === 'error') {
      window.history.replaceState({}, document.title, '/');
    }
    initialize();
  }, [initialize]);

  if (pathname === '/verify-email') return <AuthFlowPage flow="verify-email" />;
  if (pathname === '/reset-password') return <AuthFlowPage flow="reset-password" />;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dc-dark text-dc-text-muted">
        Loading blueChat...
      </div>
    );
  }

  if (isAuthenticated) return <MainApp />;

  return (
    <AnimatePresence mode="wait">
      {authView === 'login' ? (
        <motion.div
          key="login"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
        >
          <LoginPage onSwitchToRegister={() => setAuthView('register')} />
        </motion.div>
      ) : (
        <motion.div
          key="register"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: -20 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <RegisterPage onSwitchToLogin={() => setAuthView('login')} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
