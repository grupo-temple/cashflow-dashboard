import { getProjectionData } from "@/lib/db/queries/projections";
import type { ProjectionResult } from "@/lib/db/queries/projections";
import type { DB } from "@/lib/db";

export interface CalcularProyeccionParams {
  companyIds: string[];
  horizonte: 30 | 60 | 90;
  excluirIntercompany?: boolean;
}

export async function calcularProyeccion(
  params: CalcularProyeccionParams,
  database?: DB
): Promise<ProjectionResult> {
  const { companyIds, horizonte, excluirIntercompany = false } = params;

  if (companyIds.length === 0) {
    return {
      saldoActual: 0,
      proyeccion: [],
      fechaTension: null,
      usdAvailable: false,
      usdRate: null,
    };
  }

  // Single company — return directly
  if (companyIds.length === 1) {
    const result = await getProjectionData(
      { companyId: companyIds[0], horizonte, excluirIntercompany },
      database
    );
    const { arRows: _a, ...clean } = result;
    return clean;
  }

  // Multiple companies — fetch all and consolidate
  const results = await Promise.all(
    companyIds.map((id) =>
      getProjectionData({ companyId: id, horizonte, excluirIntercompany }, database)
    )
  );

  // Check if any company is missing saldo_inicial
  const validResults = results.filter((r) => r.dataQuality !== "saldo_inicial_required");

  if (validResults.length === 0) {
    return {
      saldoActual: null,
      dataQuality: "saldo_inicial_required",
      proyeccion: [],
      fechaTension: null,
      usdAvailable: false,
      usdRate: null,
    };
  }

  const consolidatedSaldo = validResults.reduce(
    (sum, r) => sum + (r.saldoActual ?? 0),
    0
  );

  // Merge day arrays — sum saldo projected per day
  const dayMap = new Map<string, { cobros: number; pagos: number; hasManual: boolean }>();

  for (const r of validResults) {
    for (const day of r.proyeccion) {
      const existing = dayMap.get(day.fecha) ?? { cobros: 0, pagos: 0, hasManual: false };
      dayMap.set(day.fecha, {
        cobros: existing.cobros + day.cobrosDelDia,
        pagos: existing.pagos + day.pagosDelDia,
        hasManual: existing.hasManual || day.tieneManualEntry,
      });
    }
  }

  const sortedDays = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b));

  let saldoCorriente = consolidatedSaldo;
  let fechaTension: string | null = null;
  const proyeccion = sortedDays.map(([fecha, { cobros, pagos, hasManual }]) => {
    saldoCorriente += cobros - pagos;
    const saldoProyectado = Math.round(saldoCorriente * 100) / 100;
    if (saldoProyectado < 0 && fechaTension === null) {
      fechaTension = fecha;
    }
    return {
      fecha,
      saldoProyectado,
      cobrosDelDia: cobros,
      pagosDelDia: pagos,
      tieneManualEntry: hasManual,
    };
  });

  // USD available only if ALL companies have a rate (consolidated USD is ambiguous otherwise)
  const usdAvailable = validResults.every((r) => r.usdAvailable);
  const usdRate = usdAvailable ? (validResults[0].usdRate ?? null) : null;

  return {
    saldoActual: consolidatedSaldo,
    proyeccion,
    fechaTension,
    usdAvailable,
    usdRate,
  };
}
