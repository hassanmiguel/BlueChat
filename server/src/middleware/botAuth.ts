import { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { prisma } from './auth.js';

export interface BotRequest extends Request {
  botApplicationId?: string;
  botScopes?: string[];
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export const authenticateBot = async (req: BotRequest, res: Response, next: NextFunction) => {
  try {
    const authorization = req.header('authorization') || '';
    const token = authorization.startsWith('Bot ') ? authorization.slice(4).trim() : '';
    if (!token || token.length > 256) return res.status(401).json({ error: 'Bot token required' });
    const record = await prisma.botToken.findUnique({
      where: { tokenHash: digest(token) },
      select: { applicationId: true, scopes: true, revokedAt: true, expiresAt: true },
    });
    if (!record || record.revokedAt || (record.expiresAt && record.expiresAt <= new Date())) {
      return res.status(401).json({ error: 'Invalid or expired bot token' });
    }
    req.botApplicationId = record.applicationId;
    req.botScopes = record.scopes;
    return next();
  } catch {
    return res.status(500).json({ error: 'Bot authentication failed' });
  }
};

export const requireBotScope = (scope: string) => (req: BotRequest, res: Response, next: NextFunction) => {
  if (!req.botScopes?.includes(scope)) return res.status(403).json({ error: `Bot scope required: ${scope}` });
  return next();
};
