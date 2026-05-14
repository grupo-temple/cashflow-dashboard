import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { alertConfigs, alertasActivas } from "@/lib/db/schema";
import { requireRole, getAuthorizedCompanyIds, AuthorizationError } from "@/lib/auth/rbac";
import { getActiveAlerts } from "@/lib/insights/metrics";
import { logAudit } from "@/lib/audit/logger";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const authorized = await getAuthorizedCompanyIds(session.user.id, "reader");
  if (!authorized.includes(companyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const alerts = await getActiveAlerts(companyId);
  const configs = await db
    .select()
    .from(alertConfigs)
    .where(eq(alertConfigs.companyId, companyId));

  return NextResponse.json({ alerts, configs });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, companyId } = body;

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  try {
    await requireRole(session.user.id, companyId, "admin");
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  if (action === "upsert_config") {
    const { tipo, umbral, diasAnticipacion, activo } = body;
    if (!tipo || !["saldo_bajo", "factura_vencida"].includes(tipo)) {
      return NextResponse.json({ error: "Invalid tipo" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(alertConfigs)
      .where(
        and(
          eq(alertConfigs.companyId, companyId),
          eq(alertConfigs.tipo, tipo)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const oldConfig = existing[0];
      const newValues = { umbral, diasAnticipacion, activo: activo ?? true };
      await db
        .update(alertConfigs)
        .set(newValues)
        .where(eq(alertConfigs.id, oldConfig.id));
      await logAudit({
        userId: session.user.id,
        action: "update",
        tableName: "alert_configs",
        recordId: oldConfig.id,
        oldValue: { umbral: oldConfig.umbral, diasAnticipacion: oldConfig.diasAnticipacion, activo: oldConfig.activo },
        newValue: newValues,
      });
    } else {
      const configId = randomUUID();
      await db.insert(alertConfigs).values({
        id: configId,
        companyId,
        tipo,
        umbral,
        diasAnticipacion,
        activo: activo ?? true,
      });
      await logAudit({
        userId: session.user.id,
        action: "create",
        tableName: "alert_configs",
        recordId: configId,
        newValue: { companyId, tipo, umbral, diasAnticipacion, activo: activo ?? true },
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "resolve_alert") {
    const { alertId } = body;
    if (!alertId) {
      return NextResponse.json({ error: "alertId required" }, { status: 400 });
    }

    await db
      .update(alertasActivas)
      .set({ resolvedAt: new Date().toISOString() })
      .where(
        and(
          eq(alertasActivas.id, alertId),
          eq(alertasActivas.companyId, companyId)
        )
      );

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
