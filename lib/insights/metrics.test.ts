import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/lib/db/schema";
import {
  calcularMetricas,
  evaluateAlerts,
  getActiveAlerts,
} from "./metrics";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_PATH = path.resolve(__dirname, "../../drizzle/migrations");

function makeDb() {
  const client = createClient({ url: ":memory:" });
  return drizzle(client, { schema });
}

async function setupDb() {
  const db = makeDb();
  await migrate(db, { migrationsFolder: MIGRATIONS_PATH });

  await db.insert(schema.companies).values([
    { id: "co-1", name: "Empresa 1", cuit: "20111111111", color: "#3B82F6" },
  ]);

  await db.insert(schema.saldosIniciales).values([
    {
      id: "si-1",
      companyId: "co-1",
      cuentaNombre: "Caja",
      saldo: 100_000,
      fechaArqueo: "2020-01-01",
    },
  ]);

  return db;
}

// ── diasDeCaja ────────────────────────────────────────────────────────────────

describe("calcularMetricas - diasDeCaja", () => {
  it("returns null when saldoActual is null", async () => {
    const db = await setupDb();
    const result = await calcularMetricas("co-1", null, db as any);
    expect(result.diasDeCaja).toBeNull();
  });

  it("returns 0 when saldoActual <= 0", async () => {
    const db = await setupDb();
    const result = await calcularMetricas("co-1", 0, db as any);
    expect(result.diasDeCaja).toBe(0);
  });

  it("returns null when no payments in last 90 days", async () => {
    const db = await setupDb();
    const result = await calcularMetricas("co-1", 50_000, db as any);
    expect(result.diasDeCaja).toBeNull();
  });

  it("calculates diasDeCaja from recent pagos", async () => {
    const db = await setupDb();
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .split("T")[0];

    await db.insert(schema.movimientos).values([
      {
        id: "m1",
        companyId: "co-1",
        tipo: "pago",
        importe: 90_000,
        fecha: thirtyDaysAgo,
        descripcion: "pago proveedor",
        contabiliumId: "MOV-M1",
      },
    ]);

    // 90k pagos in last 90 days → dailyBurn = 1000/day
    // saldo 50k / 1000/day = 50 days
    const result = await calcularMetricas("co-1", 90_000, db as any);
    expect(result.diasDeCaja).toBe(90);
  });
});

// ── DSO ───────────────────────────────────────────────────────────────────────

describe("calcularMetricas - DSO", () => {
  it("returns null when no cobros with comprobante", async () => {
    const db = await setupDb();
    const result = await calcularMetricas("co-1", null, db as any);
    expect(result.dso).toBeNull();
  });

  it("calculates DSO from cobro/comprobante pairs", async () => {
    const db = await setupDb();
    const today = new Date().toISOString().split("T")[0];
    const twentyDaysAgo = new Date(Date.now() - 20 * 86400000)
      .toISOString()
      .split("T")[0];

    await db.insert(schema.comprobantes).values([
      {
        id: "cmp-1",
        companyId: "co-1",
        tipo: "venta",
        contabiliumId: "V1",
        fechaEmision: twentyDaysAgo,
        fechaVencimiento: today,
        razonSocialContraparte: "Cliente A",
        cuitContraparte: "20333333333",
        importeTotal: 10_000,
        saldoPendiente: 0,
        isIntercompany: false,
      },
    ]);

    await db.insert(schema.movimientos).values([
      {
        id: "cobro-1",
        companyId: "co-1",
        tipo: "cobro",
        importe: 10_000,
        fecha: today,
        comprobanteId: "cmp-1",
        descripcion: "cobro factura",
        contabiliumId: "MOV-COBRO1",
      },
    ]);

    const result = await calcularMetricas("co-1", null, db as any);
    // ±1 tolerance for UTC vs local date parsing
    expect(result.dso).toBeGreaterThanOrEqual(19);
    expect(result.dso).toBeLessThanOrEqual(20);
  });
});

// ── DPO ───────────────────────────────────────────────────────────────────────

