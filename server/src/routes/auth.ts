import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import {
  prisma,
  authenticate,
  AuthRequest,
  setAuthCookies,
  clearAuthCookies,
  getRefreshUserId,
  issueCsrfToken,
} from '../middleware/auth.js';
import { config, userPublicSelect } from '../config.js';
import { sendMail } from '../utils/email.js';

export const authRouter = Router();

const registerSchema = z.object({
  username: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_.]+$/, 'Username may only contain letters, numbers, dots and underscores'),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

const profileSchema = z.object({
  bio: z.string().max(2000).optional(),
  avatar: z.string().max(2048).optional(),
  banner: z.string().max(2048).optional(),
  customStatus: z.string().max(128).optional(),
  status: z.enum(['ONLINE', 'IDLE', 'DND', 'INVISIBLE']).optional(),
}).strict();

const zId = z.string().min(1).max(64);

const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

const createVerificationToken = async (userId: string, type: 'EMAIL_VERIFY' | 'PASSWORD_RESET') => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + (type === 'PASSWORD_RESET' ? 30 : 60) * 60 * 1000);
  await prisma.verificationToken.create({
    data: { userId, tokenHash: hashToken(token), type, expiresAt },
  });
  return token;
};

const zodError = (error: unknown, res: Response) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors[0]?.message || 'Invalid input' });
  }
  return null;
};

authRouter.get('/csrf', (_req, res) => {
  res.json({ csrfToken: issueCsrfToken(res) });
});

authRouter.post('/register', async (req: AuthRequest, res: Response) => {
  try {
    const { username, email, password } = registerSchema.parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    });
    if (existing) return res.status(409).json({ error: 'An account with this email or username already exists' });

    const user = await prisma.user.create({
      data: {
        username,
        discriminator: String(Math.floor(Math.random() * 9999)).padStart(4, '0'),
        email,
        password: await bcrypt.hash(password, 12),
      },
      select: userPublicSelect,
    });

    const token = await createVerificationToken(user.id, 'EMAIL_VERIFY');
    try {
      await sendMail({
        to: email,
        subject: 'Verify your blueChat email',
        template: 'verify-email',
        token,
        link: '/verify-email',
      });
    } catch (error) {
      console.error('Verification email error:', error);
    }

    setAuthCookies(res, user.id);
    res.status(201).json({ user, csrfToken: issueCsrfToken(res) });
  } catch (error) {
    if (zodError(error, res)) return;
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

authRouter.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date(), status: 'ONLINE' },
    });

    const { password: _password, ...publicUser } = user;
    setAuthCookies(res, user.id);
    res.json({ user: publicUser, csrfToken: issueCsrfToken(res) });
  } catch (error) {
    if (zodError(error, res)) return;
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookies(res);
  res.json({ success: true });
});

authRouter.post('/refresh', (req, res) => {
  const userId = getRefreshUserId(req);
  if (!userId) return res.status(401).json({ error: 'Invalid refresh token' });

  prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    .then((user) => {
      if (!user) return res.status(401).json({ error: 'Account no longer exists' });
      setAuthCookies(res, user.id);
      res.json({ csrfToken: issueCsrfToken(res) });
    })
    .catch(() => res.status(500).json({ error: 'Failed to refresh session' }));
});

authRouter.get('/me', authenticate, (req: AuthRequest, res) => {
  res.json(req.user);
});

authRouter.patch('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const updates = profileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updates,
      select: userPublicSelect,
    });
    res.json(user);
  } catch (error) {
    if (zodError(error, res)) return;
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

authRouter.post('/verify-email', async (req, res) => {
  try {
    const { token } = z.object({ token: zId }).parse(req.body);
    const record = await prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.type !== 'EMAIL_VERIFY' || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
      prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    res.json({ success: true });
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

authRouter.post('/resend-verification', authenticate, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { email: true, emailVerified: true },
  });
  if (!user || user.emailVerified) return res.status(400).json({ error: 'Email is already verified' });

  const token = await createVerificationToken(req.userId!, 'EMAIL_VERIFY');
  try {
    await sendMail({
      to: user.email,
      subject: 'Verify your blueChat email',
      template: 'verify-email',
      token,
      link: '/verify-email',
    });
  } catch (error) {
    console.error('Verification email error:', error);
  }
  res.json({ success: true });
});

authRouter.post('/password/forgot', async (req, res) => {
  try {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });

    if (user) {
      const token = await createVerificationToken(user.id, 'PASSWORD_RESET');
      try {
        await sendMail({
          to: user.email,
          subject: 'Reset your blueChat password',
          template: 'password-reset',
          token,
          link: '/reset-password',
        });
      } catch (error) {
        console.error('Password reset email error:', error);
      }
    }

    res.json({ message: 'If the account exists, a reset link has been sent.' });
  } catch (error) {
    if (zodError(error, res)) return;
    res.status(500).json({ error: 'Failed to request password reset' });
  }
});

authRouter.post('/password/reset', async (req, res) => {
  try {
    const { token, password } = z.object({ token: zId, password: z.string().min(8).max(128) }).parse(req.body);
    const record = await prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.type !== 'PASSWORD_RESET' || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { password: await bcrypt.hash(password, 12) },
      }),
      prisma.verificationToken.updateMany({
        where: { userId: record.userId, type: 'PASSWORD_RESET' },
        data: { usedAt: new Date() },
      }),
    ]);
    clearAuthCookies(res);

    res.json({ success: true });
  } catch (error) {
    if (zodError(error, res)) return;
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});
