import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { exchangeRates } from "@/lib/db/schema";
import { requireRole, AuthorizationError } from "@/lib/auth/rbac";
import { logAudit } from "@/lib/audit/logger";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { companyId, tipo, valorArsPorUsd, fechaVigencia } = body;

  if (!companyId || !tipo || !valorArsPorUsd || !fechaVigencia) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (valorArsPorUsd <= 0) {
    return NextResponse.json({ error: "Rate must be positive" }, { status: 400 });
  }

  try {
    await requireRole(session.user.id, companyId, "admin");
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  const rateId = randomUUID();
  await db.insert(exchangeRates).values({
    id: rateId,
    companyId,
    tipo,
    valorArsPorUsd,
    fechaVigencia,
  });

  await logAudit({
    userId: session.user.id,
    action: "create",
    tableName: "exchange_rates",
    recordId: rateId,
    newValue: { companyId, tipo, valorArsPorUsd, fechaVigencia },
  });

  return NextResponse.json({ ok: true });
}
