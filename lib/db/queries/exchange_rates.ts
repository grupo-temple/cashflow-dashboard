import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { exchangeRates } from "@/lib/db/schema";
import type { DB } from "@/lib/db";

export async function getLatestExchangeRate(
  companyId: string,
  database: DB = db
) {
  const [row] = await database
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.companyId, companyId))
    .orderBy(desc(exchangeRates.fechaVigencia))
    .limit(1);
  return row ?? null;
}

export async function getAllExchangeRates(
  companyId: string,
  database: DB = db
) {
  return database
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.companyId, companyId))
    .orderBy(desc(exchangeRates.fechaVigencia));
}

export function convertArsToUsd(
  amountArs: number,
  rateArsPorUsd: number
): number {
  return amountArs / rateArsPorUsd;
}

export function convertUsdToArs(
  amountUsd: number,
  rateArsPorUsd: number
): number {
  return amountUsd * rateArsPorUsd;
}

export function formatDualCurrency(
  amountArs: number,
  rateArsPorUsd: number | null
): { ars: number; usd: number | null } {
  return {
    ars: amountArs,
    usd: rateArsPorUsd ? convertArsToUsd(amountArs, rateArsPorUsd) : null,
  };
}
