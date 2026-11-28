import { Response, NextFunction } from 'express';
import { AuthRequest, prisma } from './auth.js';

export const PERMISSIONS = [
  'manage_server',
  'manage_channels',
  'manage_roles',
  'manage_members',
  'kick_members',
  'ban_members',
  'timeout_members',
  'delete_messages',
  'manage_messages',
  'manage_invites',
  'create_channels',
  'send_messages',
  'attach_files',
  'mention_everyone',
  'connect',
  'speak',
  'video',
  'screen_share',
  'view_channel',
  'read_message_history',
  'manage_events',
  'manage_webhooks',
  'manage_emojis',
  'manage_stickers',
  'view_audit_log',
  'manage_nicknames',
  'create_invites',
  'manage_onboarding',
  'moderate_members',
  'use_external_emojis',
  'use_external_stickers',
  'create_polls',
  'create_threads',
  'send_voice_messages',
] as const;

export type Permission = typeof PERMISSIONS[number];

export const isServerMember = async (userId: string, serverId: string): Promise<boolean> => {
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
    select: { id: true },
  });
  return Boolean(member);
};

export const hasServerPermission = async (userId: string, serverId: string, permission: Permission | '*'): Promise<boolean> => {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      ownerId: true,
      members: {
        where: { userId },
        select: { roles: { select: { role: { select: { permissions: true } } } } },
      },
    },
  });
  if (!server) return false;
  if (server.ownerId === userId) return true;
  return server.members[0]?.roles.some((assignment) =>
    assignment.role.permissions.includes('*') || assignment.role.permissions.includes(permission)
  ) ?? false;
};

/**
 * Resolve a permission in a specific channel.
 *
 * Server-level role permissions form the base permission set. Channel role
 * overrides are then applied with explicit deny taking precedence over allow.
 * The server owner and roles carrying the administrator wildcard bypass
 * channel overrides.
 */
/**
 * Membership grants channel visibility by default for backward compatibility.
 * A matching role override can explicitly hide a channel with deny:view_channel.
 */
export const canViewChannel = async (userId: string, channelId: string): Promise<boolean> => {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      server: {
        select: {
          ownerId: true,
          members: {
            where: { userId },
            select: { roles: { select: { roleId: true } } },
          },
        },
      },
      permissionOverrides: { select: { roleId: true, deny: true } },
    },
  });
  if (!channel) return false;
  if (channel.server.ownerId === userId) return true;

  const member = channel.server.members[0];
  if (!member) return false;

  const onboarding = await prisma.serverOnboarding.findUnique({
    where: { serverId: channel.server.members.length ? (await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } }))!.serverId : '' },
    select: { enabled: true, requireRuleAccept: true },
  });
  if (onboarding?.enabled && onboarding.requireRuleAccept) {
    const screening = await prisma.serverMemberScreening.findUnique({
      where: {
        serverId_userId: {
          serverId: (await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } }))!.serverId,
          userId,
        },
      },
      select: { acceptedAt: true },
    });
    if (!screening?.acceptedAt) return false;
  }

  const roleIds = new Set(member.roles.map((assignment) => assignment.roleId));
  return !channel.permissionOverrides.some(
    (override) => roleIds.has(override.roleId) && override.deny.includes('view_channel'),
  );
};

export const hasChannelPermission = async (
  userId: string,
  channelId: string,
  permission: Permission,
): Promise<boolean> => {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      serverId: true,
      server: {
        select: {
          ownerId: true,
          members: {
            where: { userId },
            select: {
              roles: {
                select: {
                  role: { select: { id: true, permissions: true } },
                },
              },
            },
          },
        },
      },
      permissionOverrides: {
        select: { roleId: true, allow: true, deny: true },
      },
    },
  });

  if (!channel) return false;
  if (channel.server.ownerId === userId) return true;

  const member = channel.server.members[0];
  if (!member) return false;

  const roles = member.roles.map((assignment) => assignment.role);
  if (roles.some((role) => role.permissions.includes('*') || role.permissions.includes('administrator'))) {
    return true;
  }

  const roleIds = new Set(roles.map((role) => role.id));
  const applicable = channel.permissionOverrides.filter((override) => roleIds.has(override.roleId));

  if (applicable.some((override) => override.deny.includes(permission))) return false;
  if (applicable.some((override) => override.allow.includes(permission))) return true;

  return roles.some((role) => role.permissions.includes(permission));
};

