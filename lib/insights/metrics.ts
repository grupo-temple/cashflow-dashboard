import { eq, and, gte, lte, gt, desc, lt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  comprobantes,
  movimientos,
  alertConfigs,
  alertasActivas,
} from "@/lib/db/schema";
import { calcularProyeccion } from "@/lib/projections/cashflow";
import type { DB } from "@/lib/db";
import { randomUUID } from "crypto";

export interface TreasuryMetrics {
  diasDeCaja: number | null;
  dso: number | null;
  dpo: number | null;
  topClientesPorARPendiente: TopContraparte[];
  topProveedoresPorPagoProximo: TopContraparte[];
}

export interface TopContraparte {
  razonSocial: string | null;
  cuit: string | null;
  montoTotal: number;
  fechaMasProxima: string | null;
}

export async function calcularMetricas(
  companyId: string,
  saldoActual: number | null,
  database: DB = db
): Promise<TreasuryMetrics> {
  const today = new Date().toISOString().split("T")[0];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000)
    .toISOString()
    .split("T")[0];

  // ── Días de Caja ──────────────────────────────────────────────────────────
  let diasDeCaja: number | null = null;

  if (saldoActual !== null) {
    const pagosUltimos90 = await database
      .select({ importe: movimientos.importe })
      .from(movimientos)
      .where(
        and(
          eq(movimientos.companyId, companyId),
          eq(movimientos.tipo, "pago"),
          gte(movimientos.fecha, ninetyDaysAgo),
          lte(movimientos.fecha, today)
        )
      );

    const totalPagos = pagosUltimos90.reduce((s, r) => s + r.importe, 0);

    if (saldoActual <= 0) {
      diasDeCaja = 0;
    } else if (totalPagos === 0) {
      diasDeCaja = null; // infinite / no outflow
    } else {
      const dailyBurn = totalPagos / 90;
      diasDeCaja = Math.floor(saldoActual / dailyBurn);
    }
  }

  // ── DSO ───────────────────────────────────────────────────────────────────
  // Average days between invoice emission and cobro — approximate via
  // matching cobros to ventas by comprobante_id in the last 90 days
  let dso: number | null = null;

  const cobrosConComprobante = await database
    .select({
      fecha: movimientos.fecha,
      comprobanteId: movimientos.comprobanteId,
    })
    .from(movimientos)
    .where(
      and(
        eq(movimientos.companyId, companyId),
        eq(movimientos.tipo, "cobro"),
        gte(movimientos.fecha, ninetyDaysAgo),
        lte(movimientos.fecha, today)
      )
    );

  const dsoSamples: number[] = [];
  for (const cobro of cobrosConComprobante) {
    if (!cobro.comprobanteId) continue;
    const [comp] = await database
      .select({ fechaEmision: comprobantes.fechaEmision })
      .from(comprobantes)
      .where(eq(comprobantes.id, cobro.comprobanteId))
      .limit(1);
    if (!comp?.fechaEmision) continue;
    const days = Math.floor(
      (new Date(cobro.fecha).getTime() -
        new Date(comp.fechaEmision + "T00:00:00").getTime()) /
        86400000
    );
    if (days >= 0) dsoSamples.push(days);
  }

  if (dsoSamples.length > 0) {
    dso = Math.round(
      dsoSamples.reduce((s, d) => s + d, 0) / dsoSamples.length
    );
  }

  // ── DPO ───────────────────────────────────────────────────────────────────
  let dpo: number | null = null;

  const pagosConComprobante = await database
    .select({
      fecha: movimientos.fecha,
      comprobanteId: movimientos.comprobanteId,
    })
    .from(movimientos)
    .where(
      and(
        eq(movimientos.companyId, companyId),
        eq(movimientos.tipo, "pago"),
        gte(movimientos.fecha, ninetyDaysAgo),
        lte(movimientos.fecha, today)
      )
    );

  const dpoSamples: number[] = [];
  for (const pago of pagosConComprobante) {
    if (!pago.comprobanteId) continue;
    const [comp] = await database
      .select({ fechaEmision: comprobantes.fechaEmision })
      .from(comprobantes)
      .where(eq(comprobantes.id, pago.comprobanteId))
      .limit(1);
    if (!comp?.fechaEmision) continue;
    const days = Math.floor(
      (new Date(pago.fecha).getTime() -
        new Date(comp.fechaEmision + "T00:00:00").getTime()) /
        86400000
    );
    if (days >= 0) dpoSamples.push(days);
  }

  if (dpoSamples.length > 0) {
    dpo = Math.round(
      dpoSamples.reduce((s, d) => s + d, 0) / dpoSamples.length
    );
  }

  // ── Top 5 Clientes por AR Pendiente ───────────────────────────────────────
  const ventasAbiertas = await database
    .select({
      razonSocial: comprobantes.razonSocialContraparte,
      cuit: comprobantes.cuitContraparte,
      saldoPendiente: comprobantes.saldoPendiente,
      fechaVencimiento: comprobantes.fechaVencimiento,
    })
    .from(comprobantes)
    .where(
      and(
        eq(comprobantes.companyId, companyId),
        eq(comprobantes.tipo, "venta"),
        gt(comprobantes.saldoPendiente, 0)
      )
    );

  const clienteMap = new Map<
    string,
    { razonSocial: string | null; montoTotal: number; fechaMasProxima: string | null }
  >();
  for (const v of ventasAbiertas) {
    const key = v.cuit ?? v.razonSocial ?? "desconocido";
    const existing = clienteMap.get(key);
    if (!existing) {
      clienteMap.set(key, {
        razonSocial: v.razonSocial,
        montoTotal: v.saldoPendiente,
        fechaMasProxima: v.fechaVencimiento,
      });
    } else {
      existing.montoTotal += v.saldoPendiente;
      if (
        v.fechaVencimiento &&
        (!existing.fechaMasProxima ||
          v.fechaVencimiento < existing.fechaMasProxima)
      ) {
        existing.fechaMasProxima = v.fechaVencimiento;
      }
    }
  }

  const topClientesPorARPendiente = Array.from(clienteMap.entries())
    .map(([cuit, v]) => ({
      razonSocial: v.razonSocial,
      cuit: cuit === "desconocido" ? null : cuit,
      montoTotal: v.montoTotal,
      fechaMasProxima: v.fechaMasProxima,
    }))
    .sort((a, b) => b.montoTotal - a.montoTotal)
    .slice(0, 5);

  // ── Top 5 Proveedores por Pago Próximo ────────────────────────────────────
  const comprasAbiertas = await database
    .select({
      razonSocial: comprobantes.razonSocialContraparte,
      cuit: comprobantes.cuitContraparte,
      saldoPendiente: comprobantes.saldoPendiente,
      fechaVencimiento: comprobantes.fechaVencimiento,
    })
    .from(comprobantes)
    .where(
      and(
        eq(comprobantes.companyId, companyId),
        eq(comprobantes.tipo, "compra"),
        gt(comprobantes.saldoPendiente, 0),
        gte(comprobantes.fechaVencimiento, today)
      )
    )
    .orderBy(comprobantes.fechaVencimiento);

  const proveedorMap = new Map<
    string,
    { razonSocial: string | null; montoTotal: number; fechaMasProxima: string | null }
  >();
  for (const c of comprasAbiertas) {
    const key = c.cuit ?? c.razonSocial ?? "desconocido";
    const existing = proveedorMap.get(key);
    if (!existing) {
      proveedorMap.set(key, {
        razonSocial: c.razonSocial,
        montoTotal: c.saldoPendiente,
        fechaMasProxima: c.fechaVencimiento,
      });
    } else {
      existing.montoTotal += c.saldoPendiente;
    }
  }

  const topProveedoresPorPagoProximo = Array.from(proveedorMap.entries())
    .map(([cuit, v]) => ({
      razonSocial: v.razonSocial,
      cuit: cuit === "desconocido" ? null : cuit,
      montoTotal: v.montoTotal,
      fechaMasProxima: v.fechaMasProxima,
    }))
    .sort((a, b) => {
      if (!a.fechaMasProxima) return 1;
      if (!b.fechaMasProxima) return -1;
      return a.fechaMasProxima.localeCompare(b.fechaMasProxima);
    })
    .slice(0, 5);

  return {
    diasDeCaja,
    dso,
    dpo,
    topClientesPorARPendiente,
    topProveedoresPorPagoProximo,
  };
}

