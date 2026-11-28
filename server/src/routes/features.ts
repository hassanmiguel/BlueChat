import { Router, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma, authenticate, AuthRequest } from '../middleware/auth.js';
import { canViewChannel, hasChannelPermission, hasServerPermission, isServerMember } from '../middleware/authz.js';

export const featureRouter = Router();

const sendValidationError = (error: unknown, res: Response) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
    return true;
  }
  return false;
};

const canManageChannel = async (userId: string, channelId: string) => {
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
  if (!channel) return null;
  const allowed = await hasChannelPermission(userId, channelId, 'manage_messages');
  return allowed ? channel : null;
};

// Polls are attached to an existing channel message so the regular message
// timeline remains the single source of truth for ordering and permissions.
featureRouter.post('/channels/:channelId/polls', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const input = z.object({
      messageId: z.string().min(1).max(64),
      question: z.string().trim().min(1).max(300),
      options: z.array(z.string().trim().min(1).max(100)).min(2).max(10),
      multipleChoice: z.boolean().default(false),
      anonymous: z.boolean().default(false),
      expiresAt: z.string().datetime().optional(),
    }).parse(req.body);
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId }, select: { id: true, serverId: true } });
    if (!channel || !(await canViewChannel(req.userId!, req.params.channelId))) return res.status(404).json({ error: 'Channel not found' });
    if (!(await hasChannelPermission(req.userId!, req.params.channelId, 'send_messages'))) return res.status(403).json({ error: 'Cannot create polls in this channel' });
    if (new Set(input.options.map((v) => v.toLocaleLowerCase())).size !== input.options.length) return res.status(400).json({ error: 'Poll options must be unique' });
    const message = await prisma.message.findFirst({ where: { id: input.messageId, channelId: channel.id, authorId: req.userId!, deletedAt: null } });
    if (!message) return res.status(404).json({ error: 'Poll message not found or not owned by you' });
    const poll = await prisma.poll.create({
      data: {
        messageId: message.id, channelId: channel.id, createdById: req.userId!,
        question: input.question, multipleChoice: input.multipleChoice, anonymous: input.anonymous,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        options: { create: input.options.map((label, position) => ({ label, position })) },
      },
      include: { options: true },
    });
    req.app.get('io')?.to(channel.id).emit('poll:create', poll);
    return res.status(201).json(poll);
  } catch (error) {
    if (sendValidationError(error, res)) return;
    return res.status(500).json({ error: 'Failed to create poll' });
  }
});

