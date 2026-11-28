import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';
import {
  hasServerPermission,
  hasChannelPermission,
  requireMessageAccess,
  requireMessageAuthorOrManager,
} from '../middleware/authz.js';

export const messageRouter = Router();

const zodError = (error: unknown, res: Response) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
  }
  return null;
};

// PATCH /api/messages/:id
messageRouter.patch('/:id', authenticate, requireMessageAuthorOrManager, async (req: AuthRequest, res: Response) => {
  try {
    const { content } = z.object({ content: z.string().trim().min(1).max(4000) }).parse(req.body);
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    await prisma.messageEdit.create({
      data: { messageId: req.params.id, content: message.content },
    });

    const updated = await prisma.message.update({
      where: { id: req.params.id },
      data: { content },
      include: {
        author: {
          select: { id: true, username: true, discriminator: true, avatar: true, status: true },
        },
      },
    });

    const io = req.app.get('io');
    io.to(message.channelId).emit('message:edit', {
      channelId: message.channelId,
      messageId: req.params.id,
      content,
    });

    res.json(updated);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// DELETE /api/messages/:id
messageRouter.delete('/:id', authenticate, requireMessageAuthorOrManager, async (req: AuthRequest, res: Response) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    await prisma.message.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    const io = req.app.get('io');
    io.to(message.channelId).emit('message:delete', {
      channelId: message.channelId,
      messageId: req.params.id,
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// POST /api/messages/:id/reactions
messageRouter.post('/:id/reactions', authenticate, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const { emoji } = z.object({
      emoji: z.string().trim().min(1).max(64).regex(/^[\p{Emoji}\p{Emoji_Component}\u200D\uFE0F]+$/u, 'Invalid emoji'),
    }).parse(req.body);

    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const existing = await prisma.reaction.findUnique({
      where: {
        messageId_userId_emoji: { messageId: req.params.id, userId: req.userId!, emoji },
      },
    });

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.reaction.create({
        data: { messageId: req.params.id, userId: req.userId!, emoji },
      });
    }

    const io = req.app.get('io');
    io.to(message.channelId).emit('message:reaction', {
      channelId: message.channelId,
      messageId: req.params.id,
      userId: req.userId,
      emoji,
      action: existing ? 'remove' : 'add',
    });

    res.json({ success: true });
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to toggle reaction' });
  }
});

// DELETE /api/messages/:id/reactions/:emoji
messageRouter.delete('/:id/reactions/:emoji', authenticate, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.reaction.deleteMany({
      where: { messageId: req.params.id, userId: req.userId, emoji: req.params.emoji },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// POST /api/messages/:id/pin
messageRouter.post('/:id/pin', authenticate, requireMessageAccess, async (req: AuthRequest, res: Response) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
      select: { channelId: true, isPinned: true },
    });
    const channel = await prisma.channel.findUnique({
      where: { id: message!.channelId },
      select: { serverId: true },
    });
    if (!channel || !(await hasChannelPermission(req.userId!, message!.channelId, 'manage_messages'))) {
      return res.status(403).json({ error: 'Server owner or admin role required' });
    }

    const updated = await prisma.message.update({
      where: { id: req.params.id },
      data: { isPinned: !message?.isPinned },
    });

    const io = req.app.get('io');
    io.to(message!.channelId).emit('message:pin', {
      channelId: message!.channelId,
      messageId: req.params.id,
      isPinned: updated.isPinned,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to pin message' });
  }
});
