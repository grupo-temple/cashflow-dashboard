import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { userCompanyRoles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { SyncEngine, isLocked } from "@/lib/sync/engine";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require admin role in at least one company
  const adminRoles = await db
    .select()
    .from(userCompanyRoles)
    .where(
      and(
        eq(userCompanyRoles.userId, session.user.id),
        eq(userCompanyRoles.role, "admin")
      )
    )
    .limit(1);

  if (adminRoles.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (await isLocked()) {
    return NextResponse.json(
      { error: "Sync already running" },
      { status: 409 }
    );
  }

  const engine = new SyncEngine();
  const results = await engine.runAll();

  return NextResponse.json({ companies: results });
}
