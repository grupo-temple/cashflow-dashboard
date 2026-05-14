import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/lib/db/schema";
import { calcularProyeccion } from "./cashflow";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_PATH = path.resolve(__dirname, "../../drizzle/migrations");

function makeDb() {
  return drizzle(createClient({ url: ":memory:" }), { schema });
}

function futureDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86400000)
    .toISOString()
    .split("T")[0];
}

async function setup() {
  const db = makeDb();
  await migrate(db, { migrationsFolder: MIGRATIONS_PATH });

  await db.insert(schema.companies).values([
    { id: "co-a", name: "A", cuit: "20111111111", color: "#FF0000" },
    { id: "co-b", name: "B", cuit: "20222222222", color: "#00FF00" },
    { id: "co-c", name: "C", cuit: "20333333333", color: "#0000FF" },
  ]);

  // Saldo inicial 100k ARS for co-a, co-b, co-c
  await db.insert(schema.saldosIniciales).values([
    { id: "si-a", companyId: "co-a", cuentaNombre: "P", saldo: 100_000, moneda: "ARS", fechaArqueo: "2026-01-01" },
    { id: "si-b", companyId: "co-b", cuentaNombre: "P", saldo: 100_000, moneda: "ARS", fechaArqueo: "2026-01-01" },
    { id: "si-c", companyId: "co-c", cuentaNombre: "P", saldo: 100_000, moneda: "ARS", fechaArqueo: "2026-01-01" },
  ]);

  return db;
}

