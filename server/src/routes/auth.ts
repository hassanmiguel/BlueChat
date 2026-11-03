import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, authenticate, generateToken, AuthRequest } from '../middleware/auth.js';

export const authRouter = Router();

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(2).max(32),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /api/auth/register
authRouter.post('/register', async (req: AuthRequest, res: Response) => {
  try {
    const { username, email, password } = registerSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate discriminator
    const discriminator = String(Math.floor(Math.random() * 9999)).padStart(4, '0');

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        discriminator,
        email,
        password: hashedPassword,
      },
      select: {
        id: true,
        username: true,
        discriminator: true,
        email: true,
        avatar: true,
        bio: true,
        status: true,
        customStatus: true,
        createdAt: true,
      },
    });

    const token = generateToken(user.id);

    res.status(201).json({ user, token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// POST /api/auth/login
authRouter.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last seen
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date(), status: 'ONLINE' },
    });

    const token = generateToken(user.id);

    const { password: _, ...userWithoutPassword } = user;

    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// GET /api/auth/me
authRouter.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    res.json(req.user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// PATCH /api/auth/profile
authRouter.patch('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { bio, avatar, banner, customStatus, status } = req.body;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        ...(bio !== undefined && { bio }),
        ...(avatar !== undefined && { avatar }),
        ...(banner !== undefined && { banner }),
        ...(customStatus !== undefined && { customStatus }),
        ...(status !== undefined && { status }),
      },
      select: {
        id: true,
        username: true,
        discriminator: true,
        email: true,
        avatar: true,
        banner: true,
        bio: true,
        status: true,
        customStatus: true,
        createdAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});