describe("calcularMetricas - DPO", () => {
  it("returns null when no pagos with comprobante", async () => {
    const db = await setupDb();
    const result = await calcularMetricas("co-1", null, db as any);
    expect(result.dpo).toBeNull();
  });

  it("calculates DPO from pago/comprobante pairs", async () => {
    const db = await setupDb();
    const today = new Date().toISOString().split("T")[0];
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000)
      .toISOString()
      .split("T")[0];

    await db.insert(schema.comprobantes).values([
      {
        id: "cmp-pago-1",
        companyId: "co-1",
        tipo: "compra",
        contabiliumId: "C1",
        fechaEmision: tenDaysAgo,
        fechaVencimiento: today,
        razonSocialContraparte: "Proveedor X",
        cuitContraparte: "20444444444",
        importeTotal: 5_000,
        saldoPendiente: 0,
        isIntercompany: false,
      },
    ]);

    await db.insert(schema.movimientos).values([
      {
        id: "pago-1",
        companyId: "co-1",
        tipo: "pago",
        importe: 5_000,
        fecha: today,
        comprobanteId: "cmp-pago-1",
        descripcion: "pago factura",
        contabiliumId: "MOV-PAGO1",
      },
    ]);

    const result = await calcularMetricas("co-1", null, db as any);
    // ±1 tolerance for UTC vs local date parsing
    expect(result.dpo).toBeGreaterThanOrEqual(9);
    expect(result.dpo).toBeLessThanOrEqual(10);
  });
});

// ── Top Clientes por AR Pendiente ─────────────────────────────────────────────

describe("calcularMetricas - topClientesPorARPendiente", () => {
  it("returns empty array when no open ventas", async () => {
    const db = await setupDb();
    const result = await calcularMetricas("co-1", null, db as any);
    expect(result.topClientesPorARPendiente).toHaveLength(0);
  });

  it("returns top 5 clients sorted by pending amount", async () => {
    const db = await setupDb();
    const futura = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];

    const comprobantesData = Array.from({ length: 7 }, (_, i) => ({
      id: `v${i}`,
      companyId: "co-1",
      tipo: "venta" as const,
      contabiliumId: `V${i}`,
      fechaEmision: "2026-01-01",
      fechaVencimiento: futura,
      razonSocialContraparte: `Cliente ${i}`,
      cuitContraparte: `2099999${i}000`,
      importeTotal: (i + 1) * 10_000,
      saldoPendiente: (i + 1) * 10_000,
      isIntercompany: false,
    }));

    await db.insert(schema.comprobantes).values(comprobantesData);

    const result = await calcularMetricas("co-1", null, db as any);
    expect(result.topClientesPorARPendiente).toHaveLength(5);
    expect(result.topClientesPorARPendiente[0].montoTotal).toBe(70_000);
    expect(result.topClientesPorARPendiente[4].montoTotal).toBe(30_000);
  });

  it("groups multiple comprobantes by same CUIT", async () => {
    const db = await setupDb();
    const futura = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .split("T")[0];

    await db.insert(schema.comprobantes).values([
      {
        id: "va1",
        companyId: "co-1",
        tipo: "venta",
        contabiliumId: "VA1",
        fechaEmision: "2026-01-01",
        fechaVencimiento: futura,
        razonSocialContraparte: "Cliente Mismo",
        cuitContraparte: "20555555555",
        importeTotal: 10_000,
        saldoPendiente: 10_000,
        isIntercompany: false,
      },
      {
        id: "va2",
        companyId: "co-1",
        tipo: "venta",
        contabiliumId: "VA2",
        fechaEmision: "2026-01-15",
        fechaVencimiento: futura,
        razonSocialContraparte: "Cliente Mismo",
        cuitContraparte: "20555555555",
        importeTotal: 20_000,
        saldoPendiente: 20_000,
        isIntercompany: false,
      },
    ]);

    const result = await calcularMetricas("co-1", null, db as any);
    expect(result.topClientesPorARPendiente).toHaveLength(1);
    expect(result.topClientesPorARPendiente[0].montoTotal).toBe(30_000);
    expect(result.topClientesPorARPendiente[0].cuit).toBe("20555555555");
  });
});

// ── Top Proveedores por Pago Próximo ──────────────────────────────────────────

