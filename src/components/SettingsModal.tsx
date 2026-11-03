import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { X, User, Palette, Bell, Mic, Keyboard, Shield, LogOut, Hash, Users, AtSign, Smile, Ban, ScrollText, Settings as SettingsIcon, Trash2 } from 'lucide-react';

export default function SettingsModal() {
  const { showUserSettings, showServerSettings, toggleUserSettings, toggleServerSettings, activeSettingsTab, setActiveSettingsTab, activeServerSettingsTab, setActiveServerSettingsTab, theme, setTheme, accentColor, setAccentColor, compactMode, toggleCompactMode } = useUIStore();
  const { user, logout, updateUser } = useAuthStore();
  const { servers, activeServerId } = useChatStore();

  const activeServer = servers.find(s => s.id === activeServerId);

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
    { id: 'bans', label: 'Bans', icon: Ban, category: 'SERVER SETTINGS' },
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
                            <button className="px-4 py-1.5 bg-dc-brand hover:bg-dc-brand-hover text-white text-sm font-medium rounded transition-colors">
                              Edit User Profile
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Account Info */}
                      <div className="space-y-4">
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Username</label>
                          <div className="flex items-center gap-2">
                            <span className="text-white">{user?.username}</span>
                            <span className="text-dc-text-muted">#{user?.discriminator}</span>
                            <button className="ml-auto text-sm text-dc-text-link hover:underline">Edit</button>
                          </div>
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Email</label>
                          <div className="flex items-center gap-2">
                            <span className="text-white">{user?.email}</span>
                            <button className="ml-auto text-sm text-dc-text-link hover:underline">Edit</button>
                          </div>
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Password</label>
                          <div className="flex items-center gap-2">
                            <span className="text-white">••••••••</span>
                            <button className="ml-auto text-sm text-dc-text-link hover:underline">Change</button>
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
                          <select className="w-full bg-dc-input border-none rounded px-3 py-2 text-white">
                            <option>Default - Microphone</option>
                            <option>USB Audio Device</option>
                          </select>
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Output Device</label>
                          <select className="w-full bg-dc-input border-none rounded px-3 py-2 text-white">
                            <option>Default - Speakers</option>
                            <option>USB Audio Device</option>
                          </select>
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Input Volume</label>
                          <input type="range" min="0" max="100" defaultValue="75" className="w-full accent-dc-brand" />
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Voice Activity Detection</label>
                          <div className="flex gap-2">
                            <button className="flex-1 px-4 py-2 bg-dc-brand text-white rounded text-sm font-medium">Voice Activity</button>
                            <button className="flex-1 px-4 py-2 bg-dc-input text-dc-text rounded text-sm font-medium">Push to Talk</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(activeSettingsTab === 'profiles' || activeSettingsTab === 'privacy' || activeSettingsTab === 'notifications' || activeSettingsTab === 'keybinds') && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">{userTabs.find(t => t.id === activeSettingsTab)?.label}</h2>
                      <div className="bg-dc-dark rounded-lg p-8 text-center">
                        <p className="text-dc-text-muted">This section is under development</p>
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
                            defaultValue={activeServer.name}
                            className="w-full bg-dc-input border-none rounded px-3 py-2 text-white"
                          />
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Server Icon</label>
                          <div className="flex items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-dc-brand flex items-center justify-center text-white text-2xl font-bold">
                              {activeServer.name[0]}
                            </div>
                            <button className="px-4 py-2 bg-dc-brand hover:bg-dc-brand-hover text-white text-sm font-medium rounded transition-colors">
                              Upload Image
                            </button>
                          </div>
                        </div>
                        <div className="bg-dc-dark rounded-lg p-4">
                          <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Verification Level</label>
                          <select className="w-full bg-dc-input border-none rounded px-3 py-2 text-white">
                            <option>Unrestricted</option>
                            <option>Low - Verified Email</option>
                            <option>Medium - Registered for 5+ min</option>
                            <option>High - Member for 10+ min</option>
                            <option>Very High - Verified Phone</option>
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
                          <div key={role.id} className="bg-dc-dark rounded-lg p-4 flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: role.color }}></div>
                            <span className="text-white font-medium flex-1">{role.name}</span>
                            <span className="text-sm text-dc-text-muted">{activeServer.members.filter(m => m.roleIds.includes(role.id)).length} members</span>
                          </div>
                        ))}
                      </div>
                      <button className="mt-4 w-full py-2 border-2 border-dashed border-dc-divider/50 rounded-lg text-dc-text-muted hover:text-dc-text hover:border-dc-text transition-colors">
                        Create Role
                      </button>
                    </div>
                  )}

                  {activeServerSettingsTab === 'members' && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">Members</h2>
                      <input
                        type="text"
                        placeholder="Search members"
                        className="w-full bg-dc-input border-none rounded px-3 py-2 text-white mb-4"
                      />
                      <div className="space-y-2">
                        {activeServer.members.map(member => (
                          <div key={member.userId} className="bg-dc-dark rounded-lg p-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-dc-brand flex items-center justify-center text-white text-sm font-bold">
                              {member.user.username[0].toUpperCase()}
                            </div>
                            <div className="flex-1">
                              <p className="text-white font-medium">{member.user.username}</p>
                              <p className="text-xs text-dc-text-muted">Joined {new Date(member.joinedAt).toLocaleDateString()}</p>
                            </div>
                            <button className="p-2 text-dc-text-muted hover:text-dc-red transition-colors">
                              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="12" cy="5" r="2"/>
                                <circle cx="12" cy="12" r="2"/>
                                <circle cx="12" cy="19" r="2"/>
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeServerSettingsTab === 'audit-log' && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">Audit Log</h2>
                      <div className="space-y-2">
                        {[
                          { action: 'Message Deleted', user: 'BlueAdmin', target: '#general', time: '2 minutes ago' },
                          { action: 'Member Kicked', user: 'BlueAdmin', target: 'SpamUser123', time: '1 hour ago' },
                          { action: 'Role Created', user: 'BlueAdmin', target: 'Moderator', time: '3 hours ago' },
                          { action: 'Channel Created', user: 'DevMaster', target: '#resources', time: '1 day ago' },
                        ].map((log, i) => (
                          <div key={i} className="bg-dc-dark rounded-lg p-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-dc-active flex items-center justify-center text-dc-text-muted">
                              <ScrollText className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-white"><span className="font-medium">{log.user}</span> — {log.action}</p>
                              <p className="text-xs text-dc-text-muted">Target: {log.target} • {log.time}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(activeServerSettingsTab === 'channels' || activeServerSettingsTab === 'invites' || activeServerSettingsTab === 'bans' || activeServerSettingsTab === 'emojis') && (
                    <div>
                      <h2 className="text-xl font-bold text-white mb-6">{serverTabs.find(t => t.id === activeServerSettingsTab)?.label}</h2>
                      <div className="bg-dc-dark rounded-lg p-8 text-center">
                        <p className="text-dc-text-muted">This section is under development</p>
                      </div>
                    </div>
                  )}

                  {activeServerSettingsTab === 'delete' && (
                    <div>
                      <h2 className="text-xl font-bold text-dc-red mb-6">Delete Server</h2>
                      <div className="bg-dc-dark rounded-lg p-6">
                        <p className="text-white mb-4">Are you sure you want to delete <strong>{activeServer.name}</strong>? This action cannot be undone.</p>
                        <button className="px-4 py-2 bg-dc-red hover:bg-dc-red/80 text-white font-medium rounded transition-colors">
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
