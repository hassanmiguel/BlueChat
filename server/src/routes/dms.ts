import { Router, Response } from 'express';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';

export const dmRouter = Router();

// GET /api/dms
dmRouter.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const dms = await prisma.directMessage.findMany({
      where: { participants: { some: { userId: req.userId } } },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true, username: true, discriminator: true,
                avatar: true, status: true, customStatus: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(dms);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get DMs' });
  }
});

// POST /api/dms
dmRouter.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userIds, isGroup, name } = req.body;
    const allUserIds = [req.userId!, ...userIds];

    // Check for existing DM
    if (!isGroup && userIds.length === 1) {
      const existing = await prisma.directMessage.findFirst({
        where: {
          isGroup: false,
          participants: { every: { userId: { in: allUserIds } } },
        },
      });
      if (existing) return res.json(existing);
    }

    const dm = await prisma.directMessage.create({
      data: {
        isGroup: isGroup || false,
        name,
        participants: {
          create: allUserIds.map(userId => ({ userId })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true, username: true, discriminator: true,
                avatar: true, status: true, customStatus: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json(dm);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create DM' });
  }
});
