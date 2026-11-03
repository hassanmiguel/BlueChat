import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { useChatStore } from '../stores/chatStore';
import { X, Copy, Check, UserPlus, RefreshCw } from 'lucide-react';

export default function InviteModal() {
  const { showInviteModal, toggleInviteModal } = useUIStore();
  const { servers, activeServerId } = useChatStore();
  const [copied, setCopied] = useState(false);
  
  const activeServer = servers.find(s => s.id === activeServerId);
  const inviteLink = `https://bluechat.com/invite/${activeServer?.id || 'abc123'}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const friends = [
    { id: '2', username: 'DevMaster', status: 'online' },
    { id: '3', username: 'PixelArtist', status: 'idle' },
    { id: '5', username: 'NightOwl', status: 'dnd' },
    { id: '6', username: 'CloudNine', status: 'online' },
    { id: '7', username: 'GameLover', status: 'offline' },
  ];

  const statusColors: Record<string, string> = {
    online: 'bg-dc-green',
    idle: 'bg-dc-yellow',
    dnd: 'bg-dc-red',
    offline: 'bg-gray-500',
  };

  return (
    <AnimatePresence>
      {showInviteModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={toggleInviteModal}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-[440px] max-h-[80vh] bg-dc-dark rounded-lg overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-dc-divider/30">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Invite friends to {activeServer?.name}</h2>
                <button onClick={toggleInviteModal} className="text-dc-text-muted hover:text-dc-text">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Invite Link */}
            <div className="p-4 border-b border-dc-divider/30">
              <label className="text-xs font-bold text-dc-text-muted uppercase block mb-2">
                Or, send them a server invite
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="flex-1 bg-dc-darker border border-dc-divider/50 rounded-lg px-3 py-2 text-sm text-dc-text"
                />
                <motion.button
                  onClick={handleCopy}
                  whileTap={{ scale: 0.95 }}
                  className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors ${
                    copied ? 'bg-dc-green text-white' : 'bg-dc-brand hover:bg-dc-brand-hover text-white'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </motion.button>
              </div>
              <button className="flex items-center gap-1 mt-2 text-xs text-dc-text-muted hover:text-dc-text transition-colors">
                <RefreshCw className="w-3 h-3" />
                Regenerate Link
              </button>
            </div>

            {/* Friends list */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-xs font-bold text-dc-text-muted uppercase mb-3">
                Send Invite to ({friends.length})
              </h3>
              <div className="space-y-1">
                {friends.map(friend => (
                  <div key={friend.id} className="flex items-center gap-3 px-2 py-2 rounded hover:bg-dc-hover transition-colors">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-dc-brand flex items-center justify-center text-white text-sm font-bold">
                        {friend.username[0]}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dc-dark ${statusColors[friend.status]}`}></div>
                    </div>
                    <span className="flex-1 text-sm text-white font-medium">{friend.username}</span>
                    <button className="px-3 py-1 bg-dc-brand hover:bg-dc-brand-hover text-white text-xs font-medium rounded transition-colors flex items-center gap-1">
                      <UserPlus className="w-3 h-3" />
                      Invite
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
