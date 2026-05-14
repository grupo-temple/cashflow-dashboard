import { randomUUID } from "crypto";
import { eq, isNull, gt, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  companies,
  contabiliumCredentials,
  syncLogs,
  comprobantes,
  movimientos,
} from "@/lib/db/schema";
import { ContabiliumClient } from "@/lib/contabilium/client";
import { mapComprobante, mapMovimiento } from "@/lib/contabilium/mapper";
import { decrypt } from "@/lib/crypto/field-encrypt";
import type { DB } from "@/lib/db";

export interface SyncResult {
  companyId: string;
  status: "success" | "error";
  errorCode?: string;
  errorHttpStatus?: number;
}

// Returns true if there is a sync that started less than 6 min ago with no finish
export async function isLocked(database: DB = db): Promise<boolean> {
  const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  const running = await database
    .select({ id: syncLogs.id })
    .from(syncLogs)
    .where(
      and(
        isNull(syncLogs.finishedAt),
        gt(syncLogs.startedAt, sixMinutesAgo)
      )
    )
    .limit(1);
  return running.length > 0;
}

async function syncCompany(
  company: typeof companies.$inferSelect,
  allGroupCuits: string[],
  database: DB
): Promise<SyncResult> {
  const logId = randomUUID();
  const startedAt = new Date().toISOString();

  await database.insert(syncLogs).values({
    id: logId,
    companyId: company.id,
    startedAt,
    status: "pending",
  });

  try {
    // Load credential and decrypt api key
    if (!company.contabiliumCredentialId) {
      throw Object.assign(new Error("No credential configured"), {
        code: "NO_CREDENTIAL",
      });
    }

    const [cred] = await database
      .select()
      .from(contabiliumCredentials)
      .where(eq(contabiliumCredentials.id, company.contabiliumCredentialId));

    if (!cred) throw Object.assign(new Error("Credential not found"), { code: "CREDENTIAL_NOT_FOUND" });

    const apiKey = decrypt(cred.apiKeyEncrypted);
    const client = new ContabiliumClient({
      apiKey,
      empresaSelectorValue: cred.empresaSelectorValue ?? undefined,
    });

    // Use overlap window: last sync date - 1 day, or configured history start
    const historiaStart = process.env.DATE_INICIO_HISTORIA ?? "2024-01-01";
    const [lastSync] = await database
      .select({ startedAt: syncLogs.startedAt })
      .from(syncLogs)
      .where(
        and(
          eq(syncLogs.companyId, company.id),
          eq(syncLogs.status, "success")
        )
      )
      .orderBy(syncLogs.startedAt)
      .limit(1);

    const desde = lastSync
      ? new Date(
          new Date(lastSync.startedAt).getTime() - 24 * 60 * 60 * 1000
        )
          .toISOString()
          .split("T")[0]
      : historiaStart;

    const hasta = new Date().toISOString().split("T")[0];
    const params = { desde, hasta };

    const [ventasRaw, comprasRaw, cobrosRaw, pagosRaw] = await Promise.all([
      client.getComprobantesVenta(params),
      client.getComprobantesCompra(params),
      client.getCobros(params),
      client.getPagos(params),
    ]);

    // Upsert comprobantes
    for (const raw of ventasRaw) {
      const mapped = mapComprobante(raw, company.id, "venta", allGroupCuits);
      await database
        .insert(comprobantes)
        .values(mapped)
        .onConflictDoUpdate({
          target: comprobantes.contabiliumId,
          set: {
            saldoPendiente: mapped.saldoPendiente,
            isIntercompany: mapped.isIntercompany,
            updatedAt: new Date().toISOString(),
          },
        });
    }

    for (const raw of comprasRaw) {
      const mapped = mapComprobante(raw, company.id, "compra", allGroupCuits);
      await database
        .insert(comprobantes)
        .values(mapped)
        .onConflictDoUpdate({
          target: comprobantes.contabiliumId,
          set: {
            saldoPendiente: mapped.saldoPendiente,
            isIntercompany: mapped.isIntercompany,
            updatedAt: new Date().toISOString(),
          },
        });
    }

    // Upsert movimientos
    for (const raw of [...cobrosRaw, ...pagosRaw]) {
      const mapped = mapMovimiento(raw, company.id);
      await database
        .insert(movimientos)
        .values(mapped)
        .onConflictDoUpdate({
          target: movimientos.contabiliumId,
          set: {
            importe: mapped.importe,
            descripcion: mapped.descripcion,
          },
        });
    }

    await database
      .update(syncLogs)
      .set({ finishedAt: new Date().toISOString(), status: "success" })
      .where(eq(syncLogs.id, logId));

    return { companyId: company.id, status: "success" };
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number; code?: string };
    await database
      .update(syncLogs)
      .set({
        finishedAt: new Date().toISOString(),
        status: "error",
        errorCode: error.code ?? error.message ?? "UNKNOWN",
        errorHttpStatus: error.status ?? null,
      })
      .where(eq(syncLogs.id, logId));

    return {
      companyId: company.id,
      status: "error",
      errorCode: error.code ?? error.message,
      errorHttpStatus: error.status,
    };
  }
}

export class SyncEngine {
  constructor(private database: DB = db) {}

  async runAll(): Promise<SyncResult[]> {
    const allCompanies = await this.database.select().from(companies);
    const allGroupCuits = allCompanies.map((c) => c.cuit);

    const settled = await Promise.allSettled(
      allCompanies.map((company) =>
        syncCompany(company, allGroupCuits, this.database)
      )
    );

    return settled.map((result, i) => {
      if (result.status === "fulfilled") return result.value;
      return {
        companyId: allCompanies[i].id,
        status: "error" as const,
        errorCode: result.reason?.message ?? "UNEXPECTED_ERROR",
      };
    });
  }
}
