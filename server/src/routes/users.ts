import { Prisma, UserStatus } from '@prisma/client';
import { Router, Response } from 'express';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';

export const userRouter = Router();

const publicUserSelect = {
  id: true,
  username: true,
  discriminator: true,
  avatar: true,
  bio: true,
  status: true,
  customStatus: true,
  createdAt: true,
} as const;

/** Stable pseudo-random score so a seed always produces the same shuffle. */
const hash = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
};

const parseString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

// GET /api/users/discover?q=&seed=&limit=&online=true
userRouter.get('/discover', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const rawQuery = parseString(req.query.q).replace(/^@/, '').slice(0, 64);
    const seed = parseString(req.query.seed).slice(0, 64) || 'bluechat';
    const onlineOnly = parseString(req.query.online) === 'true';
    const parsedLimit = Number.parseInt(parseString(req.query.limit), 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 48) : 18;

    const hashIndex = rawQuery.indexOf('#');
    const usernamePart = (hashIndex >= 0 ? rawQuery.slice(0, hashIndex) : rawQuery).trim();
    const tagPart = (hashIndex >= 0 ? rawQuery.slice(hashIndex + 1) : '').trim();
    const searchable = Boolean(usernamePart || tagPart);

    const [myMemberships, requests, blocks] = await Promise.all([
      prisma.serverMember.findMany({
        where: { userId: req.userId },
        select: { serverId: true },
      }),
      prisma.friendRequest.findMany({
        where: {
          OR: [{ senderId: req.userId }, { receiverId: req.userId }],
        },
        select: { senderId: true, receiverId: true },
      }),
      prisma.block.findMany({
        where: {
          OR: [{ blockerId: req.userId }, { blockedId: req.userId }],
        },
        select: { blockerId: true, blockedId: true },
      }),
    ]);

    const excluded = new Set<string>([req.userId!]);
    for (const request of requests) {
      excluded.add(request.senderId);
      excluded.add(request.receiverId);
    }
    for (const block of blocks) {
      excluded.add(block.blockerId);
      excluded.add(block.blockedId);
    }

    const searchClauses: Prisma.UserWhereInput[] = [];
    if (usernamePart) {
      searchClauses.push({ username: { contains: usernamePart, mode: 'insensitive' } });
    }
    if (tagPart) {
      searchClauses.push({ discriminator: { contains: tagPart, mode: 'insensitive' } });
      if (!usernamePart) {
        searchClauses.push({ username: { contains: tagPart, mode: 'insensitive' } });
      }
    }
    if (searchable) {
      searchClauses.push({ bio: { contains: rawQuery, mode: 'insensitive' } });
      searchClauses.push({ customStatus: { contains: rawQuery, mode: 'insensitive' } });
    }

    const where: Prisma.UserWhereInput = {
      id: { notIn: [...excluded] },
      ...(onlineOnly ? { status: { in: [UserStatus.ONLINE, UserStatus.IDLE] } } : {}),
      ...(searchClauses.length ? { OR: searchClauses } : {}),
    };

    const candidates = await prisma.user.findMany({
      where,
      select: publicUserSelect,
      take: 250,
    });

    const candidateIds = candidates.map((candidate) => candidate.id);
    const serverIds = myMemberships.map((membership) => membership.serverId);
    const mutualRows = candidateIds.length && serverIds.length
      ? await prisma.serverMember.findMany({
          where: { userId: { in: candidateIds }, serverId: { in: serverIds } },
          select: { userId: true },
        })
      : [];
    const mutualCounts = new Map<string, number>();
    for (const row of mutualRows) {
      mutualCounts.set(row.userId, (mutualCounts.get(row.userId) || 0) + 1);
    }

    const relevance = (username: string) => {
      if (!usernamePart) return 0;
      const name = username.toLowerCase();
      const needle = usernamePart.toLowerCase();
      if (name === needle) return 0;
      if (name.startsWith(needle)) return 1;
      if (name.includes(needle)) return 2;
      return 4;
    };
    const presenceRank = (status: UserStatus) => {
      if (status === UserStatus.ONLINE) return 0;
      if (status === UserStatus.IDLE) return 1;
      if (status === UserStatus.DND) return 2;
      return 3;
    };

    const sorted = [...candidates].sort((a, b) => {
      const relevanceDiff = relevance(a.username) - relevance(b.username);
      if (relevanceDiff) return relevanceDiff;
      // In browse mode, surface people who are actually around right now.
      if (!searchable) {
        const presenceDiff = presenceRank(a.status) - presenceRank(b.status);
        if (presenceDiff) return presenceDiff;
      }
      return hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`);
    });

    const users = sorted.slice(0, limit).map((user) => ({
      ...user,
      status: String(user.status).toLowerCase(),
      mutualServers: mutualCounts.get(user.id) || 0,
    }));

    res.json({ users, total: candidates.length, seed, query: rawQuery });
  } catch (error) {
    console.error('Discover users error:', error);
    res.status(500).json({ error: 'Failed to discover users' });
  }
});