describe("calcularMetricas - topProveedoresPorPagoProximo", () => {
  it("returns empty array when no open compras", async () => {
    const db = await setupDb();
    const result = await calcularMetricas("co-1", null, db as any);
    expect(result.topProveedoresPorPagoProximo).toHaveLength(0);
  });

  it("returns top 5 suppliers sorted by nearest due date", async () => {
    const db = await setupDb();

    const comprasData = Array.from({ length: 6 }, (_, i) => {
      const dueDate = new Date(Date.now() + (i + 1) * 7 * 86400000)
        .toISOString()
        .split("T")[0];
      return {
        id: `c${i}`,
        companyId: "co-1",
        tipo: "compra" as const,
        contabiliumId: `C${i}`,
        fechaEmision: "2026-01-01",
        fechaVencimiento: dueDate,
        razonSocialContraparte: `Proveedor ${i}`,
        cuitContraparte: `2088888${i}000`,
        importeTotal: 5_000,
        saldoPendiente: 5_000,
        isIntercompany: false,
      };
    });

    await db.insert(schema.comprobantes).values(comprasData);

    const result = await calcularMetricas("co-1", null, db as any);
    expect(result.topProveedoresPorPagoProximo).toHaveLength(5);
    // First entry should have the nearest due date
    const firstDue = result.topProveedoresPorPagoProximo[0].fechaMasProxima;
    const lastDue = result.topProveedoresPorPagoProximo[4].fechaMasProxima;
    expect(firstDue! < lastDue!).toBe(true);
  });
});

// ── Alert Engine ──────────────────────────────────────────────────────────────

describe("evaluateAlerts + getActiveAlerts", () => {
  it("creates factura_vencida alert when invoices overdue", async () => {
    const db = await setupDb();
    const longAgo = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .split("T")[0];

    await db.insert(schema.comprobantes).values([
      {
        id: "ov1",
        companyId: "co-1",
        tipo: "venta",
        contabiliumId: "OV1",
        fechaEmision: "2026-01-01",
        fechaVencimiento: longAgo,
        razonSocialContraparte: "Deudor",
        cuitContraparte: "20777777777",
        importeTotal: 15_000,
        saldoPendiente: 15_000,
        isIntercompany: false,
      },
    ]);

    await db.insert(schema.alertConfigs).values([
      {
        id: "ac-1",
        companyId: "co-1",
        tipo: "factura_vencida",
        umbral: 7,
        activo: true,
      },
    ]);

    await evaluateAlerts("co-1", null, db as any);

    const alerts = await getActiveAlerts("co-1", db as any);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const alert = alerts.find((a) => a.tipo === "factura_vencida");
    expect(alert).toBeDefined();
    expect(alert!.severidad).toBe("warning");
  });

  it("does not create factura_vencida alert when config is inactive", async () => {
    const db = await setupDb();
    const longAgo = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .split("T")[0];

    await db.insert(schema.comprobantes).values([
      {
        id: "ov2",
        companyId: "co-1",
        tipo: "venta",
        contabiliumId: "OV2",
        fechaEmision: "2026-01-01",
        fechaVencimiento: longAgo,
        razonSocialContraparte: "Deudor2",
        cuitContraparte: "20888888888",
        importeTotal: 5_000,
        saldoPendiente: 5_000,
        isIntercompany: false,
      },
    ]);

    await db.insert(schema.alertConfigs).values([
      {
        id: "ac-inactive",
        companyId: "co-1",
        tipo: "factura_vencida",
        umbral: 7,
        activo: false,
      },
    ]);

    await evaluateAlerts("co-1", null, db as any);

    const alerts = await getActiveAlerts("co-1", db as any);
    expect(alerts.filter((a) => a.tipo === "factura_vencida")).toHaveLength(0);
  });

  it("getActiveAlerts excludes resolved alerts", async () => {
    const db = await setupDb();

    await db.insert(schema.alertasActivas).values([
      {
        id: "al-resolved",
        companyId: "co-1",
        tipo: "saldo_bajo",
        mensaje: "Alerta resuelta",
        severidad: "warning",
        resolvedAt: new Date().toISOString(),
      },
      {
        id: "al-open",
        companyId: "co-1",
        tipo: "factura_vencida",
        mensaje: "Alerta abierta",
        severidad: "warning",
      },
    ]);

    const alerts = await getActiveAlerts("co-1", db as any);
    expect(alerts.map((a) => a.id)).not.toContain("al-resolved");
    expect(alerts.map((a) => a.id)).toContain("al-open");
  });
});
