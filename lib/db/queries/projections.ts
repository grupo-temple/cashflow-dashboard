import { eq, and, gte, lte, gt, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  comprobantes,
  manualEntries,
  saldosIniciales,
  movimientos,
  exchangeRates,
} from "@/lib/db/schema";
import type { DB } from "@/lib/db";

export interface ProjectionInput {
  companyId: string;
  horizonte: number; // days
  excluirIntercompany?: boolean;
}

export interface DayProjection {
  fecha: string; // ISO date
  saldoProyectado: number;
  cobrosDelDia: number;
  pagosDelDia: number;
  tieneManualEntry: boolean;
}

export interface ProjectionResult {
  saldoActual: number | null;
  dataQuality?: "saldo_inicial_required";
  proyeccion: DayProjection[];
  fechaTension: string | null;
  usdAvailable: boolean;
  usdRate: number | null;
}

export async function getProjectionData(
  input: ProjectionInput,
  database: DB = db
): Promise<ProjectionResult & { arRows: Array<{ fecha: string; importe: number; isIntercompany: boolean; tieneManual: boolean }> }> {
  const today = new Date().toISOString().split("T")[0];
  const horizonEnd = new Date(Date.now() + input.horizonte * 86400000)
    .toISOString()
    .split("T")[0];

  // Latest exchange rate
  const [rateRow] = await database
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.companyId, input.companyId))
    .orderBy(desc(exchangeRates.fechaVigencia))
    .limit(1);

  const usdRate = rateRow?.valorArsPorUsd ?? null;

  // Latest saldo inicial
  const [saldoRow] = await database
    .select()
    .from(saldosIniciales)
    .where(eq(saldosIniciales.companyId, input.companyId))
    .orderBy(desc(saldosIniciales.fechaArqueo))
    .limit(1);

  if (!saldoRow) {
    return {
      saldoActual: null,
      dataQuality: "saldo_inicial_required",
      proyeccion: [],
      fechaTension: null,
      usdAvailable: false,
      usdRate: null,
      arRows: [],
    };
  }

  // Cobros since arqueo to compute saldo actual
  const cobrosMovs = await database
    .select({ importe: movimientos.importe })
    .from(movimientos)
    .where(
      and(
        eq(movimientos.companyId, input.companyId),
        eq(movimientos.tipo, "cobro"),
        gte(movimientos.fecha, saldoRow.fechaArqueo),
        lte(movimientos.fecha, today)
      )
    );

  const pagosMovs = await database
    .select({ importe: movimientos.importe })
    .from(movimientos)
    .where(
      and(
        eq(movimientos.companyId, input.companyId),
        eq(movimientos.tipo, "pago"),
        gte(movimientos.fecha, saldoRow.fechaArqueo),
        lte(movimientos.fecha, today)
      )
    );

  const totalCobros = cobrosMovs.reduce((s, r) => s + r.importe, 0);
  const totalPagos = pagosMovs.reduce((s, r) => s + r.importe, 0);
  const saldoActual = saldoRow.saldo + totalCobros - totalPagos;

  // Future AR: facturas a cobrar con vencimiento futuro y saldo > 0
  const arFilters = [
    eq(comprobantes.companyId, input.companyId),
    eq(comprobantes.tipo, "venta"),
    gt(comprobantes.saldoPendiente, 0),
    gte(comprobantes.fechaVencimiento, today),
    lte(comprobantes.fechaVencimiento, horizonEnd),
  ];

  const arRows = await database
    .select({
      fechaVencimiento: comprobantes.fechaVencimiento,
      saldoPendiente: comprobantes.saldoPendiente,
      isIntercompany: comprobantes.isIntercompany,
    })
    .from(comprobantes)
    .where(and(...arFilters));

  // Future AP: facturas a pagar con vencimiento futuro y saldo > 0
  const apFilters = [
    eq(comprobantes.companyId, input.companyId),
    eq(comprobantes.tipo, "compra"),
    gt(comprobantes.saldoPendiente, 0),
    gte(comprobantes.fechaVencimiento, today),
    lte(comprobantes.fechaVencimiento, horizonEnd),
  ];

  const apRows = await database
    .select({
      fechaVencimiento: comprobantes.fechaVencimiento,
      saldoPendiente: comprobantes.saldoPendiente,
      isIntercompany: comprobantes.isIntercompany,
    })
    .from(comprobantes)
    .where(and(...apFilters));

  // Manual entries in horizon
  const manualRows = await database
    .select()
    .from(manualEntries)
    .where(
      and(
        eq(manualEntries.companyId, input.companyId),
        gte(manualEntries.fechaEsperada, today),
        lte(manualEntries.fechaEsperada, horizonEnd)
      )
    );

  // Build day-by-day projection map
  const arByDay = new Map<string, number>();
  const apByDay = new Map<string, number>();
  const manualByDay = new Set<string>();

  for (const r of arRows) {
    if (!r.fechaVencimiento) continue;
    if (input.excluirIntercompany && r.isIntercompany) continue;
    arByDay.set(
      r.fechaVencimiento,
      (arByDay.get(r.fechaVencimiento) ?? 0) + r.saldoPendiente
    );
  }

  for (const r of apRows) {
    if (!r.fechaVencimiento) continue;
    if (input.excluirIntercompany && r.isIntercompany) continue;
    apByDay.set(
      r.fechaVencimiento,
      (apByDay.get(r.fechaVencimiento) ?? 0) + r.saldoPendiente
    );
  }

  for (const r of manualRows) {
    const fecha = r.fechaEsperada;
    if (r.tipo === "cobro") {
      arByDay.set(fecha, (arByDay.get(fecha) ?? 0) + r.importe);
    } else {
      apByDay.set(fecha, (apByDay.get(fecha) ?? 0) + r.importe);
    }
    manualByDay.add(fecha);
  }

  // Generate day array
  const proyeccion: DayProjection[] = [];
  let saldoCorriente = saldoActual;
  let fechaTension: string | null = null;

  for (let i = 0; i < input.horizonte; i++) {
    const fecha = new Date(Date.now() + (i + 1) * 86400000)
      .toISOString()
      .split("T")[0];

    const cobrosDelDia = arByDay.get(fecha) ?? 0;
    const pagosDelDia = apByDay.get(fecha) ?? 0;
    saldoCorriente += cobrosDelDia - pagosDelDia;

    proyeccion.push({
      fecha,
      saldoProyectado: Math.round(saldoCorriente * 100) / 100,
      cobrosDelDia,
      pagosDelDia,
      tieneManualEntry: manualByDay.has(fecha),
    });

    if (saldoCorriente < 0 && fechaTension === null) {
      fechaTension = fecha;
    }
  }

  return {
    saldoActual,
    proyeccion,
    fechaTension,
    usdAvailable: usdRate !== null,
    usdRate,
    arRows: arRows.map((r) => ({
      fecha: r.fechaVencimiento ?? "",
      importe: r.saldoPendiente,
      isIntercompany: r.isIntercompany,
      tieneManual: false,
    })),
  };
}
