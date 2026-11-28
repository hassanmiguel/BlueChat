import { Router, Response } from 'express';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../middleware/auth.js';
import { hasChannelPermission } from '../middleware/authz.js';

export const webhookRouter = Router();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

const webhookLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Webhook rate limit exceeded' },
});

const equalHash = (provided: string, stored: string) => {
  const left = Buffer.from(hash(provided), 'hex');
  const right = Buffer.from(stored, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};

// External services post messages using a one-time-issued token + secret.
// No browser session or CSRF cookie is required; both credentials are checked.
webhookRouter.post('/:webhookId/messages', webhookLimiter, async (req, res: Response) => {
  let deliveryId: string | undefined;
  try {
    const authorization = req.header('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const secret = req.header('x-bluechat-secret') || '';
    if (!token || !secret || token.length > 256 || secret.length > 256) {
      return res.status(401).json({ error: 'Webhook credentials required' });
    }

    const hook = await prisma.platformWebhook.findUnique({ where: { id: req.params.webhookId } });
    if (!hook || !hook.enabled || !equalHash(token, hook.tokenHash) || !equalHash(secret, hook.secretHash)) {
      return res.status(401).json({ error: 'Invalid webhook credentials' });
    }

    const input = z.object({
      content: z.string().trim().min(1).max(4000),
      username: z.string().trim().min(1).max(80).optional(),
    }).strict().parse(req.body);
    if (!(await hasChannelPermission(hook.creatorId, hook.channelId, 'send_messages'))) {
      return res.status(403).json({ error: 'Webhook creator no longer has permission to post in this channel' });
    }

    const eventId = (req.header('idempotency-key') || randomUUID()).slice(0, 100);
    const previous = await prisma.webhookDelivery.findUnique({
      where: { webhookId_eventId: { webhookId: hook.id, eventId } },
    });
    if (previous) return res.status(200).json({ success: previous.status === 'SENT', duplicate: true, deliveryId: previous.id });

    const delivery = await prisma.webhookDelivery.create({
      data: { webhookId: hook.id, eventId, payload: input as any, status: 'PROCESSING' },
    });
    deliveryId = delivery.id;

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { channelId: hook.channelId, authorId: hook.creatorId, content: input.content },
        include: { author: { select: { id: true, username: true, discriminator: true, avatar: true, status: true } }, attachments: true, reactions: true },
      });
      await tx.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENT', responseCode: 201, attemptCount: 1 },
      });
      return created;
    });

    const io = req.app.get('io');
    io?.to(hook.channelId).emit('message:new', { channelId: hook.channelId, message, webhook: { name: input.username || hook.name } });
    return res.status(201).json({ success: true, messageId: message.id, deliveryId: delivery.id });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message || 'Invalid payload' });
    if (deliveryId) {
      await prisma.webhookDelivery.updateMany({
        where: { id: deliveryId, status: 'PROCESSING' },
        data: { status: 'FAILED', attemptCount: 1, lastError: 'Message creation failed' },
      });
    }
    return res.status(500).json({ error: 'Webhook delivery failed' });
  }
});
