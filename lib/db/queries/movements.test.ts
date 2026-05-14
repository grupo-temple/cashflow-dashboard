import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/lib/db/schema";
import { getCompanyPosition } from "./movements";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_PATH = path.resolve(__dirname, "../../../drizzle/migrations");

function makeDb() {
  return drizzle(createClient({ url: ":memory:" }), { schema });
}

async function setup() {
  const db = makeDb();
  await migrate(db, { migrationsFolder: MIGRATIONS_PATH });

  await db.insert(schema.companies).values({
    id: "co-test",
    name: "Test Co",
    cuit: "20555555555",
    color: "#123456",
  });

  // Saldo inicial: 100_000 ARS on 2026-01-01
  await db.insert(schema.saldosIniciales).values({
    id: "si-1",
    companyId: "co-test",
    cuentaNombre: "Cuenta Principal",
    saldo: 100_000,
    moneda: "ARS",
    fechaArqueo: "2026-01-01",
  });

  // Cobros
  await db.insert(schema.movimientos).values([
    { id: "m1", companyId: "co-test", tipo: "cobro", fecha: "2026-01-10", importe: 50_000, moneda: "ARS", contabiliumId: "c1" },
    { id: "m2", companyId: "co-test", tipo: "cobro", fecha: "2026-02-05", importe: 30_000, moneda: "ARS", contabiliumId: "c2" },
  ]);

  // Pagos
  await db.insert(schema.movimientos).values([
    { id: "m3", companyId: "co-test", tipo: "pago", fecha: "2026-01-15", importe: 20_000, moneda: "ARS", contabiliumId: "c3" },
  ]);

  return db;
}

describe("getCompanyPosition", () => {
  it("calculates cobros, pagos, and neto for period", async () => {
    const db = await setup();
    const pos = await getCompanyPosition(
      { companyId: "co-test", desde: "2026-01-01", hasta: "2026-01-31" },
      db as any
    );
    expect(pos.cobrosTotal).toBe(50_000);
    expect(pos.pagosTotal).toBe(20_000);
    expect(pos.saldoNeto).toBe(30_000);
  });

  it("calculates saldo actual from saldo_inicial + movements since arqueo", async () => {
    const db = await setup();
    const pos = await getCompanyPosition(
      { companyId: "co-test", desde: "2026-01-01", hasta: "2026-02-28" },
      db as any
    );
    // 100_000 + 50_000 + 30_000 - 20_000 = 160_000
    expect(pos.saldoActual).toBe(160_000);
  });

  it("returns zeros when period has no movements", async () => {
    const db = await setup();
    const pos = await getCompanyPosition(
      { companyId: "co-test", desde: "2026-03-01", hasta: "2026-03-31" },
      db as any
    );
    expect(pos.cobrosTotal).toBe(0);
    expect(pos.pagosTotal).toBe(0);
    expect(pos.saldoNeto).toBe(0);
  });

  it("returns null saldo actual when no saldo_inicial configured", async () => {
    const db = makeDb();
    await migrate(db, { migrationsFolder: MIGRATIONS_PATH });
    await db.insert(schema.companies).values({
      id: "co-new",
      name: "New",
      cuit: "20777777777",
      color: "#000000",
    });

    const pos = await getCompanyPosition(
      { companyId: "co-new", desde: "2026-01-01", hasta: "2026-01-31" },
      db as any
    );
    expect(pos.saldoActual).toBeNull();
    expect(pos.saldoInicialFecha).toBeNull();
  });

  it("marks usdAvailable = false when no exchange rate exists", async () => {
    const db = await setup();
    const pos = await getCompanyPosition(
      { companyId: "co-test", desde: "2026-01-01", hasta: "2026-01-31" },
      db as any
    );
    expect(pos.usdAvailable).toBe(false);
    expect(pos.usdRate).toBeNull();
  });

  it("marks usdAvailable = true when exchange rate exists", async () => {
    const db = await setup();
    await db.insert(schema.exchangeRates).values({
      id: "er-1",
      companyId: "co-test",
      tipo: "oficial",
      valorArsPorUsd: 1200,
      fechaVigencia: "2026-01-01",
    });

    const pos = await getCompanyPosition(
      { companyId: "co-test", desde: "2026-01-01", hasta: "2026-01-31" },
      db as any
    );
    expect(pos.usdAvailable).toBe(true);
    expect(pos.usdRate).toBe(1200);
  });
});