featureRouter.get('/channels/:channelId/polls', authenticate, async (req: AuthRequest, res: Response) => {
  const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId }, select: { serverId: true } });
  if (!channel || !(await canViewChannel(req.userId!, req.params.channelId))) return res.status(404).json({ error: 'Channel not found' });
  const polls = await prisma.poll.findMany({
    where: { channelId: req.params.channelId },
    include: { options: { include: { votes: { select: { userId: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(polls.map((poll) => ({
    ...poll,
    options: poll.options.map(({ votes, ...option }) => ({
      ...option,
      voteCount: votes.length,
      votedByMe: votes.some((vote) => vote.userId === req.userId),
      voters: poll.anonymous ? undefined : votes.map((vote) => vote.userId),
    })),
  })));
});

featureRouter.post('/polls/:pollId/votes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { optionIds } = z.object({ optionIds: z.array(z.string().min(1)).min(1).max(10) }).parse(req.body);
    if (new Set(optionIds).size !== optionIds.length) return res.status(400).json({ error: 'Duplicate poll options' });
    const poll = await prisma.poll.findUnique({ where: { id: req.params.pollId }, include: { options: true } });
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    const pollChannel = await prisma.channel.findUnique({ where: { id: poll.channelId }, select: { serverId: true } });
    if (!pollChannel || !(await canViewChannel(req.userId!, poll.channelId))) return res.status(403).json({ error: 'Not a channel member' });
    if (poll.closedAt || (poll.expiresAt && poll.expiresAt <= new Date())) return res.status(400).json({ error: 'Poll is closed' });
    if (!poll.multipleChoice && optionIds.length !== 1) return res.status(400).json({ error: 'Choose exactly one option' });
    if (optionIds.some((id) => !poll.options.some((option) => option.id === id))) return res.status(400).json({ error: 'Invalid poll option' });
    await prisma.$transaction(async (tx) => {
      if (!poll.multipleChoice) {
        await tx.pollVote.deleteMany({ where: { userId: req.userId!, option: { pollId: poll.id } } });
      }
      for (const optionId of optionIds) {
        await tx.pollVote.upsert({
          where: { optionId_userId: { optionId, userId: req.userId! } },
          update: {},
          create: { optionId, userId: req.userId! },
        });
      }
    });
    req.app.get('io')?.to(poll.channelId).emit('poll:vote', { pollId: poll.id });
    return res.json({ success: true });
  } catch (error) {
    if (sendValidationError(error, res)) return;
    return res.status(500).json({ error: 'Failed to record poll vote' });
  }
});

featureRouter.post('/polls/:pollId/close', authenticate, async (req: AuthRequest, res: Response) => {
  const poll = await prisma.poll.findUnique({ where: { id: req.params.pollId } });
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  if (poll.createdById !== req.userId && !(await canManageChannel(req.userId!, poll.channelId))) return res.status(403).json({ error: 'Not allowed to close this poll' });
  const updated = await prisma.poll.update({ where: { id: poll.id }, data: { closedAt: new Date() } });
  req.app.get('io')?.to(poll.channelId).emit('poll:closed', { pollId: poll.id, closedAt: updated.closedAt });
  return res.json(updated);
});

// Personal saved-message collection.
featureRouter.get('/saved-messages', authenticate, async (req: AuthRequest, res: Response) => {
  const items = await prisma.savedMessage.findMany({
    where: { userId: req.userId! }, orderBy: { createdAt: 'desc' }, take: 100,
  });
  const visible = await Promise.all(items.map(async (item) => {
    const message = await prisma.message.findFirst({
      where: { id: item.messageId, deletedAt: null },
      include: { author: { select: { id: true, username: true, avatar: true } }, channel: { select: { id: true, name: true, serverId: true } } },
    });
    if (!message || !(await isServerMember(req.userId!, message.channel.serverId))) return null;
    return { ...item, message };
  }));
  return res.json(visible.filter(Boolean));
});

featureRouter.post('/messages/:messageId/save', authenticate, async (req: AuthRequest, res: Response) => {
  const message = await prisma.message.findFirst({ where: { id: req.params.messageId, deletedAt: null }, include: { channel: { select: { serverId: true } } } });
  if (!message || !(await canViewChannel(req.userId!, message.channelId))) return res.status(404).json({ error: 'Message not found' });
  const saved = await prisma.savedMessage.upsert({
    where: { userId_messageId: { userId: req.userId!, messageId: message.id } },
    update: {}, create: { userId: req.userId!, messageId: message.id },
  });
  return res.status(201).json(saved);
});

featureRouter.delete('/messages/:messageId/save', authenticate, async (req: AuthRequest, res: Response) => {
  await prisma.savedMessage.deleteMany({ where: { userId: req.userId!, messageId: req.params.messageId } });
  return res.json({ success: true });
});

// Read cursors are per-user and per-channel; clients can sync them after reconnect.
featureRouter.put('/channels/:channelId/read-state', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = z.object({ messageId: z.string().max(64).optional() }).parse(req.body);
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId }, select: { serverId: true } });
    if (!channel || !(await isServerMember(req.userId!, channel.serverId))) return res.status(404).json({ error: 'Channel not found' });
    if (messageId && !(await prisma.message.findFirst({ where: { id: messageId, channelId: req.params.channelId } }))) return res.status(400).json({ error: 'Message does not belong to this channel' });
    const receipt = await prisma.readReceipt.upsert({
      where: { userId_channelId: { userId: req.userId!, channelId: req.params.channelId } },
      update: { lastReadMessageId: messageId, lastReadAt: new Date() },
      create: { userId: req.userId!, channelId: req.params.channelId, lastReadMessageId: messageId },
    });
    return res.json(receipt);
  } catch (error) {
    if (sendValidationError(error, res)) return;
    return res.status(500).json({ error: 'Failed to update read state' });
  }
});

