import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';

export const notificationRouter = Router();

const zodError = (error: unknown, res: Response) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
  }
  return null;
};

notificationRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit as string, 10) || 50, 1), 100);
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const unread = await prisma.notification.count({ where: { userId: req.userId, readAt: null } });
    res.json({ notifications, unread });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

notificationRouter.patch('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const notification = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.userId },
      data: { readAt: new Date() },
    });
    if (!notification.count) return res.status(404).json({ error: 'Notification not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

notificationRouter.post('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.userId, readAt: null }, data: { readAt: new Date() } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

notificationRouter.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.deleteMany({ where: { id: req.params.id, userId: req.userId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

notificationRouter.delete('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.deleteMany({ where: { userId: req.userId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

notificationRouter.post('/preferences', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const prefs = z.object({
      dmMessages: z.boolean().optional(),
      mentions: z.boolean().optional(),
      serverMessages: z.boolean().optional(),
      friendRequests: z.boolean().optional(),
      calls: z.boolean().optional(),
      desktop: z.boolean().optional(),
      sounds: z.boolean().optional(),
    }).parse(req.body);
    await prisma.user.update({
      where: { id: req.userId },
      data: { notificationPrefs: prefs },
    });
    res.json({ success: true, preferences: prefs });
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});
