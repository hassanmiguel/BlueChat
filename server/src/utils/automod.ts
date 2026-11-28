import { prisma } from '../middleware/auth.js';

export const getAutoModViolation = async (
  serverId: string,
  channelId: string,
  userId: string,
  content: string,
  legacyBlockedWords: string[] = [],
): Promise<string | null> => {
  const normalized = content.toLocaleLowerCase();
  const legacyMatch = legacyBlockedWords.find((word) => word && normalized.includes(word.toLocaleLowerCase()));
  if (legacyMatch) return 'Message contains a blocked word';

  const rules = await prisma.autoModRule.findMany({ where: { serverId, enabled: true } });
  for (const rule of rules) {
    if (rule.type === 'BLOCKED_PHRASE' && rule.pattern && normalized.includes(rule.pattern.toLocaleLowerCase())) {
      return 'Message contains a phrase blocked by server AutoMod';
    }
    if (rule.type === 'MAX_MENTIONS') {
      const mentions = (content.match(/@[a-zA-Z0-9_.]+/g) || []).length;
      if (mentions > rule.threshold) return `Message exceeds the server mention limit (${rule.threshold})`;
    }
    if (rule.type === 'MAX_LINKS') {
      const links = (content.match(/https?:\\/\\/[^\\s]+/gi) || []).length;
      if (links > rule.threshold) return `Message exceeds the server link limit (${rule.threshold})`;
    }
    if (rule.type === 'DUPLICATE_MESSAGE') {
      const since = new Date(Date.now() - 60_000);
      const duplicates = await prisma.message.count({
        where: { channelId, authorId: userId, content, deletedAt: null, createdAt: { gte: since } },
      });
      if (duplicates >= rule.threshold) return 'Repeated messages are blocked by server AutoMod';
    }
  }
  return null;
};
