import { NextRequest, NextResponse } from "next/server";
import { SyncEngine, isLocked } from "@/lib/sync/engine";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
