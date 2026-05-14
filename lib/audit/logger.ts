import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import type { DB } from "@/lib/db";

export interface AuditParams {
  userId?: string | null;
  action: "create" | "update" | "delete";
  tableName: string;
  recordId: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function logAudit(
  params: AuditParams,
  database: DB = db
): Promise<void> {
  await database.insert(auditLog).values({
    id: randomUUID(),
    userId: params.userId ?? null,
    action: params.action,
    tableName: params.tableName,
    recordId: params.recordId,
    oldValueJson: params.oldValue != null ? JSON.stringify(params.oldValue) : null,
    newValueJson: params.newValue != null ? JSON.stringify(params.newValue) : null,
  });
}
