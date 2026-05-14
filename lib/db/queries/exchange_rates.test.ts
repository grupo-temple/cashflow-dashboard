import { describe, it, expect } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/lib/db/schema";
import {
  getLatestExchangeRate,
  convertArsToUsd,
  convertUsdToArs,
  formatDualCurrency,
} from "./exchange_rates";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_PATH = path.resolve(__dirname, "../../../drizzle/migrations");

async function setup() {
  const db = drizzle(createClient({ url: ":memory:" }), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_PATH });

  await db.insert(schema.companies).values({
    id: "co-fx",
    name: "FX Test",
    cuit: "20666666666",
    color: "#AABBCC",
  });

  await db.insert(schema.exchangeRates).values([
    { id: "er-old", companyId: "co-fx", tipo: "oficial", valorArsPorUsd: 1000, fechaVigencia: "2026-01-01" },
    { id: "er-new", companyId: "co-fx", tipo: "mep", valorArsPorUsd: 1200, fechaVigencia: "2026-05-01" },
  ]);

  return db;
}

describe("getLatestExchangeRate", () => {
  it("returns the most recent rate (mayor fecha_vigencia)", async () => {
    const db = await setup();
    const rate = await getLatestExchangeRate("co-fx", db as any);
    expect(rate?.valorArsPorUsd).toBe(1200);
    expect(rate?.fechaVigencia).toBe("2026-05-01");
  });

  it("returns null when no rate exists", async () => {
    const db = await setup();
    const rate = await getLatestExchangeRate("co-nonexistent", db as any);
    expect(rate).toBeNull();
  });
});

describe("currency conversion", () => {
  it("ARS to USD: 12000 ARS / 1200 = 10 USD", () => {
    expect(convertArsToUsd(12_000, 1200)).toBe(10);
  });

  it("USD to ARS: 10 USD × 1200 = 12000 ARS", () => {
    expect(convertUsdToArs(10, 1200)).toBe(12_000);
  });

  it("formatDualCurrency returns null USD when no rate", () => {
    const result = formatDualCurrency(50_000, null);
    expect(result.ars).toBe(50_000);
    expect(result.usd).toBeNull();
  });

  it("formatDualCurrency computes USD correctly", () => {
    const result = formatDualCurrency(120_000, 1200);
    expect(result.usd).toBe(100);
  });
});
