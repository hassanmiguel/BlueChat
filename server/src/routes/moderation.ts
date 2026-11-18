import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';
import {
  canManageMember,
  hasServerPermission,
  isServerMember,
} from '../middleware/authz.js';
import { logAudit } from '../utils/audit.js';

export const moderationRouter = Router();

const zodError = (error: unknown, res: Response) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
  }
  return null;
};

const requireModerator = (permission: 'kick_members' | 'ban_members' | 'timeout_members' | 'manage_messages') =>
  async (req: AuthRequest, res: Response, next: any) => {
    if (!(await hasServerPermission(req.userId!, req.params.id, permission))) {
      return res.status(403).json({ error: `Missing permission: ${permission}` });
    }
    next();
  };

moderationRouter.post('/:id/kick/:userId', authenticate, requireModerator('kick_members'), async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canManageMember(req.userId!, req.params.userId, req.params.id))) {
      return res.status(403).json({ error: 'You cannot moderate a member at or above your role' });
    }
    const { reason } = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body || {});
    await prisma.serverMember.delete({
      where: { userId_serverId: { userId: req.params.userId, serverId: req.params.id } },
    });
    await logAudit(req.params.id, req.userId!, 'MEMBER_KICK', req.params.userId, { reason });
    res.json({ success: true });
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to kick member' });
  }
});

moderationRouter.post('/:id/ban/:userId', authenticate, requireModerator('ban_members'), async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canManageMember(req.userId!, req.params.userId, req.params.id))) {
      return res.status(403).json({ error: 'You cannot moderate a member at or above your role' });
    }
    const { reason, expiresAt } = z.object({
      reason: z.string().trim().max(500).optional(),
      expiresAt: z.string().datetime().optional(),
    }).parse(req.body || {});

    await prisma.$transaction([
      prisma.ban.upsert({
        where: { serverId_userId: { serverId: req.params.id, userId: req.params.userId } },
        update: { reason, expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 100) },
        create: {
          serverId: req.params.id,
          userId: req.params.userId,
          reason,
          expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 100),
          bannedById: req.userId!,
        },
      }),
      prisma.serverMember.deleteMany({
        where: { serverId: req.params.id, userId: req.params.userId },
      }),
    ]);
    await logAudit(req.params.id, req.userId!, 'MEMBER_BAN', req.params.userId, { reason, expiresAt });
    res.json({ success: true });
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to ban member' });
  }
});

moderationRouter.delete('/:id/ban/:userId', authenticate, requireModerator('ban_members'), async (req: AuthRequest, res: Response) => {
  try {
    await prisma.ban.delete({
      where: { serverId_userId: { serverId: req.params.id, userId: req.params.userId } },
    });
    await logAudit(req.params.id, req.userId!, 'MEMBER_UNBAN', req.params.userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unban member' });
  }
});

moderationRouter.post('/:id/timeout/:userId', authenticate, requireModerator('timeout_members'), async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canManageMember(req.userId!, req.params.userId, req.params.id))) {
      return res.status(403).json({ error: 'You cannot moderate a member at or above your role' });
    }
    const { reason, minutes } = z.object({
      reason: z.string().trim().max(500).optional(),
      minutes: z.number().int().min(1).max(10080),
    }).parse(req.body);

    await prisma.timeout.upsert({
      where: { serverId_userId: { serverId: req.params.id, userId: req.params.userId } },
      update: { reason, expiresAt: new Date(Date.now() + minutes * 60 * 1000), createdById: req.userId! },
      create: {
        serverId: req.params.id,
        userId: req.params.userId,
        reason,
        expiresAt: new Date(Date.now() + minutes * 60 * 1000),
        createdById: req.userId!,
      },
    });
    await logAudit(req.params.id, req.userId!, 'MEMBER_TIMEOUT', req.params.userId, { reason, minutes });
    res.json({ success: true });
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to time out member' });
  }
});

moderationRouter.delete('/:id/timeout/:userId', authenticate, requireModerator('timeout_members'), async (req: AuthRequest, res: Response) => {
  try {
    await prisma.timeout.deleteMany({
      where: { serverId: req.params.id, userId: req.params.userId },
    });
    await logAudit(req.params.id, req.userId!, 'MEMBER_TIMEOUT', req.params.userId, { removed: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove timeout' });
  }
});

moderationRouter.get('/:id/bans', authenticate, requireModerator('ban_members'), async (req: AuthRequest, res: Response) => {
  try {
    const bans = await prisma.ban.findMany({
      where: { serverId: req.params.id },
      include: { user: { select: { id: true, username: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(bans);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get bans' });
  }
});

moderationRouter.get('/:id/timeouts', authenticate, requireModerator('timeout_members'), async (req: AuthRequest, res: Response) => {
  try {
    const timeouts = await prisma.timeout.findMany({
      where: { serverId: req.params.id, expiresAt: { gt: new Date() } },
      include: { user: { select: { id: true, username: true, avatar: true } } },
      orderBy: { expiresAt: 'desc' },
    });
    res.json(timeouts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get timeouts' });
  }
});

moderationRouter.post('/:id/reports', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { targetType, targetId, reason } = z.object({
      targetType: z.enum(['USER', 'MESSAGE', 'SERVER']),
      targetId: z.string().min(1).max(64),
      reason: z.string().trim().min(4).max(2000),
    }).parse(req.body);
    if (!(await isServerMember(req.userId!, req.params.id))) {
      return res.status(403).json({ error: 'Not a member of this server' });
    }
    const report = await prisma.report.create({
      data: {
        reporterId: req.userId!,
        serverId: req.params.id,
        targetType,
        targetId,
        reason,
      },
    });
    await logAudit(req.params.id, req.userId!, 'REPORT_CREATED', targetId, { targetType, reason });
    res.status(201).json(report);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

moderationRouter.get('/:id/reports', authenticate, requireModerator('manage_messages'), async (req: AuthRequest, res: Response) => {
  try {
    const reports = await prisma.report.findMany({
      where: { serverId: req.params.id },
      include: { reporter: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

moderationRouter.patch('/:id/reports/:reportId', authenticate, requireModerator('manage_messages'), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = z.object({ status: z.enum(['RESOLVED', 'DISMISSED', 'OPEN']) }).parse(req.body);
    const report = await prisma.report.update({
      where: { id: req.params.reportId, serverId: req.params.id },
      data: { status, resolvedAt: status === 'OPEN' ? null : new Date() },
    });
    await logAudit(req.params.id, req.userId!, 'REPORT_RESOLVED', report.id, { status });
    res.json(report);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to update report' });
  }
});
