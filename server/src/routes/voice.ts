import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authenticate, AuthRequest, prisma } from '../middleware/auth.js';
import { canViewChannel, hasChannelPermission } from '../middleware/authz.js';
import { config } from '../config.js';

export const voiceRouter = Router();

// Returns a short-lived LiveKit access token. Media packets never pass through
// the BlueChat API server; the client connects directly to the configured SFU.
voiceRouter.post('/token', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { channelId, publish = true } = z.object({
      channelId: z.string().min(1).max(64),
      publish: z.boolean().default(true),
    }).parse(req.body);

    if (!config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
      return res.status(503).json({ error: 'LiveKit is not configured on this deployment' });
    }

    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, type: true, serverId: true },
    });
    if (!channel || !['VOICE', 'STAGE'].includes(channel.type)) {
      return res.status(404).json({ error: 'Voice channel not found' });
    }
    if (!(await canViewChannel(req.userId!, channelId))) return res.status(403).json({ error: 'Channel access denied' });
    if (!(await hasChannelPermission(req.userId!, channelId, 'connect'))) return res.status(403).json({ error: 'Connect permission required' });
    if (publish && !(await hasChannelPermission(req.userId!, channelId, 'speak'))) return res.status(403).json({ error: 'Speak permission required' });

    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { username: true } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign({
      iss: config.livekit.apiKey,
      sub: req.userId!,
      name: user.username,
      nbf: now - 5,
      exp: now + 10 * 60,
      video: {
        roomJoin: true,
        room: `bluechat-${channel.id}`,
        canPublish: publish,
        canSubscribe: true,
        canPublishData: true,
      },
    }, config.livekit.apiSecret, { algorithm: 'HS256' });

    return res.json({ token, serverUrl: config.livekit.url, roomName: `bluechat-${channel.id}`, expiresIn: 600 });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
    return res.status(500).json({ error: 'Failed to create voice token' });
  }
});
