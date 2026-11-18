import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { api } from '../services/api';
import { X, User, Palette, Bell, Mic, Keyboard, Shield, LogOut, Hash, Users, AtSign, Smile, Ban, ScrollText, Settings as SettingsIcon, Trash2 } from 'lucide-react';

const PERMISSION_OPTIONS = [
  'manage_server', 'manage_channels', 'manage_roles', 'manage_members',
  'kick_members', 'ban_members', 'timeout_members', 'delete_messages',
  'manage_messages', 'manage_invites', 'create_channels', 'send_messages',
  'attach_files', 'mention_everyone', 'connect', 'speak', 'video', 'screen_share',
];

export default function SettingsModal() {
  const { showUserSettings, showServerSettings, toggleUserSettings, toggleServerSettings, activeSettingsTab, setActiveSettingsTab, activeServerSettingsTab, setActiveServerSettingsTab, theme, setTheme, accentColor, setAccentColor, compactMode, toggleCompactMode } = useUIStore();
  const { user, logout, updateUser } = useAuthStore();
  const { servers, activeServerId, deleteServer } = useChatStore();
  const addNotification = useUIStore(s => s.addNotification);

  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [serverName, setServerName] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.customStatus || '');
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);

  const activeServer = servers.find(s => s.id === activeServerId);

  useEffect(() => {
    if (!activeServerId) {
      setAuditLog([]);
      return;
    }
    let cancelled = false;
    api.getAuditLog(activeServerId).then(response => {
      if (!cancelled) setAuditLog(Array.isArray(response.data) ? response.data : []);
    });
    api.getBans(activeServerId).then(response => {
      if (!cancelled) setBans(Array.isArray(response.data) ? response.data : []);
    });
    api.getReports(activeServerId).then(response => {
      if (!cancelled) setReports(Array.isArray(response.data) ? response.data : []);
    });
    return () => { cancelled = true; };
  }, [activeServerId]);

  useEffect(() => {
    setServerName(activeServer?.name || '');
  }, [activeServer?.id, activeServer?.name]);

  useEffect(() => {
    setBio(user?.bio || '');
    setCustomStatus(user?.customStatus || '');
  }, [user?.id, user?.bio, user?.customStatus]);

  const handleSaveServerName = async () => {
    if (!activeServerId || !serverName.trim() || serverName.trim() === activeServer?.name) return;
    const response = await api.updateServer(activeServerId, { name: serverName.trim() });
    if (response.success) {
      addNotification('Server Updated', 'Server name saved.', 'success');
    } else {
      addNotification('Error', response.error || 'Failed to update server', 'error');
    }
  };

  const handleCreateRole = async () => {
    if (!activeServerId || !newRoleName.trim()) return;
    const response = await api.createRole(activeServerId, { name: newRoleName.trim() });
    if (response.success && response.data) {
      const role = response.data as any;
      addNotification('Role Created', `${newRoleName.trim()} has been created.`, 'success');
      setNewRoleName('');
      useChatStore.setState(state => ({
        servers: state.servers.map(s => s.id === activeServerId
          ? { ...s, roles: [...s.roles, { id: role.id, name: role.name, color: role.color || '#949ba4', permissions: role.permissions || [], position: role.position || 0 }] }
          : s),
      }));
    } else {
      addNotification('Error', response.error || 'Failed to create role', 'error');
    }
  };

  const refreshServerData = async () => {
    if (!activeServerId) return;
    const [bansRes, reportsRes, auditRes] = await Promise.all([
      api.getBans(activeServerId),
      api.getReports(activeServerId),
      api.getAuditLog(activeServerId),
    ]);
    if (Array.isArray(bansRes.data)) setBans(bansRes.data);
    if (Array.isArray(reportsRes.data)) setReports(reportsRes.data);
    if (Array.isArray(auditRes.data)) setAuditLog(auditRes.data);
  };

  const handleModeration = async (action: 'kick' | 'ban' | 'timeout', userId: string) => {
    if (!activeServerId) return;
    const reason = window.prompt('Reason (optional)') || undefined;
    const response = action === 'timeout'
      ? await api.timeoutMember(activeServerId, userId, Number(window.prompt('Timeout length in minutes', '60')) || 60, reason)
      : action === 'ban'
        ? await api.banMember(activeServerId, userId, reason)
        : await api.kickMember(activeServerId, userId, reason);
    addNotification(response.success ? 'Moderation action saved' : 'Error', response.success ? 'The member was updated.' : response.error || 'Action failed', response.success ? 'success' : 'error');
    if (response.success) await refreshServerData();
  };

  const handleSaveRole = async (roleId: string) => {
    if (!activeServerId) return;
    const response = await api.updateRole(activeServerId, roleId, { permissions: rolePermissions });
    if (response.success && response.data) {
      useChatStore.setState((state) => ({
        servers: state.servers.map((server) => server.id === activeServerId
          ? { ...server, roles: server.roles.map((role) => role.id === roleId ? { ...role, permissions: rolePermissions } : role) }
          : server),
      }));
      addNotification('Role Updated', 'Permissions saved.', 'success');
      setSelectedRoleId(null);
    } else {
      addNotification('Error', response.error || 'Failed to update role', 'error');
    }
  };

  const handleDeleteServer = async () => {
    if (!activeServerId) return;
    const success = await deleteServer(activeServerId);
    if (success) {
      addNotification('Server Deleted', 'The server has been deleted.', 'success');
      toggleServerSettings();
    } else {
      addNotification('Error', 'Failed to delete server', 'error');
    }
  };

  const handleSaveProfile = async () => {
    const success = await updateUser({ bio, customStatus });
    if (success) {
      addNotification('Profile Updated', 'Your profile has been saved.', 'success');
      setEditingProfile(false);
    } else {
      addNotification('Error', 'Failed to update profile', 'error');
    }
  };

  // User Settings Tabs
  const userTabs = [
    { id: 'account', label: 'My Account', icon: User, category: 'USER SETTINGS' },
    { id: 'profiles', label: 'Profiles', icon: User, category: 'USER SETTINGS' },
    { id: 'privacy', label: 'Privacy & Safety', icon: Shield, category: 'USER SETTINGS' },
    { id: 'appearance', label: 'Appearance', icon: Palette, category: 'APP SETTINGS' },
    { id: 'notifications', label: 'Notifications', icon: Bell, category: 'APP SETTINGS' },
    { id: 'voice', label: 'Voice & Video', icon: Mic, category: 'APP SETTINGS' },
    { id: 'keybinds', label: 'Keybinds', icon: Keyboard, category: 'APP SETTINGS' },
  ];

  // Server Settings Tabs
  const serverTabs = [
    { id: 'overview', label: 'Overview', icon: SettingsIcon, category: 'SERVER SETTINGS' },
    { id: 'roles', label: 'Roles', icon: Shield, category: 'SERVER SETTINGS' },
    { id: 'channels', label: 'Channels', icon: Hash, category: 'SERVER SETTINGS' },
    { id: 'members', label: 'Members', icon: Users, category: 'SERVER SETTINGS' },
    { id: 'invites', label: 'Invites', icon: AtSign, category: 'SERVER SETTINGS' },
    { id: 'bans', label: 'Moderation', icon: Ban, category: 'SERVER SETTINGS' },
    { id: 'emojis', label: 'Emojis', icon: Smile, category: 'SERVER SETTINGS' },
    { id: 'audit-log', label: 'Audit Log', icon: ScrollText, category: 'SERVER SETTINGS' },
    { id: 'delete', label: 'Delete Server', icon: Trash2, category: 'SERVER SETTINGS', danger: true },
  ];

  const accentColors = ['#5865f2', '#23a559', '#eb459e', '#f0b232', '#da373c', '#00a8fc', '#9b59b6', '#e67e22'];

  return (
    <>
      {/* User Settings Modal */}
      <AnimatePresence>
        {showUserSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={toggleUserSettings}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-[90vw] max-w-5xl h-[85vh] bg-dc-sidebar rounded-lg flex overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sidebar */}
              <div className="w-60 bg-dc-sidebar overflow-y-auto py-4 px-2 border-r border-dc-divider/30">
                {['USER SETTINGS', 'APP SETTINGS'].map(category => (
                  <div key={category} className="mb-4">
                    <h3 className="text-xs font-bold text-dc-text-muted uppercase px-2 mb-1">{category}</h3>
                    {userTabs.filter(t => t.category === category).map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveSettingsTab(tab.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                          activeSettingsTab === tab.id ? 'bg-dc-active text-white' : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-hover'
                        }`}
                      >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="border-t border-dc-divider/30 mt-4 pt-4">
                  <button
                    onClick={() => { logout(); toggleUserSettings(); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-dc-red hover:bg-dc-red/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Log Out
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-2xl">
                  {activeSettingsTab === 'account' && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">My Account</h2>
                      {/* Profile Card */}
                      <div className="bg-dc-dark rounded-lg overflow-hidden mb-6">
                        <div className="h-24 bg-dc-brand relative">
                          <div className="absolute -bottom-8 left-4 w-20 h-20 rounded-full bg-dc-brand border-[6px] border-dc-dark flex items-center justify-center text-white text-2xl font-bold">
                            {user?.username[0].toUpperCase()}
                          </div>
                        </div>
                        <div className="pt-10 pb-4 px-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-lg font-bold text-white">{user?.username}#{user?.discriminator}</h3>
                              <p className="text-sm text-dc-text-muted">{user?.email}</p>
                            </div>
                            <button onClick={() => setEditingProfile(!editingProfile)} className="px-4 py-1.5 bg-dc-brand hover:bg-dc-brand-hover text-white text-sm font-medium rounded transition-colors">
                              Edit User Profile
                            </button>
                          </div>
                        </div>
                        {editingProfile && (
                          <div className="bg-dc-dark rounded-lg p-4 mt-4 space-y-3">
                            <div>
                              <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Bio</label>
                              <textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                rows={3}
                                className="w-full bg-dc-input border-none rounded px-3 py-2 text-white resize-none"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Custom Status</label>
                              <input
                                type="text"
                                value={customStatus}
                                onChange={(e) => setCustomStatus(e.target.value)}
                                className="w-full bg-dc-input border-none rounded px-3 py-2 text-white"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={handleSaveProfile} className="px-4 py-1.5 bg-dc-brand hover:bg-dc-brand-hover text-white text-sm font-medium rounded transition-colors">Save</button>
                              <button onClick={() => setEditingProfile(false)} className="px-4 py-1.5 bg-dc-input hover:bg-dc-active text-dc-text text-sm font-medium rounded transition-colors">Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Account Info */}
                      <div className="space-y-4">
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Username</label>
                          <div className="flex items-center gap-2">
                            <span className="text-white">{user?.username}</span>
                            <span className="text-dc-text-muted">#{user?.discriminator}</span>
                            <button disabled title="Username changes are not available yet" className="ml-auto text-sm text-dc-text-muted cursor-not-allowed">Edit</button>
                          </div>
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Email</label>
                          <div className="flex items-center gap-2">
                            <span className="text-white">{user?.email}</span>
                            <button disabled title="Email changes are not available yet" className="ml-auto text-sm text-dc-text-muted cursor-not-allowed">Edit</button>
                          </div>
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Password</label>
                          <div className="flex items-center gap-2">
                            <span className="text-white">••••••••</span>
                            <button disabled title="Password changes are not available yet" className="ml-auto text-sm text-dc-text-muted cursor-not-allowed">Change</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'appearance' && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">Appearance</h2>
                      
                      <div className="mb-6">
                        <h3 className="text-sm font-bold text-white mb-3">Theme</h3>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setTheme('dark')}
                            className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                              theme === 'dark' ? 'border-dc-brand' : 'border-dc-divider/30'
                            }`}
                          >
                            <div className="w-full h-20 bg-dc-dark rounded mb-2"></div>
                            <p className="text-sm text-white font-medium">Dark</p>
                          </button>
                          <button
                            onClick={() => setTheme('light')}
                            className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                              theme === 'light' ? 'border-dc-brand' : 'border-dc-divider/30'
                            }`}
                          >
                            <div className="w-full h-20 bg-gray-100 rounded mb-2"></div>
                            <p className="text-sm text-white font-medium">Light</p>
                          </button>
                        </div>
                      </div>

                      <div className="mb-6">
                        <h3 className="text-sm font-bold text-white mb-3">Accent Color</h3>
                        <div className="flex gap-2 flex-wrap">
                          {accentColors.map(color => (
                            <button
                              key={color}
                              onClick={() => setAccentColor(color)}
                              className={`w-10 h-10 rounded-full transition-transform ${
                                accentColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-dc-sidebar scale-110' : ''
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="mb-6">
                        <h3 className="text-sm font-bold text-white mb-3">Chat Display</h3>
                        <div className="bg-dc-dark rounded-lg p-4 flex items-center justify-between">
                          <div>
                            <p className="text-white font-medium">Compact Mode</p>
                            <p className="text-sm text-dc-text-muted">Fit more messages on screen</p>
                          </div>
                          <button
                            onClick={toggleCompactMode}
                            className={`w-12 h-6 rounded-full transition-colors relative ${
                              compactMode ? 'bg-dc-green' : 'bg-dc-input'
                            }`}
                          >
                            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                              compactMode ? 'translate-x-6' : 'translate-x-0.5'
                            }`}></div>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSettingsTab === 'voice' && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">Voice & Video</h2>
                      
                      <div className="space-y-4">
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Input Device</label>
                          <select disabled title="Device selection is not available yet" className="w-full bg-dc-input border-none rounded px-3 py-2 text-dc-text-muted cursor-not-allowed">
                            <option>Default - Microphone</option>
                          </select>
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Output Device</label>
                          <select disabled title="Device selection is not available yet" className="w-full bg-dc-input border-none rounded px-3 py-2 text-dc-text-muted cursor-not-allowed">
                            <option>Default - Speakers</option>
                          </select>
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Input Volume</label>
                          <input type="range" min="0" max="100" defaultValue="75" className="w-full accent-dc-brand" />
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Voice Activity Detection</label>
                          <div className="flex gap-2">
                            <button disabled title="Voice mode selection is not available yet" className="flex-1 px-4 py-2 bg-dc-brand text-white rounded text-sm font-medium opacity-60 cursor-not-allowed">Voice Activity</button>
                            <button disabled title="Voice mode selection is not available yet" className="flex-1 px-4 py-2 bg-dc-input text-dc-text rounded text-sm font-medium opacity-60 cursor-not-allowed">Push to Talk</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(activeSettingsTab === 'profiles' || activeSettingsTab === 'privacy' || activeSettingsTab === 'notifications' || activeSettingsTab === 'keybinds') && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">{userTabs.find(t => t.id === activeSettingsTab)?.label}</h2>
                      <div className="bg-dc-dark rounded-lg p-8 text-center">
                        <p className="text-dc-text-muted">Nothing here yet.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={toggleUserSettings}
                className="absolute top-4 right-4 w-9 h-9 rounded-full border-2 border-dc-text-muted flex items-center justify-center hover:border-dc-text transition-colors"
              >
                <X className="w-5 h-5 text-dc-text" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Server Settings Modal */}
      <AnimatePresence>
        {showServerSettings && activeServer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={toggleServerSettings}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-[90vw] max-w-5xl h-[85vh] bg-dc-sidebar rounded-lg flex overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sidebar */}
              <div className="w-60 bg-dc-sidebar overflow-y-auto py-4 px-2 border-r border-dc-divider/30">
                <h3 className="text-xs font-bold text-dc-text-muted uppercase px-2 mb-2">SERVER SETTINGS</h3>
                {serverTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveServerSettingsTab(tab.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                      tab.danger ? 'text-dc-red hover:bg-dc-red/10' :
                      activeServerSettingsTab === tab.id ? 'bg-dc-active text-white' : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-hover'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-2xl">
                  {activeServerSettingsTab === 'overview' && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">Server Overview</h2>
                      <div className="space-y-4">
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Server Name</label>
                          <input
                            type="text"
                            value={serverName}
                            onChange={(e) => setServerName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveServerName(); }}
                            className="w-full bg-dc-input border-none rounded px-3 py-2 text-white"
                          />
                          <button
                            onClick={handleSaveServerName}
                            disabled={!serverName.trim() || serverName.trim() === activeServer.name}
                            className="mt-2 px-4 py-1.5 bg-dc-brand hover:bg-dc-brand-hover text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Save Name
                          </button>
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Server Icon</label>
                          <div className="flex items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-dc-brand flex items-center justify-center text-white text-2xl font-bold">
                              {activeServer.name[0]}
                            </div>
                            <button disabled title="Server icon uploads are not available yet" className="px-4 py-2 bg-dc-input text-dc-text-muted text-sm font-medium rounded cursor-not-allowed">
                              Upload Image
                            </button>
                          </div>
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Verification Level</label>
                          <select disabled title="Verification level settings are not available yet" className="w-full bg-dc-input border-none rounded px-3 py-2 text-dc-text-muted cursor-not-allowed">
                            <option>Unrestricted</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeServerSettingsTab === 'roles' && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">Roles</h2>
                      <div className="space-y-2">
                        {activeServer.roles.map(role => (
                          <div key={role.id} className="bg-dc-dark rounded-lg p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: role.color }}></div>
                              <span className="text-white font-medium flex-1">{role.name}</span>
                              <span className="text-sm text-dc-text-muted">{activeServer.members.filter(m => m.roleIds.includes(role.id)).length} members</span>
                              <button
                                onClick={() => { setSelectedRoleId(role.id); setRolePermissions(role.permissions || []); }}
                                className="text-xs text-dc-text-link hover:underline"
                              >
                                Edit
                              </button>
                            </div>
                            {selectedRoleId === role.id && (
                              <div className="mt-3 border-t border-dc-divider/30 pt-3">
                                <div className="grid grid-cols-2 gap-2">
                                  {PERMISSION_OPTIONS.map((permission) => (
                                    <label key={permission} className="flex items-center gap-2 text-xs text-dc-text-muted">
                                      <input
                                        type="checkbox"
                                        checked={rolePermissions.includes(permission)}
                                        onChange={(event) => setRolePermissions((current) => event.target.checked
                                          ? [...current, permission]
                                          : current.filter((item) => item !== permission))}
                                      />
                                      {permission.replace(/_/g, ' ')}
                                    </label>
                                  ))}
                                </div>
                                <div className="flex gap-2 mt-3">
                                  <button onClick={() => handleSaveRole(role.id)} className="px-3 py-1.5 bg-dc-brand text-white text-xs rounded">Save permissions</button>
                                  <button onClick={() => setSelectedRoleId(null)} className="px-3 py-1.5 bg-dc-input text-dc-text text-xs rounded">Cancel</button>
                                  <button onClick={async () => {
                                    const ok = await api.deleteRole(activeServerId!, role.id);
                                    if (ok.success) {
                                      useChatStore.setState((state) => ({
                                        servers: state.servers.map((server) => server.id === activeServerId
                                          ? { ...server, roles: server.roles.filter((item) => item.id !== role.id) }
                                          : server),
                                      }));
                                      setSelectedRoleId(null);
                                    }
                                  }} className="px-3 py-1.5 bg-dc-red/10 text-dc-red text-xs rounded">Delete</button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex gap-2">
                        <input
                          type="text"
                          value={newRoleName}
                          onChange={(e) => setNewRoleName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleCreateRole(); }}
                          placeholder="Role name"
                          className="flex-1 bg-dc-input border-none rounded px-3 py-2 text-white placeholder-dc-text-muted/50"
                        />
                        <button
                          onClick={handleCreateRole}
                          disabled={!newRoleName.trim()}
                          className="px-4 py-2 bg-dc-brand hover:bg-dc-brand-hover text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Create Role
                        </button>
                      </div>
                    </div>
                  )}

                  {activeServerSettingsTab === 'members' && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">Members</h2>
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search members"
                        className="w-full bg-dc-input border-none rounded px-3 py-2 text-white mb-4"
                      />
                      <div className="space-y-2">
                        {activeServer.members.filter(m => m.user.username.toLowerCase().includes(memberSearch.toLowerCase())).map(member => (
                          <div key={member.userId} className="bg-dc-dark rounded-lg p-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-dc-brand flex items-center justify-center text-white text-sm font-bold">
                              {member.user.username[0].toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <p className="text-white font-medium">{member.user.username}</p>
                              <p className="text-xs text-dc-text-muted">Joined {new Date(member.joinedAt).toLocaleDateString()}</p>
                            </div>
                            <select
                              value={selectedRoleId || ''}
                              onChange={async (event) => {
                                const roleId = event.target.value;
                                if (!roleId || !activeServerId) return;
                                const ok = await api.assignRole(activeServerId, roleId, member.userId);
                                if (ok.success) addNotification('Role Assigned', 'The member role was updated.', 'success');
                              }}
                              className="bg-dc-input rounded px-2 py-1 text-xs text-dc-text"
                              defaultValue=""
                            >
                              <option value="">Assign role</option>
                              {activeServer.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                            </select>
                            {member.userId !== user?.id && member.userId !== activeServer.ownerId && (
                              <>
                                <button onClick={() => handleModeration('timeout', member.userId)} title="Timeout member" className="px-2 py-1 rounded text-xs bg-dc-input text-dc-yellow hover:bg-dc-yellow/10">Mute</button>
                                <button onClick={() => handleModeration('kick', member.userId)} title="Kick member" className="px-2 py-1 rounded text-xs bg-dc-input text-dc-text hover:bg-dc-hover">Kick</button>
                                <button onClick={() => handleModeration('ban', member.userId)} title="Ban member" className="px-2 py-1 rounded text-xs bg-dc-red/10 text-dc-red hover:bg-dc-red/20">Ban</button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeServerSettingsTab === 'audit-log' && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">Audit Log</h2>
                      {auditLog.length === 0 ? (
                        <div className="bg-dc-dark rounded-lg p-8 text-center">
                          <p className="text-dc-text-muted">No audit log entries</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {auditLog.map((log: any, i: number) => {
                            const actor = log.user || log.actor || log.userName;
                            const actorName = typeof actor === 'string' ? actor : actor?.username || 'Unknown';
                            const target = log.target || log.targetName || log.resource || '';
                            const targetText = typeof target === 'string' ? target : target?.name || '';
                            const date = log.createdAt || log.timestamp || log.time;
                            return (
                              <div key={log.id ?? i} className="bg-dc-dark rounded-lg p-3 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-dc-active flex items-center justify-center text-dc-text-muted">
                                  <ScrollText className="w-4 h-4" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm text-white"><span className="font-medium">{actorName}</span> — {log.action || log.type || 'Action'}</p>
                                  <p className="text-xs text-dc-text-muted">
                                    {targetText ? `Target: ${targetText} • ` : ''}{date ? new Date(date).toLocaleString() : ''}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {activeServerSettingsTab === 'bans' && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">Moderation</h2>
                      <h3 className="text-sm font-bold text-dc-text-muted uppercase mb-2">Active bans</h3>
                      <div className="space-y-2 mb-6">
                        {bans.length === 0 && <div className="bg-dc-dark rounded-lg p-6 text-center text-dc-text-muted">No active bans.</div>}
                        {bans.map((ban: any) => (
                          <div key={ban.id} className="bg-dc-dark rounded-lg p-3 flex items-center gap-3">
                            <Ban className="w-4 h-4 text-dc-red" />
                            <div className="flex-1">
                              <p className="text-sm text-white">@{ban.user?.username || ban.userId}</p>
                              <p className="text-xs text-dc-text-muted">{ban.reason || 'No reason provided'}</p>
                            </div>
                            <button onClick={async () => {
                              const ok = await api.unbanMember(activeServerId!, ban.userId);
                              if (ok.success) setBans((items) => items.filter((item) => item.id !== ban.id));
                            }} className="px-3 py-1 rounded text-xs bg-dc-input text-dc-text hover:bg-dc-hover">Unban</button>
                          </div>
                        ))}
                      </div>
                      <h3 className="text-sm font-bold text-dc-text-muted uppercase mb-2">Reports</h3>
                      <div className="space-y-2">
                        {reports.length === 0 && <div className="bg-dc-dark rounded-lg p-6 text-center text-dc-text-muted">No reports.</div>}
                        {reports.map((report: any) => (
                          <div key={report.id} className="bg-dc-dark rounded-lg p-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">{report.targetType} · {report.targetId}</span>
                              <span className="ml-auto text-xs text-dc-text-muted">{report.status}</span>
                            </div>
                            <p className="text-xs text-dc-text-muted mt-1">{report.reason}</p>
                            {report.status === 'OPEN' && (
                              <div className="flex gap-2 mt-2">
                                <button onClick={async () => {
                                  const ok = await api.updateReport(activeServerId!, report.id, 'RESOLVED');
                                  if (ok.success) setReports((items) => items.map((item) => item.id === report.id ? { ...item, status: 'RESOLVED' } : item));
                                }} className="px-3 py-1 rounded text-xs bg-dc-green/15 text-dc-green">Resolve</button>
                                <button onClick={async () => {
                                  const ok = await api.updateReport(activeServerId!, report.id, 'DISMISSED');
                                  if (ok.success) setReports((items) => items.map((item) => item.id === report.id ? { ...item, status: 'DISMISSED' } : item));
                                }} className="px-3 py-1 rounded text-xs bg-dc-input text-dc-text">Dismiss</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(activeServerSettingsTab === 'channels' || activeServerSettingsTab === 'invites' || activeServerSettingsTab === 'emojis') && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">{serverTabs.find(t => t.id === activeServerSettingsTab)?.label}</h2>
                      <div className="bg-dc-dark rounded-lg p-8 text-center">
                        <p className="text-dc-text-muted">Nothing here yet.</p>
                      </div>
                    </div>
                  )}

                  {activeServerSettingsTab === 'delete' && (
                    <div>
                      <h2 className="text-xl font-bold text-dc-red mb-6">Delete Server</h2>
                      <div className="bg-dc-dark rounded-lg p-6">
                        <p className="text-white mb-4">Are you sure you want to delete <strong>{activeServer.name}</strong>? This action cannot be undone.</p>
                        <button onClick={handleDeleteServer} className="px-4 py-2 bg-dc-red hover:bg-dc-red/80 text-white font-medium rounded transition-colors">
                          Delete Server
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={toggleServerSettings}
                className="absolute top-4 right-4 w-9 h-9 rounded-full border-2 border-dc-text-muted flex items-center justify-center hover:border-dc-text transition-colors"
              >
                <X className="w-5 h-5 text-dc-text" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