featureRouter.get('/channels/:channelId/read-state', authenticate, async (req: AuthRequest, res: Response) => {
  const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId }, select: { serverId: true } });
  if (!channel || !(await isServerMember(req.userId!, channel.serverId))) return res.status(404).json({ error: 'Channel not found' });
  const receipt = await prisma.readReceipt.findUnique({ where: { userId_channelId: { userId: req.userId!, channelId: req.params.channelId } } });
  return res.json(receipt);
});

// Scheduled messages are dispatched by the server-side worker started in index.ts.
featureRouter.post('/channels/:channelId/scheduled-messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const input = z.object({
      content: z.string().trim().min(1).max(4000),
      scheduledAt: z.string().datetime(),
    }).parse(req.body);
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId }, select: { serverId: true } });
    if (!channel || !(await canViewChannel(req.userId!, req.params.channelId))) return res.status(404).json({ error: 'Channel not found' });
    if (!(await hasChannelPermission(req.userId!, req.params.channelId, 'send_messages'))) return res.status(403).json({ error: 'Cannot schedule messages in this channel' });
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() < Date.now() + 60_000 || scheduledAt.getTime() > Date.now() + 90 * 24 * 60 * 60_000) return res.status(400).json({ error: 'Schedule must be between 1 minute and 90 days from now' });
    const item = await prisma.scheduledMessage.create({ data: { channelId: req.params.channelId, authorId: req.userId!, content: input.content, scheduledAt } });
    return res.status(201).json(item);
  } catch (error) {
    if (sendValidationError(error, res)) return;
    return res.status(500).json({ error: 'Failed to schedule message' });
  }
});

featureRouter.get('/scheduled-messages', authenticate, async (req: AuthRequest, res: Response) => {
  const items = await prisma.scheduledMessage.findMany({
    where: { authorId: req.userId!, sentAt: null, cancelledAt: null },
    orderBy: { scheduledAt: 'asc' }, take: 100,
  });
  return res.json(items);
});

featureRouter.delete('/scheduled-messages/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const result = await prisma.scheduledMessage.updateMany({
    where: { id: req.params.id, authorId: req.userId!, sentAt: null, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
  return res.json({ success: result.count === 1 });
});

// Server events and RSVP management.
featureRouter.post('/servers/:serverId/events', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const input = z.object({
      title: z.string().trim().min(1).max(120),
      description: z.string().max(4000).optional(),
      channelId: z.string().max(64).optional(),
      location: z.string().max(300).optional(),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime().optional(),
    }).parse(req.body);
    if (!(await isServerMember(req.userId!, req.params.serverId))) return res.status(404).json({ error: 'Server not found' });
    if (!(await hasServerPermission(req.userId!, req.params.serverId, 'manage_events'))) return res.status(403).json({ error: 'Manage Events permission required' });
    if (input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) return res.status(400).json({ error: 'Event end must be after its start' });
    if (input.channelId) {
      const channel = await prisma.channel.findFirst({ where: { id: input.channelId, serverId: req.params.serverId } });
      if (!channel) return res.status(400).json({ error: 'Event channel must belong to this server' });
    }
    const event = await prisma.serverEvent.create({ data: { ...input, startsAt: new Date(input.startsAt), endsAt: input.endsAt ? new Date(input.endsAt) : null, serverId: req.params.serverId, creatorId: req.userId! } });
    return res.status(201).json(event);
  } catch (error) {
    if (sendValidationError(error, res)) return;
    return res.status(500).json({ error: 'Failed to create event' });
  }
});

featureRouter.get('/servers/:serverId/events', authenticate, async (req: AuthRequest, res: Response) => {
  if (!(await isServerMember(req.userId!, req.params.serverId))) return res.status(404).json({ error: 'Server not found' });
  const events = await prisma.serverEvent.findMany({
    where: { serverId: req.params.serverId, status: 'SCHEDULED' },
    include: { rsvps: { select: { userId: true, status: true } } },
    orderBy: { startsAt: 'asc' },
  });
  return res.json(events.map((event) => ({ ...event, myRsvp: event.rsvps.find((rsvp) => rsvp.userId === req.userId)?.status })));
});

