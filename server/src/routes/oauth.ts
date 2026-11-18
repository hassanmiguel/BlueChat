import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { config, userPublicSelect } from '../config.js';
import { prisma, setAuthCookies, issueCsrfToken } from '../middleware/auth.js';

export const oauthRouter = Router();

const STATE_COOKIE = 'bluechat_oauth_state';

const stateCookieOptions = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: config.cookieSameSite,
  domain: config.cookieDomain,
  path: '/',
};

class OAuthRedirectError extends Error {}

interface OAuthProfile {
  provider: 'google' | 'github';
  providerAccountId: string;
  email: string;
  name?: string;
  emailVerified: boolean;
  avatar: string | null;
}

const clientBaseUrl = config.clientUrl.replace(/\/+$/, '');

const redirectError = (res: Response, message: string) =>
  res.redirect(`${clientBaseUrl}/?oauth=error&message=${encodeURIComponent(message)}`);

const finish = (res: Response, userId: string) => {
  setAuthCookies(res, userId);
  issueCsrfToken(res);
  res.redirect(`${clientBaseUrl}/?oauth=success`);
};

const queryValue = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

const readCookie = (req: Request, name: string): string | null => {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
};

const consumeState = (req: Request, res: Response): string | null => {
  const state = readCookie(req, STATE_COOKIE);
  res.clearCookie(STATE_COOKIE, stateCookieOptions);
  return state;
};

const stateMatches = (received: string | null, expected: string | null): boolean => {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
};

const handleError = (res: Response, error: unknown) => {
  if (error instanceof OAuthRedirectError) return redirectError(res, error.message);
  console.error('OAuth error:', error);
  return redirectError(res, 'OAuth authentication failed');
};

const sanitizeUsername = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 32);

const uniqueUsername = async (name: string | undefined, email: string): Promise<string> => {
  const base = sanitizeUsername((name || '').trim())
    || sanitizeUsername(email.split('@')[0] || '')
    || 'user';
  let candidate = base;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
    const suffix = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
    candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
  }
  throw new Error('Unable to allocate a unique username');
};

const provision = async (profile: OAuthProfile): Promise<string> => {
  const account = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    select: { userId: true },
  });
  if (account) return account.userId;

  const existing = await prisma.user.findUnique({
    where: { email: profile.email },
    select: { id: true, emailVerified: true },
  });
  if (existing) {
    if (!existing.emailVerified) {
      throw new OAuthRedirectError(`Verify your email before linking ${profile.provider === 'google' ? 'Google' : 'GitHub'}`);
    }
    await prisma.oAuthAccount.create({
      data: {
        userId: existing.id,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    });
    return existing.id;
  }

  const username = await uniqueUsername(profile.name, profile.email);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        discriminator: crypto.randomInt(0, 10000).toString().padStart(4, '0'),
        email: profile.email,
        password: null,
        emailVerified: profile.emailVerified,
        avatar: profile.avatar,
      },
      select: { id: true },
    });
    await tx.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    });
    return user.id;
  });
};