describe("calcularProyeccion — single company", () => {
  it("returns saldo_inicial_required when no saldo configured", async () => {
    const db = makeDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_PATH });
    await db.insert(schema.companies).values({
      id: "co-new", name: "New", cuit: "20777777777", color: "#000000",
    });
    const result = await calcularProyeccion(
      { companyIds: ["co-new"], horizonte: 30 },
      db as any
    );
    expect(result.dataQuality).toBe("saldo_inicial_required");
    expect(result.proyeccion).toHaveLength(0);
    expect(result.saldoActual).toBeNull();
  });

  it("flat curve when no AR/AP", async () => {
    const db = await setup();
    const result = await calcularProyeccion(
      { companyIds: ["co-a"], horizonte: 30 },
      db as any
    );
    expect(result.proyeccion).toHaveLength(30);
    // All days should have same saldo (no movements)
    const salidos = result.proyeccion.map((d) => d.saldoProyectado);
    expect(new Set(salidos).size).toBe(1);
  });

  it("cobro on day 5 increases saldo from that day forward", async () => {
    const db = await setup();
    const day5 = futureDate(5);

    await db.insert(schema.comprobantes).values({
      id: "cp-1",
      companyId: "co-a",
      tipo: "venta",
      saldoPendiente: 50_000,
      importeTotal: 50_000,
      moneda: "ARS",
      fechaVencimiento: day5,
      isIntercompany: false,
      contabiliumId: "ext-1",
    });

    const result = await calcularProyeccion(
      { companyIds: ["co-a"], horizonte: 30 },
      db as any
    );

    const day5Point = result.proyeccion.find((d) => d.fecha === day5);
    expect(day5Point?.cobrosDelDia).toBe(50_000);

    // Days after day5 should be 50k higher than before day5
    const before = result.proyeccion.find((d) => d.fecha < day5);
    const after = result.proyeccion.find((d) => d.fecha > day5);
    if (before && after) {
      expect(after.saldoProyectado - before.saldoProyectado).toBeCloseTo(50_000, 0);
    }
  });

  it("detects fecha_tension when saldo goes negative (cubre AE2)", async () => {
    const db = await setup();
    const day10 = futureDate(10);

    await db.insert(schema.comprobantes).values({
      id: "cp-big",
      companyId: "co-a",
      tipo: "compra",
      saldoPendiente: 200_000,
      importeTotal: 200_000,
      moneda: "ARS",
      fechaVencimiento: day10,
      isIntercompany: false,
      contabiliumId: "ext-big",
    });

    const result = await calcularProyeccion(
      { companyIds: ["co-a"], horizonte: 30 },
      db as any
    );

    expect(result.fechaTension).toBe(day10);
    const tensionPoint = result.proyeccion.find((d) => d.fecha === day10);
    expect(tensionPoint?.saldoProyectado).toBeLessThan(0);
  });

  it("manual entry cobro shifts fecha_tension (cubre AE4)", async () => {
    const db = await setup();
    const day10 = futureDate(10);
    const day3 = futureDate(3);
    const userId = "user-x";

    await db.insert(schema.users).values({
      id: userId, name: "X", email: "x@test.com", emailVerified: false,
    });

    // Big payment that would cause tension
    await db.insert(schema.comprobantes).values({
      id: "cp-tension",
      companyId: "co-a",
      tipo: "compra",
      saldoPendiente: 200_000,
      importeTotal: 200_000,
      moneda: "ARS",
      fechaVencimiento: day10,
      isIntercompany: false,
      contabiliumId: "ext-tension",
    });

    // Without manual entry: 100k saldo - 200k payment = tension at day10
    const beforeManual = await calcularProyeccion(
      { companyIds: ["co-a"], horizonte: 30 },
      db as any
    );
    expect(beforeManual.fechaTension).toBe(day10);

    // Add manual entry of 150k cobro on day3
    await db.insert(schema.manualEntries).values({
      id: "me-1",
      companyId: "co-a",
      tipo: "cobro",
      fechaEsperada: day3,
      importe: 150_000,
      moneda: "ARS",
      descripcion: "Préstamo banco",
      createdBy: userId,
    });

    // After manual entry: 100k + 150k (day3) - 200k (day10) = 50k > 0 — no tension
    const afterManual = await calcularProyeccion(
      { companyIds: ["co-a"], horizonte: 30 },
      db as any
    );
    const tensionPoint = afterManual.proyeccion.find((d) => d.fecha === day10);
    expect(tensionPoint?.saldoProyectado).toBeGreaterThan(0);
    expect(afterManual.fechaTension).toBeNull();
  });

  it("excludes intercompany when excluirIntercompany = true (cubre AE1)", async () => {
    const db = await setup();
    const day5 = futureDate(5);

    await db.insert(schema.comprobantes).values([
      {
        id: "cp-interco",
        companyId: "co-a",
        tipo: "venta",
        saldoPendiente: 50_000,
        importeTotal: 50_000,
        moneda: "ARS",
        fechaVencimiento: day5,
        isIntercompany: true,
        contabiliumId: "ext-ic",
      },
      {
        id: "cp-normal",
        companyId: "co-a",
        tipo: "venta",
        saldoPendiente: 20_000,
        importeTotal: 20_000,
        moneda: "ARS",
        fechaVencimiento: day5,
        isIntercompany: false,
        contabiliumId: "ext-norm",
      },
    ]);

    const withInterco = await calcularProyeccion(
      { companyIds: ["co-a"], horizonte: 30, excluirIntercompany: false },
      db as any
    );

    const withoutInterco = await calcularProyeccion(
      { companyIds: ["co-a"], horizonte: 30, excluirIntercompany: true },
      db as any
    );

    const dayWith = withInterco.proyeccion.find((d) => d.fecha === day5);
    const dayWithout = withoutInterco.proyeccion.find((d) => d.fecha === day5);

    expect(dayWith?.cobrosDelDia).toBe(70_000); // 50k + 20k
    expect(dayWithout?.cobrosDelDia).toBe(20_000); // only normal
  });

  it("returns 90 day array with stable saldo when no movements", async () => {
    const db = await setup();
    const result = await calcularProyeccion(
      { companyIds: ["co-a"], horizonte: 90 },
      db as any
    );
    expect(result.proyeccion).toHaveLength(90);
    expect(result.fechaTension).toBeNull();
  });
});

describe("calcularProyeccion — consolidated", () => {
  it("consolidado = suma de 3 empresas sin intercompany (cubre AE1 integration)", async () => {
    const db = await setup();
    const resultA = await calcularProyeccion(
      { companyIds: ["co-a"], horizonte: 30 },
      db as any
    );
    const resultB = await calcularProyeccion(
      { companyIds: ["co-b"], horizonte: 30 },
      db as any
    );
    const resultC = await calcularProyeccion(
      { companyIds: ["co-c"], horizonte: 30 },
      db as any
    );
    const consolidated = await calcularProyeccion(
      { companyIds: ["co-a", "co-b", "co-c"], horizonte: 30 },
      db as any
    );

    // Saldo actual should be sum of individual saldos
    const expectedSaldo =
      (resultA.saldoActual ?? 0) +
      (resultB.saldoActual ?? 0) +
      (resultC.saldoActual ?? 0);

    expect(consolidated.saldoActual).toBeCloseTo(expectedSaldo, 0);
  });
});
