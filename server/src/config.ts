import 'dotenv/config';

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const int = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
};

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: int('PORT', 3001),
  // Set to the number of trusted reverse-proxy hops in production. Keep 0 when
  // the Node process is directly exposed so client-supplied X-Forwarded-For
  // headers cannot influence IP-based rate limiting.
  trustProxyHops: Math.max(0, int('TRUST_PROXY_HOPS', 0)),
  clientUrl: required('CLIENT_URL', 'http://localhost:3000'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieName: 'bluechat_token',
  csrfCookieName: 'bluechat_csrf',
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'none' | 'strict',
  cookieSecure: bool('COOKIE_SECURE', process.env.NODE_ENV === 'production'),
  accessTokenTtlMs: int('ACCESS_TOKEN_TTL_MS', 15 * 60 * 1000),
  refreshTokenTtlMs: int('REFRESH_TOKEN_TTL_MS', 30 * 24 * 60 * 60 * 1000),
  rateLimitWindowMs: int('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  rateLimitMax: int('RATE_LIMIT_MAX', 100),
  authRateLimitMax: int('AUTH_RATE_LIMIT_MAX', 10),
  email: {
    webhookUrl: process.env.EMAIL_WEBHOOK_URL || '',
    from: process.env.EMAIL_FROM || 'no-reply@bluechat.local',
  },
  livekit: {
    url: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/oauth/google/callback',
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:3001/api/auth/oauth/github/callback',
    },
  },
} as const;

export const userPublicSelect = {
  id: true,
  username: true,
  discriminator: true,
  email: true,
  emailVerified: true,
  avatar: true,
  banner: true,
  bio: true,
  status: true,
  customStatus: true,
  createdAt: true,
} as const;