// ── Alert Engine ──────────────────────────────────────────────────────────────

export async function evaluateAlerts(
  companyId: string,
  saldoActual: number | null,
  database: DB = db
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  const configs = await database
    .select()
    .from(alertConfigs)
    .where(
      and(eq(alertConfigs.companyId, companyId), eq(alertConfigs.activo, true))
    );

  for (const config of configs) {
    if (config.tipo === "saldo_bajo") {
      const horizonte = config.diasAnticipacion ?? 30;
      const projection = await calcularProyeccion(
        { companyIds: [companyId], horizonte: horizonte as 30 | 60 | 90 },
        database
      );

      const umbral = config.umbral ?? 0;
      const tension = projection.proyeccion.find(
        (d) => d.saldoProyectado < umbral
      );

      if (tension) {
        await database.insert(alertasActivas).values({
          id: randomUUID(),
          companyId,
          tipo: "saldo_bajo",
          mensaje: `Saldo proyectado cae bajo umbral ($${umbral.toLocaleString(
            "es-AR"
          )}) el ${new Date(tension.fecha + "T00:00:00").toLocaleDateString(
            "es-AR"
          )}`,
          severidad: tension.saldoProyectado < 0 ? "critical" : "warning",
        });
      }
    }

    if (config.tipo === "factura_vencida") {
      const diasUmbral = config.umbral ?? 7;
      const cutoff = new Date(Date.now() - diasUmbral * 86400000)
        .toISOString()
        .split("T")[0];

      const vencidas = await database
        .select({ id: comprobantes.id, razonSocial: comprobantes.razonSocialContraparte })
        .from(comprobantes)
        .where(
          and(
            eq(comprobantes.companyId, companyId),
            eq(comprobantes.tipo, "venta"),
            gt(comprobantes.saldoPendiente, 0),
            lt(comprobantes.fechaVencimiento, cutoff)
          )
        )
        .limit(10);

      if (vencidas.length > 0) {
        await database.insert(alertasActivas).values({
          id: randomUUID(),
          companyId,
          tipo: "factura_vencida",
          mensaje: `${vencidas.length} factura(s) vencida(s) hace más de ${diasUmbral} días sin cobrar`,
          severidad: "warning",
        });
      }
    }
  }
}

export async function getActiveAlerts(
  companyId: string,
  database: DB = db
) {
  return database
    .select()
    .from(alertasActivas)
    .where(
      and(
        eq(alertasActivas.companyId, companyId),
        isNull(alertasActivas.resolvedAt)
      )
    )
    .orderBy(desc(alertasActivas.createdAt))
    .limit(20);
}
