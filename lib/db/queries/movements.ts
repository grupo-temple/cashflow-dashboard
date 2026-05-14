import { eq, and, gte, lte, sum, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  movimientos,
  comprobantes,
  saldosIniciales,
  syncLogs,
  exchangeRates,
} from "@/lib/db/schema";
import type { DB } from "@/lib/db";

export interface PeriodParams {
  companyId: string;
  desde: string; // ISO date YYYY-MM-DD
  hasta: string;
  excluirIntercompany?: boolean;
}

export interface CompanyPosition {
  cobrosTotal: number;
  pagosTotal: number;
  saldoNeto: number;
  saldoActual: number | null;
  saldoInicialFecha: string | null;
  usdRate: number | null;
  usdAvailable: boolean;
  lastSyncAt: string | null;
  syncStatus: string | null;
}

export async function getCompanyPosition(
  params: PeriodParams,
  database: DB = db
): Promise<CompanyPosition> {
  const { companyId, desde, hasta } = params;

  // Cobros in period
  const cobrosResult = await database
    .select({ total: sum(movimientos.importe) })
    .from(movimientos)
    .where(
      and(
        eq(movimientos.companyId, companyId),
        eq(movimientos.tipo, "cobro"),
        gte(movimientos.fecha, desde),
        lte(movimientos.fecha, hasta)
      )
    );

  // Pagos in period
  const pagosResult = await database
    .select({ total: sum(movimientos.importe) })
    .from(movimientos)
    .where(
      and(
        eq(movimientos.companyId, companyId),
        eq(movimientos.tipo, "pago"),
        gte(movimientos.fecha, desde),
        lte(movimientos.fecha, hasta)
      )
    );

  const cobrosTotal = Number(cobrosResult[0]?.total ?? 0);
  const pagosTotal = Number(pagosResult[0]?.total ?? 0);
  const saldoNeto = cobrosTotal - pagosTotal;

  // Latest saldo inicial
  const [saldoRow] = await database
    .select()
    .from(saldosIniciales)
    .where(eq(saldosIniciales.companyId, companyId))
    .orderBy(desc(saldosIniciales.fechaArqueo))
    .limit(1);

  let saldoActual: number | null = null;
  let saldoInicialFecha: string | null = null;

  if (saldoRow) {
    saldoInicialFecha = saldoRow.fechaArqueo;

    // Cobros since arqueo
    const cobrosSince = await database
      .select({ total: sum(movimientos.importe) })
      .from(movimientos)
      .where(
        and(
          eq(movimientos.companyId, companyId),
          eq(movimientos.tipo, "cobro"),
          gte(movimientos.fecha, saldoRow.fechaArqueo)
        )
      );

    const pagosSince = await database
      .select({ total: sum(movimientos.importe) })
      .from(movimientos)
      .where(
        and(
          eq(movimientos.companyId, companyId),
          eq(movimientos.tipo, "pago"),
          gte(movimientos.fecha, saldoRow.fechaArqueo)
        )
      );

    saldoActual =
      saldoRow.saldo +
      Number(cobrosSince[0]?.total ?? 0) -
      Number(pagosSince[0]?.total ?? 0);
  }

  // Latest exchange rate for this company
  const [rateRow] = await database
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.companyId, companyId))
    .orderBy(desc(exchangeRates.fechaVigencia))
    .limit(1);

  const usdRate = rateRow?.valorArsPorUsd ?? null;
  const usdAvailable = usdRate !== null;

  // Last sync info
  const [syncRow] = await database
    .select({ startedAt: syncLogs.startedAt, status: syncLogs.status })
    .from(syncLogs)
    .where(eq(syncLogs.companyId, companyId))
    .orderBy(desc(syncLogs.startedAt))
    .limit(1);

  return {
    cobrosTotal,
    pagosTotal,
    saldoNeto,
    saldoActual,
    saldoInicialFecha,
    usdRate,
    usdAvailable,
    lastSyncAt: syncRow?.startedAt ?? null,
    syncStatus: syncRow?.status ?? null,
  };
}

export interface ComprobanteRow {
  id: string;
  tipo: "venta" | "compra";
  numero: string | null;
  razonSocialContraparte: string | null;
  fechaVencimiento: string | null;
  saldoPendiente: number;
  moneda: "ARS" | "USD";
  isIntercompany: boolean;
}

export async function getComprobantesAbiertos(
  companyId: string,
  tipo: "venta" | "compra",
  hasta: string,
  database: DB = db
): Promise<ComprobanteRow[]> {
  return database
    .select({
      id: comprobantes.id,
      tipo: comprobantes.tipo,
      numero: comprobantes.numero,
      razonSocialContraparte: comprobantes.razonSocialContraparte,
      fechaVencimiento: comprobantes.fechaVencimiento,
      saldoPendiente: comprobantes.saldoPendiente,
      moneda: comprobantes.moneda,
      isIntercompany: comprobantes.isIntercompany,
    })
    .from(comprobantes)
    .where(
      and(
        eq(comprobantes.companyId, companyId),
        eq(comprobantes.tipo, tipo),
        gte(comprobantes.saldoPendiente, 0.01)
      )
    )
    .orderBy(desc(comprobantes.fechaVencimiento)) as Promise<ComprobanteRow[]>;
}
