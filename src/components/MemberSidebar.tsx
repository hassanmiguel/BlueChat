import { useChatStore } from '../stores/chatStore';
import { Crown, Shield, Code } from 'lucide-react';

export default function MemberSidebar() {
  const { servers, activeServerId, view } = useChatStore();
  const activeServer = servers.find(s => s.id === activeServerId);

  if (view !== 'server' || !activeServer) return null;

  const onlineMembers = activeServer.members.filter(m => m.user.status === 'online');
  const offlineMembers = activeServer.members.filter(m => m.user.status === 'offline' || m.user.status === 'invisible');
  const otherMembers = activeServer.members.filter(m => m.user.status === 'idle' || m.user.status === 'dnd');

  const statusColors: Record<string, string> = {
    online: 'bg-dc-green',
    idle: 'bg-dc-yellow',
    dnd: 'bg-dc-red',
    invisible: 'bg-gray-500',
    offline: 'bg-gray-500',
  };

  const getRoleIcon = (roleIds: string[]) => {
    if (roleIds.includes('role1') || roleIds.includes('role10') || roleIds.includes('role20')) {
      return <Crown className="w-3.5 h-3.5 text-dc-yellow" />;
    }
    if (roleIds.includes('role2')) {
      return <Shield className="w-3.5 h-3.5 text-dc-green" />;
    }
    if (roleIds.includes('role3')) {
      return <Code className="w-3.5 h-3.5 text-dc-brand" />;
    }
    return null;
  };

  const getRoleColor = (roleIds: string[]) => {
    const role = activeServer.roles.find(r => roleIds.includes(r.id));
    return role?.color || '#949ba4';
  };

  const renderMember = (member: typeof activeServer.members[0]) => (
    <div
      key={member.userId}
      className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-dc-hover cursor-pointer transition-colors group"
    >
      <div className="relative shrink-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: getRoleColor(member.roleIds) + '40' }}>
          <span style={{ color: getRoleColor(member.roleIds) }}>{member.user.username[0].toUpperCase()}</span>
        </div>
        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[3px] border-dc-member ${statusColors[member.user.status]}`}></div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          {getRoleIcon(member.roleIds)}
          <span className="text-sm font-medium truncate" style={{ color: getRoleColor(member.roleIds) }}>
            {member.user.username}
          </span>
        </div>
        {member.user.customStatus && (
          <p className="text-xs text-dc-text-muted truncate">{member.user.customStatus}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="w-60 bg-dc-member flex flex-col shrink-0 overflow-y-auto py-4 px-2">
      {/* Online members */}
      {onlineMembers.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-bold text-dc-text-muted uppercase px-2 mb-2">
            Online — {onlineMembers.length}
          </h3>
          {onlineMembers.map(renderMember)}
        </div>
      )}

      {/* Other active members (idle/dnd) */}
      {otherMembers.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-bold text-dc-text-muted uppercase px-2 mb-2">
            {otherMembers.filter(m => m.user.status === 'idle').length > 0 ? `Idle — ${otherMembers.filter(m => m.user.status === 'idle').length}` : ''}
            {otherMembers.filter(m => m.user.status === 'dnd').length > 0 ? `${otherMembers.filter(m => m.user.status === 'idle').length > 0 ? ' • ' : ''}DND — ${otherMembers.filter(m => m.user.status === 'dnd').length}` : ''}
          </h3>
          {otherMembers.map(renderMember)}
        </div>
      )}

      {/* Offline members */}
      {offlineMembers.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-bold text-dc-text-muted uppercase px-2 mb-2">
            Offline — {offlineMembers.length}
          </h3>
          {offlineMembers.map(renderMember)}
        </div>
      )}
    </div>
  );
}