featureRouter.put('/events/:eventId/rsvp', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = z.object({ status: z.enum(['GOING', 'INTERESTED', 'NOT_GOING']) }).parse(req.body);
    const event = await prisma.serverEvent.findUnique({ where: { id: req.params.eventId } });
    if (!event || !(await isServerMember(req.userId!, event.serverId))) return res.status(404).json({ error: 'Event not found' });
    const rsvp = await prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId: event.id, userId: req.userId! } },
      update: { status }, create: { eventId: event.id, userId: req.userId!, status },
    });
    return res.json(rsvp);
  } catch (error) {
    if (sendValidationError(error, res)) return;
    return res.status(500).json({ error: 'Failed to update RSVP' });
  }
});

featureRouter.delete('/events/:eventId', authenticate, async (req: AuthRequest, res: Response) => {
  const event = await prisma.serverEvent.findUnique({ where: { id: req.params.eventId } });
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (event.creatorId !== req.userId && !(await hasServerPermission(req.userId!, event.serverId, 'manage_events'))) return res.status(403).json({ error: 'Not allowed to delete this event' });
  await prisma.serverEvent.update({ where: { id: event.id }, data: { status: 'CANCELLED' } });
  return res.json({ success: true });
});


// Developer portal: application ownership and one-time bot-token issuance.
// Only token hashes are persisted; plaintext credentials are returned once.
const digestSecret = (value: string) => createHash('sha256').update(value).digest('hex');
const botScopes = ['read_messages', 'send_messages', 'manage_messages', 'read_members', 'manage_webhooks'] as const;

featureRouter.get('/developer/applications', authenticate, async (req: AuthRequest, res: Response) => {
  const apps = await prisma.botApplication.findMany({
    where: { ownerId: req.userId! },
    include: { tokens: { select: { id: true, tokenPrefix: true, scopes: true, expiresAt: true, revokedAt: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(apps);
});

featureRouter.post('/developer/applications', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const input = z.object({
      name: z.string().trim().min(2).max(64),
      description: z.string().max(1000).optional(),
      isPublic: z.boolean().default(false),
    }).parse(req.body);
    const count = await prisma.botApplication.count({ where: { ownerId: req.userId! } });
    if (count >= 20) return res.status(429).json({ error: 'Application limit reached' });
    const app = await prisma.botApplication.create({ data: { ...input, ownerId: req.userId! } });
    return res.status(201).json(app);
  } catch (error) {
    if (sendValidationError(error, res)) return;
    return res.status(500).json({ error: 'Failed to create application' });
  }
});

featureRouter.post('/developer/applications/:applicationId/tokens', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { scopes, expiresAt } = z.object({
      scopes: z.array(z.enum(botScopes)).min(1).max(botScopes.length),
      expiresAt: z.string().datetime().optional(),
    }).parse(req.body);
    const app = await prisma.botApplication.findFirst({ where: { id: req.params.applicationId, ownerId: req.userId! } });
    if (!app) return res.status(404).json({ error: 'Application not found' });
    const activeTokens = await prisma.botToken.count({ where: { applicationId: app.id, revokedAt: null } });
    if (activeTokens >= 10) return res.status(429).json({ error: 'Active token limit reached' });
    const token = `bc_bot_${randomBytes(32).toString('base64url')}`;
    const record = await prisma.botToken.create({
      data: {
        applicationId: app.id, tokenHash: digestSecret(token),
        tokenPrefix: token.slice(0, 14), scopes,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    return res.status(201).json({ id: record.id, token, scopes: record.scopes, expiresAt: record.expiresAt, warning: 'Copy this token now. It cannot be retrieved again.' });
  } catch (error) {
    if (sendValidationError(error, res)) return;
    return res.status(500).json({ error: 'Failed to issue bot token' });
  }
});

featureRouter.delete('/developer/applications/:applicationId/tokens/:tokenId', authenticate, async (req: AuthRequest, res: Response) => {
  const token = await prisma.botToken.findFirst({
    where: { id: req.params.tokenId, application: { id: req.params.applicationId, ownerId: req.userId! } },
  });
  if (!token) return res.status(404).json({ error: 'Token not found' });
  await prisma.botToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } });
  return res.json({ success: true });
});

// Webhook secrets are generated server-side and stored only as hashes.
// Delivery workers must enforce outbound URL allowlists/SSRF protection before
// any remote delivery is enabled; this endpoint only manages channel hooks.
featureRouter.get('/servers/:serverId/webhooks', authenticate, async (req: AuthRequest, res: Response) => {
  if (!(await isServerMember(req.userId!, req.params.serverId))) return res.status(404).json({ error: 'Server not found' });
  if (!(await hasServerPermission(req.userId!, req.params.serverId, 'manage_webhooks'))) return res.status(403).json({ error: 'Manage Webhooks permission required' });
  const hooks = await prisma.platformWebhook.findMany({
    where: { serverId: req.params.serverId },
    select: { id: true, channelId: true, creatorId: true, name: true, enabled: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(hooks);
});

featureRouter.post('/servers/:serverId/webhooks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { channelId, name } = z.object({
      channelId: z.string().min(1).max(64),
      name: z.string().trim().min(1).max(80),
    }).parse(req.body);
    if (!(await isServerMember(req.userId!, req.params.serverId))) return res.status(404).json({ error: 'Server not found' });
    if (!(await hasServerPermission(req.userId!, req.params.serverId, 'manage_webhooks'))) return res.status(403).json({ error: 'Manage Webhooks permission required' });
    const channel = await prisma.channel.findFirst({ where: { id: channelId, serverId: req.params.serverId } });
    if (!channel) return res.status(400).json({ error: 'Channel does not belong to this server' });
    const token = randomBytes(32).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    const hook = await prisma.platformWebhook.create({
      data: { serverId: req.params.serverId, channelId, creatorId: req.userId!, name, tokenHash: digestSecret(token), secretHash: digestSecret(secret) },
      select: { id: true, channelId: true, name: true, enabled: true, createdAt: true },
    });
    return res.status(201).json({ ...hook, token, secret, warning: 'Copy these credentials now. They cannot be retrieved again.' });
  } catch (error) {
    if (sendValidationError(error, res)) return;
    return res.status(500).json({ error: 'Failed to create webhook' });
  }
});

