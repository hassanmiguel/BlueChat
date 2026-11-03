import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { X, Plus, Globe, Gamepad2, Music, Palette, Code, Coffee } from 'lucide-react';

export default function CreateServerModal() {
  const { showCreateServer, toggleCreateServer } = useUIStore();
  const [step, setStep] = useState<'choose' | 'create' | 'join'>('choose');
  const [serverName, setServerName] = useState('');
  const [inviteLink, setInviteLink] = useState('');

  const templates = [
    { icon: Gamepad2, label: 'Gaming', color: '#5865f2' },
    { icon: Music, label: 'Music', color: '#eb459e' },
    { icon: Palette, label: 'Art & Design', color: '#f0b232' },
    { icon: Code, label: 'Development', color: '#23a559' },
    { icon: Coffee, label: 'Community', color: '#e67e22' },
    { icon: Globe, label: 'Education', color: '#00a8fc' },
  ];

  const handleCreate = () => {
    if (serverName.trim()) {
      // In a real app, this would create the server via API
      useUIStore.getState().addNotification('Server Created', `${serverName} has been created!`, 'success');
      toggleCreateServer();
      setStep('choose');
      setServerName('');
    }
  };

  return (
    <AnimatePresence>
      {showCreateServer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={toggleCreateServer}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-[460px] bg-dc-dark rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {step === 'choose' && (
              <div className="p-6">
                <button
                  onClick={toggleCreateServer}
                  className="absolute top-4 right-4 text-dc-text-muted hover:text-dc-text"
                >
                  <X className="w-6 h-6" />
                </button>
                
                <h2 className="text-2xl font-bold text-white text-center mb-2">Create your server</h2>
                <p className="text-dc-text-muted text-center text-sm mb-6">
                  Your server is where you and your friends hang out. Make yours and start talking.
                </p>

                <button
                  onClick={() => setStep('create')}
                  className="w-full flex items-center gap-4 p-3 rounded-lg border border-dc-divider/30 hover:border-dc-brand/50 hover:bg-dc-hover transition-all mb-3"
                >
                  <Plus className="w-10 h-10 text-dc-brand shrink-0" />
                  <span className="text-white font-medium">Create My Own</span>
                </button>

                <div className="border-t border-dc-divider/30 my-4"></div>
                <h3 className="text-xs font-bold text-dc-text-muted uppercase mb-3">Start from a template</h3>
                
                <div className="space-y-2">
                  {templates.map((template) => (
                    <button
                      key={template.label}
                      onClick={() => setStep('create')}
                      className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-dc-hover transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: template.color + '20' }}>
                        <template.icon className="w-5 h-5" style={{ color: template.color }} />
                      </div>
                      <span className="text-white font-medium">{template.label}</span>
                    </button>
                  ))}
                </div>

                <div className="border-t border-dc-divider/30 my-4"></div>
                
                <button
                  onClick={() => setStep('join')}
                  className="w-full text-center text-dc-text-link hover:underline text-sm"
                >
                  Have an invite code?
                </button>
              </div>
            )}

            {step === 'create' && (
              <div className="p-6">
                <button
                  onClick={() => setStep('choose')}
                  className="absolute top-4 right-4 text-dc-text-muted hover:text-dc-text"
                >
                  <X className="w-6 h-6" />
                </button>

                <h2 className="text-2xl font-bold text-white text-center mb-6">Tell us more about your server</h2>
                
                <div className="mb-6">
                  <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">
                    Server Name <span className="text-dc-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    placeholder="Enter a server name"
                    className="w-full bg-dc-darker border border-dc-divider/50 rounded-lg px-4 py-2.5 text-dc-text placeholder-dc-text-muted/50 focus:border-dc-brand transition-colors"
                    autoFocus
                  />
                </div>

                <div className="mb-6">
                  <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">Server Icon (optional)</label>
                  <div className="w-20 h-20 rounded-full bg-dc-sidebar border-2 border-dashed border-dc-divider/50 flex items-center justify-center cursor-pointer hover:border-dc-brand transition-colors">
                    <Plus className="w-6 h-6 text-dc-text-muted" />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('choose')}
                    className="px-4 py-2 text-dc-text hover:text-white hover:bg-dc-hover rounded transition-colors"
                  >
                    Back
                  </button>
                  <motion.button
                    onClick={handleCreate}
                    disabled={!serverName.trim()}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 bg-dc-brand hover:bg-dc-brand-hover text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create Server
                  </motion.button>
                </div>
              </div>
            )}

            {step === 'join' && (
              <div className="p-6">
                <button
                  onClick={() => setStep('choose')}
                  className="absolute top-4 right-4 text-dc-text-muted hover:text-dc-text"
                >
                  <X className="w-6 h-6" />
                </button>

                <h2 className="text-2xl font-bold text-white text-center mb-2">Join a Server</h2>
                <p className="text-dc-text-muted text-center text-sm mb-6">
                  Enter an invite below to join an existing server
                </p>

                <div className="mb-6">
                  <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">
                    Invite Link <span className="text-dc-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={inviteLink}
                    onChange={(e) => setInviteLink(e.target.value)}
                    placeholder="https://bluechat.com/invite/..."
                    className="w-full bg-dc-darker border border-dc-divider/50 rounded-lg px-4 py-2.5 text-dc-text placeholder-dc-text-muted/50 focus:border-dc-brand transition-colors"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('choose')}
                    className="px-4 py-2 text-dc-text hover:text-white hover:bg-dc-hover rounded transition-colors"
                  >
                    Back
                  </button>
                  <motion.button
                    onClick={() => {
                      if (inviteLink.trim()) {
                        useUIStore.getState().addNotification('Joined Server', 'You have joined the server!', 'success');
                        toggleCreateServer();
                        setStep('choose');
                        setInviteLink('');
                      }
                    }}
                    disabled={!inviteLink.trim()}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 bg-dc-brand hover:bg-dc-brand-hover text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Join Server
                  </motion.button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
