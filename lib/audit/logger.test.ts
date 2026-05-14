import { describe, it, expect } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/lib/db/schema";
import { logAudit } from "./logger";

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
  return db;
}

describe("logAudit", () => {
  it("inserts an audit log entry", async () => {
    const db = await setupDb();

    await logAudit(
      {
        userId: "user-1",
        action: "create",
        tableName: "companies",
        recordId: "co-1",
        newValue: { name: "ACME" },
      },
      db as any
    );

    const rows = await db.select().from(schema.auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("create");
    expect(rows[0].tableName).toBe("companies");
    expect(rows[0].recordId).toBe("co-1");
    expect(rows[0].userId).toBe("user-1");
    expect(JSON.parse(rows[0].newValueJson!)).toEqual({ name: "ACME" });
    expect(rows[0].oldValueJson).toBeNull();
  });

  it("works without userId (system action)", async () => {
    const db = await setupDb();

    await logAudit(
      {
        action: "delete",
        tableName: "manual_entries",
        recordId: "me-99",
      },
      db as any
    );

    const rows = await db.select().from(schema.auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBeNull();
    expect(rows[0].action).toBe("delete");
  });

  it("stores oldValue and newValue for updates", async () => {
    const db = await setupDb();

    await logAudit(
      {
        userId: "user-2",
        action: "update",
        tableName: "exchange_rates",
        recordId: "er-1",
        oldValue: { valorArsPorUsd: 1000 },
        newValue: { valorArsPorUsd: 1050 },
      },
      db as any
    );

    const rows = await db.select().from(schema.auditLog);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].oldValueJson!)).toEqual({ valorArsPorUsd: 1000 });
    expect(JSON.parse(rows[0].newValueJson!)).toEqual({ valorArsPorUsd: 1050 });
  });

  it("accumulates multiple entries", async () => {
    const db = await setupDb();

    await logAudit({ action: "create", tableName: "t", recordId: "1" }, db as any);
    await logAudit({ action: "update", tableName: "t", recordId: "1" }, db as any);
    await logAudit({ action: "delete", tableName: "t", recordId: "1" }, db as any);

    const rows = await db.select().from(schema.auditLog);
    expect(rows).toHaveLength(3);
  });
});
