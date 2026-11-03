import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { useChatStore } from '../stores/chatStore';
import { X, MessageCircle, UserPlus, Crown, Shield, Code } from 'lucide-react';

export default function ProfilePopup() {
  const { showProfilePopup, profileUserId, closeProfile } = useUIStore();
  const { allUsers, servers, activeServerId } = useChatStore();

  const profileUser = allUsers.find(u => u.id === profileUserId);
  const activeServer = servers.find(s => s.id === activeServerId);
  const member = activeServer?.members.find(m => m.userId === profileUserId);

  if (!profileUser) return null;

  const statusColors: Record<string, string> = {
    online: 'bg-dc-green',
    idle: 'bg-dc-yellow',
    dnd: 'bg-dc-red',
    invisible: 'bg-gray-500',
    offline: 'bg-gray-500',
  };

  const statusLabels: Record<string, string> = {
    online: 'Online',
    idle: 'Idle',
    dnd: 'Do Not Disturb',
    invisible: 'Invisible',
    offline: 'Offline',
  };

  const getRoleColor = (roleIds: string[]) => {
    const role = activeServer?.roles.find(r => roleIds.includes(r.id));
    return role?.color || '#949ba4';
  };

  const getRoleName = (roleIds: string[]) => {
    const role = activeServer?.roles.find(r => roleIds.includes(r.id));
    return role?.name || 'Member';
  };

  const getRoleIcon = (roleIds: string[]) => {
    if (roleIds.includes('role1') || roleIds.includes('role10') || roleIds.includes('role20')) {
      return <Crown className="w-4 h-4 text-dc-yellow" />;
    }
    if (roleIds.includes('role2')) {
      return <Shield className="w-4 h-4 text-dc-green" />;
    }
    if (roleIds.includes('role3')) {
      return <Code className="w-4 h-4 text-dc-brand" />;
    }
    return null;
  };

  return (
    <AnimatePresence>
      {showProfilePopup && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeProfile}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25 }}
            className="w-96 bg-dc-dark rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Banner */}
            <div className="h-16 relative" style={{ background: `linear-gradient(135deg, ${getRoleColor(member?.roleIds || [])}66, ${getRoleColor(member?.roleIds || [])}33)` }}>
              <button
                onClick={closeProfile}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/30 flex items-center justify-center hover:bg-black/50 transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Avatar */}
            <div className="relative px-4 -mt-8">
              <div className="relative inline-block">
                <div 
                  className="w-20 h-20 rounded-full border-[6px] border-dc-dark flex items-center justify-center text-white text-2xl font-bold"
                  style={{ backgroundColor: getRoleColor(member?.roleIds || []) + '40' }}
                >
                  <span style={{ color: getRoleColor(member?.roleIds || []) }}>{profileUser.username[0].toUpperCase()}</span>
                </div>
                <div className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-[4px] border-dc-dark ${statusColors[profileUser.status]}`}></div>
              </div>
            </div>

            {/* Info */}
            <div className="p-4 pt-2">
              <div className="flex items-center gap-2 mb-1">
                {member && getRoleIcon(member.roleIds)}
                <h3 className="text-xl font-bold text-white">{profileUser.username}</h3>
                <span className="text-dc-text-muted">#{profileUser.discriminator}</span>
              </div>
              
              {profileUser.customStatus && (
                <p className="text-sm text-dc-text-muted mb-3">{profileUser.customStatus}</p>
              )}

              {/* Status */}
              <div className="bg-dc-sidebar/50 rounded-lg p-3 mb-3">
                <h4 className="text-xs font-bold text-dc-text-muted uppercase mb-1">Status</h4>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${statusColors[profileUser.status]}`}></div>
                  <span className="text-sm text-white">{statusLabels[profileUser.status]}</span>
                </div>
              </div>

              {/* Bio */}
              {profileUser.bio && (
                <div className="bg-dc-sidebar/50 rounded-lg p-3 mb-3">
                  <h4 className="text-xs font-bold text-dc-text-muted uppercase mb-1">About Me</h4>
                  <p className="text-sm text-dc-text">{profileUser.bio}</p>
                </div>
              )}

              {/* Member Since */}
              <div className="bg-dc-sidebar/50 rounded-lg p-3 mb-4">
                <h4 className="text-xs font-bold text-dc-text-muted uppercase mb-1">Member Since</h4>
                <p className="text-sm text-white">{new Date(profileUser.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>

              {/* Roles */}
              {member && (
                <div className="mb-4">
                  <h4 className="text-xs font-bold text-dc-text-muted uppercase mb-2">Roles</h4>
                  <div className="flex flex-wrap gap-1">
                    {member.roleIds.map(roleId => {
                      const role = activeServer?.roles.find(r => r.id === roleId);
                      if (!role) return null;
                      return (
                        <span
                          key={roleId}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
                          style={{ borderColor: role.color + '40', color: role.color, backgroundColor: role.color + '15' }}
                        >
                          {role.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Note */}
              <div className="mb-4">
                <h4 className="text-xs font-bold text-dc-text-muted uppercase mb-1">Note</h4>
                <textarea
                  placeholder="Click to add a note"
                  className="w-full bg-transparent text-sm text-dc-text placeholder-dc-text-muted/50 resize-none border-none p-0"
                  rows={2}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-dc-brand hover:bg-dc-brand-hover text-white text-sm font-medium rounded transition-colors">
                  <MessageCircle className="w-4 h-4" />
                  Send Message
                </button>
                <button className="w-10 h-10 flex items-center justify-center bg-dc-input hover:bg-dc-active text-dc-text rounded transition-colors">
                  <UserPlus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
