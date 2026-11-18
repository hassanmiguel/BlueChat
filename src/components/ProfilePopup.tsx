import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../stores/uiStore';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { X, MessageCircle, UserPlus, Crown, Shield, Code, Ban } from 'lucide-react';
import Avatar from './Avatar';

export default function ProfilePopup() {
  const { showProfilePopup, profileUserId, closeProfile } = useUIStore();
  const { allUsers, servers, activeServerId, friends, createDirectMessage, sendFriendRequest, blockUser, unblockUser } = useChatStore();
  const [note, setNote] = useState('');
  const [friendStatus, setFriendStatus] = useState('');

  useEffect(() => {
    setNote('');
    setFriendStatus('');
  }, [profileUserId]);

  const profileUser = allUsers.find(u => u.id === profileUserId);
  const activeServer = servers.find(s => s.id === activeServerId);
  const member = activeServer?.members.find(m => m.userId === profileUserId);
  const currentUser = useAuthStore(s => s.user);

  // If no profile user found in allUsers, check if it's the current user
  const displayUser = profileUser || (profileUserId === currentUser?.id ? currentUser : null);
  
  if (!displayUser) return null;

  const isSelf = displayUser.id === currentUser?.id;
  const isFriend = friends.some(f => f.userId === displayUser.id && f.status === 'accepted');
  const isBlocked = friends.some(f => f.userId === displayUser.id && f.status === 'blocked');

  const handleSendMessage = () => {
    createDirectMessage(displayUser.id, displayUser);
    closeProfile();
  };

  const handleAddFriend = async () => {
    if (isFriend) {
      setFriendStatus('Already friends');
      return;
    }
    const success = await sendFriendRequest(displayUser.username);
    setFriendStatus(success ? 'Friend request sent' : 'Could not send request');
  };

  const handleBlock = async () => {
    if (isBlocked) {
      const ok = await unblockUser(displayUser.id);
      setFriendStatus(ok ? 'User unblocked' : 'Could not unblock user');
    } else {
      const ok = await blockUser(displayUser.id);
      setFriendStatus(ok ? 'User blocked' : 'Could not block user');
    }
  };

  const statusKey = (displayUser.status || 'offline').toLowerCase();
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
                <Avatar
                  src={displayUser.avatar}
                  name={displayUser.username}
                  className="w-20 h-20 rounded-full border-[6px] border-dc-dark text-white text-2xl font-bold overflow-hidden"
                  style={{ backgroundColor: getRoleColor(member?.roleIds || []) + '40', color: getRoleColor(member?.roleIds || []) }}
                />
                <div className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-[4px] border-dc-dark ${statusColors[statusKey]}`}></div>
              </div>
            </div>

            {/* Info */}
            <div className="p-4 pt-2">
              <div className="flex items-center gap-2 mb-1">
                {member && getRoleIcon(member.roleIds)}
                <h3 className="text-xl font-bold text-white">{displayUser.username}</h3>
                <span className="text-dc-text-muted">#{displayUser.discriminator}</span>
              </div>
              
              {displayUser.customStatus && (
                <p className="text-sm text-dc-text-muted mb-3">{displayUser.customStatus}</p>
              )}

              {/* Status */}
              <div className="bg-dc-sidebar/50 rounded-lg p-3 mb-3">
                <h4 className="text-xs font-bold text-dc-text-muted uppercase mb-1">Status</h4>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${statusColors[displayUser.status]}`}></div>
                  <span className="text-sm text-white">{statusLabels[displayUser.status]}</span>
                </div>
              </div>

              {/* Bio */}
              {displayUser.bio && (
                <div className="bg-dc-sidebar/50 rounded-lg p-3 mb-3">
                  <h4 className="text-xs font-bold text-dc-text-muted uppercase mb-1">About Me</h4>
                  <p className="text-sm text-dc-text">{displayUser.bio}</p>
                </div>
              )}

              {/* Member Since */}
              <div className="bg-dc-sidebar/50 rounded-lg p-3 mb-4">
                <h4 className="text-xs font-bold text-dc-text-muted uppercase mb-1">Member Since</h4>
                <p className="text-sm text-white">{new Date(displayUser.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
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
                <h4 className="text-xs font-bold text-dc-text-muted uppercase mb-1">Note <span className="font-normal normal-case text-dc-text-muted/70">(local only)</span></h4>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Click to add a note"
                  className="w-full bg-transparent text-sm text-dc-text placeholder-dc-text-muted/50 resize-none border-none p-0"
                  rows={2}
                />
              </div>

              {/* Actions */}
              {friendStatus && (
                <p className="text-xs text-dc-text-muted mb-2">{friendStatus}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleSendMessage}
                  disabled={isSelf}
                  title={isSelf ? 'Cannot message yourself' : undefined}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-dc-brand hover:bg-dc-brand-hover text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MessageCircle className="w-4 h-4" />
                  Send Message
                </button>
                <button
                  onClick={handleAddFriend}
                  disabled={isSelf || isFriend}
                  title={isSelf ? 'Cannot add yourself' : isFriend ? 'Already friends' : 'Add Friend'}
                  className="w-10 h-10 flex items-center justify-center bg-dc-input hover:bg-dc-active text-dc-text rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserPlus className="w-5 h-5" />
                </button>
                <button
                  onClick={handleBlock}
                  disabled={isSelf}
                  title={isBlocked ? 'Unblock user' : 'Block user'}
                  className="w-10 h-10 flex items-center justify-center bg-dc-input hover:bg-dc-active text-dc-text rounded transition-colors disabled:opacity-50"
                >
                  <Ban className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
