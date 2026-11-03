import { Router, Response } from 'express';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';

export const messageRouter = Router();

// PATCH /api/messages/:id - Edit message
messageRouter.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { content } = req.body;

    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.authorId !== req.userId) return res.status(403).json({ error: 'Not authorized' });

    // Save edit history
    await prisma.messageEdit.create({
      data: { messageId: req.params.id, content: message.content },
    });

    const updated = await prisma.message.update({
      where: { id: req.params.id },
      data: { content },
      include: {
        author: { select: { id: true, username: true, discriminator: true, avatar: true, status: true } },
      },
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(message.channelId).emit('message:edit', {
      channelId: message.channelId,
      messageId: req.params.id,
      content,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// DELETE /api/messages/:id - Delete message
messageRouter.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    // Soft delete
    await prisma.message.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    // Emit socket event
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
messageRouter.post('/:id/reactions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { emoji } = req.body;

    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    // Check if reaction exists
    const existing = await prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId: req.params.id, userId: req.userId!, emoji } },
    });

    if (existing) {
      // Remove reaction
      await prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      // Add reaction
      await prisma.reaction.create({
        data: { messageId: req.params.id, userId: req.userId!, emoji },
      });
    }

    // Emit socket event
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
    res.status(500).json({ error: 'Failed to toggle reaction' });
  }
});

// DELETE /api/messages/:id/reactions/:emoji
messageRouter.delete('/:id/reactions/:emoji', authenticate, async (req: AuthRequest, res: Response) => {
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
messageRouter.post('/:id/pin', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const message = await prisma.message.update({
      where: { id: req.params.id },
      data: { isPinned: true },
    });

    const io = req.app.get('io');
    io.to(message.channelId).emit('message:pin', {
      channelId: message.channelId,
      messageId: req.params.id,
    });

    res.json(message);
  } catch (error) {
    res.status(500).json({ error: 'Failed to pin message' });
  }
});
