import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { manualEntries } from "@/lib/db/schema";
import { requireRole, AuthorizationError } from "@/lib/auth/rbac";
import { logAudit } from "@/lib/audit/logger";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { companyId, tipo, fechaEsperada, importe, moneda, descripcion } = body;

  if (!companyId || !tipo || !fechaEsperada || !importe || !descripcion) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (!["cobro", "pago"].includes(tipo)) {
    return NextResponse.json({ error: "Invalid tipo" }, { status: 400 });
  }

  if (importe <= 0) {
    return NextResponse.json({ error: "Importe must be positive" }, { status: 400 });
  }

  try {
    await requireRole(session.user.id, companyId, "operator");
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw e;
  }

  const entryId = randomUUID();
  await db.insert(manualEntries).values({
    id: entryId,
    companyId,
    tipo,
    fechaEsperada,
    importe,
    moneda: moneda ?? "ARS",
    descripcion,
    createdBy: session.user.id,
  });

  await logAudit({
    userId: session.user.id,
    action: "create",
    tableName: "manual_entries",
    recordId: entryId,
    newValue: { companyId, tipo, fechaEsperada, importe, descripcion },
  });

  revalidatePath(`/empresa/${companyId}`);
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}