oauthRouter.get('/google', async (_req, res) => {
  try {
    const { clientId, clientSecret, redirectUri } = config.oauth.google;
    if (!clientId || !clientSecret) return redirectError(res, 'OAuth not configured');

    const state = crypto.randomBytes(24).toString('hex');
    res.cookie(STATE_COOKIE, state, { ...stateCookieOptions, maxAge: 10 * 60 * 1000 });
    return res.redirect(
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&state=${state}&prompt=select_account`,
    );
  } catch (error) {
    return handleError(res, error);
  }
});

oauthRouter.get('/google/callback', async (req, res) => {
  try {
    const expectedState = consumeState(req, res);
    if (!stateMatches(queryValue(req.query.state), expectedState)) {
      return redirectError(res, 'Invalid OAuth state');
    }
    const providerError = queryValue(req.query.error);
    if (providerError) return redirectError(res, `OAuth authorization failed: ${providerError}`);

    const code = queryValue(req.query.code);
    if (!code) return redirectError(res, 'Missing authorization code');

    const { clientId, clientSecret, redirectUri } = config.oauth.google;
    if (!clientId || !clientSecret) return redirectError(res, 'OAuth not configured');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) return redirectError(res, 'Failed to exchange authorization code');

    const tokenData = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenData.access_token) return redirectError(res, 'Failed to obtain access token');

    const infoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!infoResponse.ok) return redirectError(res, 'Failed to fetch Google profile');

    const info = (await infoResponse.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };
    if (!info.sub || !info.email?.trim()) return redirectError(res, 'Google account has no email');

    const userId = await provision({
      provider: 'google',
      providerAccountId: info.sub,
      email: info.email.trim().toLowerCase(),
      name: typeof info.name === 'string' ? info.name : undefined,
      emailVerified: info.email_verified === true,
      avatar: typeof info.picture === 'string' && info.picture ? info.picture : null,
    });
    return finish(res, userId);
  } catch (error) {
    return handleError(res, error);
  }
});

oauthRouter.get('/github', async (_req, res) => {
  try {
    const { clientId, clientSecret, redirectUri } = config.oauth.github;
    if (!clientId || !clientSecret) return redirectError(res, 'OAuth not configured');

    const state = crypto.randomBytes(24).toString('hex');
    res.cookie(STATE_COOKIE, state, { ...stateCookieOptions, maxAge: 10 * 60 * 1000 });
    return res.redirect(
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email&state=${state}`,
    );
  } catch (error) {
    return handleError(res, error);
  }
});

oauthRouter.get('/github/callback', async (req, res) => {
  try {
    const expectedState = consumeState(req, res);
    if (!stateMatches(queryValue(req.query.state), expectedState)) {
      return redirectError(res, 'Invalid OAuth state');
    }
    const providerError = queryValue(req.query.error);
    if (providerError) return redirectError(res, `OAuth authorization failed: ${providerError}`);

    const code = queryValue(req.query.code);
    if (!code) return redirectError(res, 'Missing authorization code');

    const { clientId, clientSecret, redirectUri } = config.oauth.github;
    if (!clientId || !clientSecret) return redirectError(res, 'OAuth not configured');

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) return redirectError(res, 'Failed to exchange authorization code');

    const tokenData = (await tokenResponse.json()) as { access_token?: string; error_description?: string };
    if (!tokenData.access_token) {
      return redirectError(res, tokenData.error_description
        ? `GitHub OAuth failed: ${tokenData.error_description}`
        : 'Failed to obtain access token');
    }

    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      'User-Agent': 'bluechat',
      Accept: 'application/vnd.github+json',
    };

    const userResponse = await fetch('https://api.github.com/user', { headers });
    if (!userResponse.ok) return redirectError(res, 'Failed to fetch GitHub profile');
    const profile = (await userResponse.json()) as {
      id?: number;
      name?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    };
    if (typeof profile.id !== 'number') return redirectError(res, 'Invalid GitHub profile');

    let primaryEmail: string | null = null;
    const emailsResponse = await fetch('https://api.github.com/user/emails', { headers });
    if (emailsResponse.ok) {
      const emails = (await emailsResponse.json()) as Array<{
        email?: string;
        primary?: boolean;
        verified?: boolean;
      }>;
      const primary = emails.find((entry) =>
        entry.primary === true && entry.verified === true && typeof entry.email === 'string' && entry.email.trim());
      if (primary?.email) primaryEmail = primary.email;
    }

    const email = (primaryEmail || (typeof profile.email === 'string' ? profile.email : '')).trim().toLowerCase();
    if (!email) return redirectError(res, 'GitHub account has no email');

    const userId = await provision({
      provider: 'github',
      providerAccountId: String(profile.id),
      email,
      name: typeof profile.name === 'string' ? profile.name : undefined,
      emailVerified: Boolean(primaryEmail),
      avatar: typeof profile.avatar_url === 'string' && profile.avatar_url ? profile.avatar_url : null,
    });
    return finish(res, userId);
  } catch (error) {
    return handleError(res, error);
  }
});
