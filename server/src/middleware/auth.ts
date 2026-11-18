import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { config, userPublicSelect } from '../config.js';

export const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  userId?: string;
  user?: any;
}

interface TokenPayload extends jwt.JwtPayload {
  userId: string;
  type: 'access' | 'refresh';
}

export const generateAccessToken = (userId: string): string =>
  jwt.sign({ userId, type: 'access' }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });

export const generateRefreshToken = (userId: string): string =>
  jwt.sign({ userId, type: 'refresh' }, config.jwtSecret, { expiresIn: '30d' });

const verifyToken = (token: string, expectedType: TokenPayload['type']): TokenPayload | null => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
    if (decoded.type !== expectedType || typeof decoded.userId !== 'string') return null;
    return decoded;
  } catch {
    return null;
  }
};

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: config.cookieSameSite,
  domain: config.cookieDomain,
  path: '/',
  maxAge,
});

export const setAuthCookies = (res: Response, userId: string): void => {
  res.cookie(config.cookieName, generateAccessToken(userId), cookieOptions(config.accessTokenTtlMs));
  res.cookie('bluechat_refresh', generateRefreshToken(userId), {
    ...cookieOptions(config.refreshTokenTtlMs),
    path: '/api/auth',
  });
};

export const clearAuthCookies = (res: Response): void => {
  // Clearing must use the same domain/secure/sameSite attributes used when the
  // cookies were set, otherwise the browser keeps a different cookie behind.
  const clearOptions = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    domain: config.cookieDomain,
    path: '/',
  };
  res.clearCookie(config.cookieName, clearOptions);
  res.clearCookie('bluechat_refresh', { ...clearOptions, path: '/api/auth' });
};

export const issueCsrfToken = (res: Response): string => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(config.csrfCookieName, token, {
    httpOnly: false,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    domain: config.cookieDomain,
    path: '/',
    maxAge: config.refreshTokenTtlMs,
  });
  return token;
};

const parseCookies = (header?: string): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
};

const extractAccessToken = (req: Request): string | null => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[config.cookieName]) return cookies[config.cookieName];
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractAccessToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const decoded = verifyToken(token, 'access');
    if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: userPublicSelect,
    });

    if (!user) return res.status(401).json({ error: 'Account no longer exists' });

    req.userId = user.id;
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

export const authenticateOptional = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const token = extractAccessToken(req);
  if (!token) return next();
  const decoded = verifyToken(token, 'access');
  if (decoded) {
    req.userId = decoded.userId;
  }
  next();
};

export const getRefreshUserId = (req: Request): string | null => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['bluechat_refresh'];
  if (!token) return null;
  const decoded = verifyToken(token, 'refresh');
  return decoded?.userId ?? null;
};

export const verifyCsrf = (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[config.csrfCookieName];
  const headerToken = req.header('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
};

export const generateToken = (userId: string): string => generateAccessToken(userId);
export const JWT_SECRET = config.jwtSecret;
