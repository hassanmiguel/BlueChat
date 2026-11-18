import { config } from '../config.js';

interface MailPayload {
  to: string;
  subject: string;
  template: 'verify-email' | 'password-reset';
  token: string;
  link: string;
}

export const sendMail = async (payload: MailPayload): Promise<void> => {
  const link = `${config.clientUrl}${payload.link}?token=${encodeURIComponent(payload.token)}`;
  const body = { ...payload, link };

  if (config.email.webhookUrl) {
    const response = await fetch(config.email.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Email webhook failed with status ${response.status}`);
    }
    return;
  }

  if (!config.isProduction) {
    console.info(`[mail:${payload.template}] to=${payload.to} link=${link}`);
    return;
  }

  console.warn(`[mail] EMAIL_WEBHOOK_URL is not configured; email to ${payload.to} was not delivered.`);
};