featureRouter.delete('/servers/:serverId/webhooks/:webhookId', authenticate, async (req: AuthRequest, res: Response) => {
  if (!(await hasServerPermission(req.userId!, req.params.serverId, 'manage_webhooks'))) return res.status(403).json({ error: 'Manage Webhooks permission required' });
  const result = await prisma.platformWebhook.deleteMany({ where: { id: req.params.webhookId, serverId: req.params.serverId } });
  return res.json({ success: result.count === 1 });
});

// AI is disabled by default. This stores feature consent/configuration only;
// provider credentials belong in deployment secrets, never in this table.
featureRouter.get('/servers/:serverId/ai-settings', authenticate, async (req: AuthRequest, res: Response) => {
  if (!(await isServerMember(req.userId!, req.params.serverId))) return res.status(404).json({ error: 'Server not found' });
  const settings = await prisma.serverAiSettings.findUnique({ where: { serverId: req.params.serverId } });
  return res.json(settings || { serverId: req.params.serverId, enabled: false, allowSummary: false, allowSearch: false, allowTranscription: false, retentionDays: 0 });
});

featureRouter.put('/servers/:serverId/ai-settings', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await hasServerPermission(req.userId!, req.params.serverId, 'manage_server'))) return res.status(403).json({ error: 'Manage Server permission required' });
    const input = z.object({
      enabled: z.boolean(),
      provider: z.string().trim().max(40).optional().nullable(),
      model: z.string().trim().max(100).optional().nullable(),
      allowSummary: z.boolean(),
      allowSearch: z.boolean(),
      allowTranscription: z.boolean(),
      retentionDays: z.number().int().min(0).max(365),
    }).parse(req.body);
    if (!input.enabled && (input.allowSummary || input.allowSearch || input.allowTranscription)) return res.status(400).json({ error: 'AI capabilities must be disabled when AI is disabled' });
    const settings = await prisma.serverAiSettings.upsert({
      where: { serverId: req.params.serverId },
      update: input,
      create: { serverId: req.params.serverId, ...input },
    });
    return res.json(settings);
  } catch (error) {
    if (sendValidationError(error, res)) return;
    return res.status(500).json({ error: 'Failed to update AI settings' });
  }
});

// Entitlements are read-only until a billing provider, verified webhook handler,
// and idempotent reconciliation worker are configured. No client can self-grant.
featureRouter.get('/subscriptions', authenticate, async (req: AuthRequest, res: Response) => {
  const subscriptions = await prisma.platformSubscription.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(subscriptions);
});
