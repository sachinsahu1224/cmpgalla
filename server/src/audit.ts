import type { Prisma } from '@prisma/client';

export function writeAudit(
  tx: Prisma.TransactionClient,
  input: { companyId: number; userId: number; action: string; entity: string; entityId?: number; note?: string },
) {
  return tx.auditLog.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      note: input.note,
    },
  });
}
