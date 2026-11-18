import type { AuditAction } from '@prisma/client';
import { prisma } from '../middleware/auth.js';

export const logAudit = async (
  serverId: string,
  userId: string,
  action: AuditAction,
  target?: string,
  metadata?: Record<string, unknown>,
): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: { serverId, userId, action, target, metadata: metadata as any },
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
};
