import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';

export const friendRouter = Router();

// GET /api/friends
friendRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sentRequests = await prisma.friendRequest.findMany({
      where: { senderId: req.userId },
      include: {
        receiver: {
          select: { id: true, username: true, discriminator: true, avatar: true, status: true, customStatus: true },
        },
      },
    });

    const receivedRequests = await prisma.friendRequest.findMany({
      where: { receiverId: req.userId, status: 'PENDING' },
      include: {
        sender: {
          select: { id: true, username: true, discriminator: true, avatar: true, status: true, customStatus: true },
        },
      },
    });

    const acceptedFriends = await prisma.friendRequest.findMany({
      where: {
        OR: [
          { senderId: req.userId, status: 'ACCEPTED' },
          { receiverId: req.userId, status: 'ACCEPTED' },
        ],
      },
      include: {
        sender: { select: { id: true, username: true, discriminator: true, avatar: true, status: true, customStatus: true } },
        receiver: { select: { id: true, username: true, discriminator: true, avatar: true, status: true, customStatus: true } },
      },
    });

    const blocks = await prisma.block.findMany({
      where: { blockerId: req.userId },
      include: {
        blocked: { select: { id: true, username: true, discriminator: true, avatar: true, status: true } },
      },
    });

    res.json({ sentRequests, receivedRequests, acceptedFriends, blocks });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

// POST /api/friends/request
friendRouter.post('/request', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { username } = z.object({ username: z.string() }).parse(req.body);

    const targetUser = await prisma.user.findUnique({ where: { username } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.id === req.userId) return res.status(400).json({ error: "You can't friend yourself" });

    // Check if already friends
    const existing = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: req.userId, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: req.userId },
        ],
      },
    });

    if (existing) return res.status(400).json({ error: 'Friend request already exists' });

    // Check if blocked
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: targetUser.id, blockedId: req.userId },
          { blockerId: req.userId, blockedId: targetUser.id },
        ],
      },
    });

    if (blocked) return res.status(403).json({ error: 'Cannot send friend request' });

    const request = await prisma.friendRequest.create({
      data: { senderId: req.userId!, receiverId: targetUser.id },
    });

    res.status(201).json(request);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// POST /api/friends/:id/accept
friendRouter.post('/:id/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.friendRequest.updateMany({
      where: { id: req.params.id, receiverId: req.userId, status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

// POST /api/friends/:id/decline
friendRouter.post('/:id/decline', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.friendRequest.deleteMany({
      where: { id: req.params.id, receiverId: req.userId },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to decline request' });
  }
});

// POST /api/friends/:id/block
friendRouter.post('/:id/block', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.block.create({
      data: { blockerId: req.userId!, blockedId: req.params.id },
    });
    // Remove any existing friend request
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: req.userId, receiverId: req.params.id },
          { senderId: req.params.id, receiverId: req.userId },
        ],
      },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to block user' });
  }
});