const topRolePosition = async (userId: string, serverId: string): Promise<number> => {
  const member = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId, serverId } },
    select: { roles: { select: { role: { select: { position: true } } } } },
  });
  return member?.roles.reduce((max, assignment) => Math.max(max, assignment.role.position), 0) ?? -1;
};

export const canManageMember = async (actorId: string, targetId: string, serverId: string): Promise<boolean> => {
  const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
  if (!server) return false;
  if (server.ownerId === actorId) return true;
  if (server.ownerId === targetId) return false;
  return (await topRolePosition(actorId, serverId)) > (await topRolePosition(targetId, serverId));
};

export const hasBan = async (userId: string, serverId: string): Promise<boolean> => {
  const ban = await prisma.ban.findUnique({
    where: { serverId_userId: { serverId, userId } },
    select: { id: true, expiresAt: true },
  });
  if (!ban) return false;
  if (ban.expiresAt && ban.expiresAt.getTime() <= Date.now()) {
    await prisma.ban.delete({ where: { serverId_userId: { serverId, userId } } });
    return false;
  }
  return true;
};

export const hasTimeout = async (userId: string, serverId: string): Promise<boolean> => {
  const timeout = await prisma.timeout.findUnique({
    where: { serverId_userId: { serverId, userId } },
    select: { expiresAt: true },
  });
  return Boolean(timeout && timeout.expiresAt.getTime() > Date.now());
};

export const requireServerMember = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!(await isServerMember(req.userId!, req.params.id))) {
    return res.status(403).json({ error: 'Not a member of this server' });
  }
  next();
};

export const requireServerMemberByBody = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!(await isServerMember(req.userId!, req.body.serverId))) {
    return res.status(403).json({ error: 'Not a member of this server' });
  }
  next();
};

export const requireServerPermission = (permission: Permission) => async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!(await hasServerPermission(req.userId!, req.params.id, permission))) {
    return res.status(403).json({ error: `Missing permission: ${permission}` });
  }
  next();
};

export const requireServerManager = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!(await hasServerPermission(req.userId!, req.params.id, 'manage_server'))) {
    return res.status(403).json({ error: 'Server owner or Manage Server permission required' });
  }
  next();
};

export const requireServerOwner = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const server = await prisma.server.findUnique({
    where: { id: req.params.id },
    select: { ownerId: true },
  });
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.ownerId !== req.userId) {
    return res.status(403).json({ error: 'Only the server owner can perform this action' });
  }
  next();
};

export const requireChannelAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const channel = await prisma.channel.findUnique({
    where: { id: req.params.id },
    select: { serverId: true },
  });
  if (!channel) return res.status(404).json({ error: 'Channel not found' });
  if (!(await canViewChannel(req.userId!, req.params.id))) {
    return res.status(403).json({ error: 'You do not have access to this channel' });
  }
  if (await hasTimeout(req.userId!, channel.serverId)) {
    return res.status(403).json({ error: 'You are timed out in this server' });
  }
  next();
};

export const requireChannelPermission = (permission: Permission) => async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!(await hasChannelPermission(req.userId!, req.params.id, permission))) {
    return res.status(403).json({ error: `Missing channel permission: ${permission}` });
  }
  next();
};

export const requireChannelManager = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!(await hasChannelPermission(req.userId!, req.params.id, 'manage_channels'))) {
    return res.status(403).json({ error: 'Manage Channels permission required' });
  }
  next();
};

export const requireMessageAuthorOrManager = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const message = await prisma.message.findUnique({
    where: { id: req.params.id },
    select: { authorId: true, channelId: true },
  });
  if (!message) return res.status(404).json({ error: 'Message not found' });
  if (message.authorId === req.userId) return next();

  const channel = await prisma.channel.findUnique({
    where: { id: message.channelId },
    select: { serverId: true },
  });
  if (channel && (await hasServerPermission(req.userId!, channel.serverId, 'manage_messages'))) return next();

  return res.status(403).json({ error: 'Not authorized to modify this message' });
};

export const requireMessageAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const message = await prisma.message.findUnique({
    where: { id: req.params.id },
    select: { channelId: true },
  });
  if (!message) return res.status(404).json({ error: 'Message not found' });
  const channel = await prisma.channel.findUnique({
    where: { id: message.channelId },
    select: { id: true, serverId: true },
  });
  if (!channel || !(await canViewChannel(req.userId!, channel.id))) {
    return res.status(403).json({ error: 'You do not have access to this channel' });
  }
  next();
};
