import type { Server as SocketServer } from 'socket.io';
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';
import { emitToUser } from '../socket/index.js';
import { notifyUser } from '../utils/notifications.js';

export const friendRouter = Router();

const publicUserSelect = {
  id: true, username: true, discriminator: true,
  avatar: true, status: true, customStatus: true,
} as const;

const zodError = (error: unknown, res: Response) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
  }
  return null;
};

// GET /api/friends
friendRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const [sentRequests, receivedRequests, acceptedFriends, blocks] = await Promise.all([
      prisma.friendRequest.findMany({
        where: { senderId: req.userId },
        include: { receiver: { select: publicUserSelect } },
      }),
      prisma.friendRequest.findMany({
        where: { receiverId: req.userId, status: 'PENDING' },
        include: { sender: { select: publicUserSelect } },
      }),
      prisma.friendRequest.findMany({
        where: {
          OR: [
            { senderId: req.userId, status: 'ACCEPTED' },
            { receiverId: req.userId, status: 'ACCEPTED' },
          ],
        },
        include: {
          sender: { select: publicUserSelect },
          receiver: { select: publicUserSelect },
        },
      }),
      prisma.block.findMany({
        where: { blockerId: req.userId },
        include: { blocked: { select: publicUserSelect } },
      }),
    ]);

    res.json({ sentRequests, receivedRequests, acceptedFriends, blocks });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get friends' });
  }
});

// POST /api/friends/request
friendRouter.post('/request', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { username } = z.object({
      username: z.string().trim().min(2).max(32),
    }).parse(req.body);

    const [targetUser, sender] = await Promise.all([
      prisma.user.findUnique({ where: { username } }),
      prisma.user.findUnique({ where: { id: req.userId }, select: publicUserSelect }),
    ]);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.id === req.userId) return res.status(400).json({ error: "You can't friend yourself" });

    const existing = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: req.userId, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: req.userId },
        ],
      },
    });
    if (existing) return res.status(409).json({ error: 'Friend request already exists' });

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

    const io = req.app.get('io') as SocketServer | undefined;
    if (io) {
      emitToUser(io, targetUser.id, 'friend:request', {
        requestId: request.id,
        sender: sender || { id: req.userId, username: 'Someone' },
      });
    }
    await notifyUser(io, {
      userId: targetUser.id,
      type: 'friend_request',
      title: 'New friend request',
      body: `@${sender?.username || 'Someone'} wants to be friends.`,
      link: '/?view=friends',
      metadata: { actorId: req.userId },
    });

    res.status(201).json(request);
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// POST /api/friends/:id/accept
friendRouter.post('/:id/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const request = await prisma.friendRequest.findFirst({
      where: { id: req.params.id, receiverId: req.userId, status: 'PENDING' },
      include: {
        sender: { select: publicUserSelect },
        receiver: { select: publicUserSelect },
      },
    });
    if (!request) return res.status(404).json({ error: 'Friend request not found' });

    await prisma.friendRequest.update({
      where: { id: request.id },
      data: { status: 'ACCEPTED' },
    });

    const io = req.app.get('io') as SocketServer | undefined;
    if (io) {
      // Only the request sender needs the socket event. The accepting client
      // already updates its own UI and activity feed.
      emitToUser(io, request.senderId, 'friend:accepted', {
        requestId: request.id,
        user: request.receiver,
      });
    }
    await notifyUser(io, {
      userId: request.senderId,
      type: 'friend_accepted',
      title: 'Friend request accepted',
      body: `@${request.receiver.username} accepted your request.`,
      link: '/?view=friends',
      metadata: { actorId: req.userId },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

// POST /api/friends/:id/decline
friendRouter.post('/:id/decline', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.friendRequest.deleteMany({
      where: { id: req.params.id, receiverId: req.userId, status: 'PENDING' },
    });
    if (!result.count) return res.status(404).json({ error: 'Friend request not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to decline request' });
  }
});

// DELETE /api/friends/:id
friendRouter.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.friendRequest.deleteMany({
      where: {
        id: req.params.id,
        OR: [{ senderId: req.userId }, { receiverId: req.userId }],
      },
    });
    if (!result.count) return res.status(404).json({ error: 'Friendship not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// POST /api/friends/:id/block
friendRouter.post('/:id/block', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.userId) return res.status(400).json({ error: "You can't block yourself" });

    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: req.userId!, blockedId: target.id } },
      create: { blockerId: req.userId!, blockedId: target.id },
      update: {},
    });
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: req.userId, receiverId: target.id },
          { senderId: target.id, receiverId: req.userId },
        ],
      },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// POST /api/friends/:id/unblock
friendRouter.post('/:id/unblock', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.block.deleteMany({
      where: { blockerId: req.userId, blockedId: req.params.id },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});
