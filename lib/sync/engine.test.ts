import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { fileURLToPath } from "url";
import path from "path";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SyncEngine, isLocked } from "./engine";
import { encrypt } from "@/lib/crypto/field-encrypt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_PATH = path.resolve(__dirname, "../../drizzle/migrations");

// ── In-memory DB setup ───────────────────────────────────────────────────────

function makeTestDb() {
  const client = createClient({ url: ":memory:" });
  return drizzle(client, { schema });
}

// ── MSW server ───────────────────────────────────────────────────────────────

const BASE_URL = "https://api.contabilium.com/v1";

const server = setupServer(
  http.post(`${BASE_URL}/ObtenerToken`, () =>
    HttpResponse.json({
      access_token: "test-token",
      expires_in: 3600,
      token_type: "Bearer",
    })
  ),
  http.get(`${BASE_URL}/comprobantes/venta`, () =>
    HttpResponse.json({
      data: [{ id: 101, fecha_vencimiento: "30/06/2026", importe_total: 500, saldo: 500, cuit: "20999999999" }],
      total: 1,
      per_page: 100,
    })
  ),
  http.get(`${BASE_URL}/comprobantes/compra`, () =>
    HttpResponse.json({ data: [], total: 0, per_page: 100 })
  ),
  http.get(`${BASE_URL}/cobros`, () =>
    HttpResponse.json({ data: [], total: 0, per_page: 100 })
  ),
  http.get(`${BASE_URL}/pagos`, () =>
    HttpResponse.json({ data: [], total: 0, per_page: 100 })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ── Test helpers ─────────────────────────────────────────────────────────────

const TEST_KEY = "b".repeat(64);

async function seedDb(database: ReturnType<typeof makeTestDb>) {
  await migrate(database, { migrationsFolder: MIGRATIONS_PATH });

  process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
  const encryptedKey = encrypt("test-api-key");

  await database.insert(schema.contabiliumCredentials).values({
    id: "cred-1",
    apiKeyEncrypted: encryptedKey,
    credentialType: "individual",
  });

  await database.insert(schema.companies).values([
    { id: "co-a", name: "Empresa A", cuit: "20111111111", color: "#FF0000", contabiliumCredentialId: "cred-1" },
    { id: "co-b", name: "Empresa B", cuit: "20222222222", color: "#00FF00", contabiliumCredentialId: "cred-1" },
    { id: "co-c", name: "Empresa C", cuit: "20333333333", color: "#0000FF", contabiliumCredentialId: "cred-1" },
  ]);

  return database;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SyncEngine.runAll", () => {
  it("syncs 3 companies, all return success", async () => {
    const database = await seedDb(makeTestDb());
    const engine = new SyncEngine(database as any);
    const results = await engine.runAll();
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "success")).toBe(true);
  });

  it("upserts comprobante — second sync does not duplicate", async () => {
    // Mock returns id:101 for all companies → 1 unique contabilium_id in DB.
    // Running sync twice must still yield 1 row (upsert idempotency check).
    const database = await seedDb(makeTestDb());
    const engine = new SyncEngine(database as any);
    await engine.runAll();
    const countAfterFirst = await database
      .select()
      .from(schema.comprobantes);
    await engine.runAll();
    const countAfterSecond = await database
      .select()
      .from(schema.comprobantes);
    expect(countAfterSecond).toHaveLength(countAfterFirst.length);
  });

  it("marks intercompany when CUIT matches another group company", async () => {
    server.use(
      http.get(`${BASE_URL}/comprobantes/venta`, () =>
        HttpResponse.json({
          data: [{ id: 200, importe_total: 100, saldo: 100, cuit: "20222222222" }],
          total: 1,
          per_page: 100,
        })
      )
    );

    const database = await seedDb(makeTestDb());
    const engine = new SyncEngine(database as any);
    await engine.runAll();

    const interco = await database
      .select()
      .from(schema.comprobantes)
      .where(eq(schema.comprobantes.isIntercompany, true));

    expect(interco.length).toBeGreaterThan(0);
  });

  it("empresa B error does not prevent A and C from succeeding", async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE_URL}/comprobantes/venta`, ({ request }) => {
        callCount++;
        // Third call simulates empresa B failing (roughly)
        if (callCount === 3) {
          return new HttpResponse(null, { status: 500 });
        }
        return HttpResponse.json({ data: [], total: 0, per_page: 100 });
      })
    );

    const database = await seedDb(makeTestDb());
    const engine = new SyncEngine(database as any);
    const results = await engine.runAll();
    const successCount = results.filter((r) => r.status === "success").length;
    expect(successCount).toBeGreaterThanOrEqual(2);
  });
});

describe("isLocked", () => {
  it("returns false when no sync running", async () => {
    const database = await seedDb(makeTestDb());
    expect(await isLocked(database as any)).toBe(false);
  });

  it("returns true when a sync started < 6 min ago with no finishedAt", async () => {
    const database = await seedDb(makeTestDb());
    await database.insert(schema.syncLogs).values({
      id: "log-1",
      companyId: "co-a",
      startedAt: new Date().toISOString(),
      status: "pending",
    });
    expect(await isLocked(database as any)).toBe(true);
  });
});
