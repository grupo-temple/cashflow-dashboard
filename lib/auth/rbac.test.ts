import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/lib/db/schema";
import { requireRole, getAuthorizedCompanyIds, AuthorizationError } from "./rbac";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_PATH = path.resolve(__dirname, "../../drizzle/migrations");

function makeTestDb() {
  const client = createClient({ url: ":memory:" });
  return drizzle(client, { schema });
}

async function setupDb() {
  const database = makeTestDb();
  await migrate(database, { migrationsFolder: MIGRATIONS_PATH });

  await database.insert(schema.users).values([
    { id: "user-admin", name: "Admin", email: "admin@test.com", emailVerified: false },
    { id: "user-op", name: "Operator", email: "op@test.com", emailVerified: false },
    { id: "user-reader", name: "Reader", email: "reader@test.com", emailVerified: false },
    { id: "user-none", name: "NoAccess", email: "none@test.com", emailVerified: false },
  ]);

  await database.insert(schema.companies).values([
    { id: "co-1", name: "Empresa 1", cuit: "20111111111", color: "#FF0000" },
    { id: "co-2", name: "Empresa 2", cuit: "20222222222", color: "#00FF00" },
  ]);

  await database.insert(schema.userCompanyRoles).values([
    { userId: "user-admin", companyId: "co-1", role: "admin" },
    { userId: "user-op", companyId: "co-1", role: "operator" },
    { userId: "user-reader", companyId: "co-1", role: "reader" },
    { userId: "user-reader", companyId: "co-2", role: "reader" },
    { userId: "user-admin", companyId: "co-2", role: "admin" },
  ]);

  return database;
}

describe("requireRole", () => {
  it("returns companyId when user has exact required role", async () => {
    const db = await setupDb();
    const result = await requireRole("user-admin", "co-1", "admin", db as any);
    expect(result).toBe("co-1");
  });

  it("allows operator to satisfy reader requirement (hierarchy)", async () => {
    const db = await setupDb();
    const result = await requireRole("user-op", "co-1", "reader", db as any);
    expect(result).toBe("co-1");
  });

  it("allows admin to satisfy operator requirement", async () => {
    const db = await setupDb();
    const result = await requireRole("user-admin", "co-1", "operator", db as any);
    expect(result).toBe("co-1");
  });

  it("throws when user has lower role than required", async () => {
    const db = await setupDb();
    await expect(
      requireRole("user-reader", "co-1", "operator", db as any)
    ).rejects.toThrow(AuthorizationError);
  });

  it("throws when user has no role in the company", async () => {
    const db = await setupDb();
    await expect(
      requireRole("user-none", "co-1", "reader", db as any)
    ).rejects.toThrow(AuthorizationError);
  });

  it("throws when user has no role in a specific company even if they have it in another", async () => {
    const db = await setupDb();
    // user-op has operator in co-1, but nothing in co-2
    await expect(
      requireRole("user-op", "co-2", "reader", db as any)
    ).rejects.toThrow(AuthorizationError);
  });
});

describe("getAuthorizedCompanyIds", () => {
  it("returns all companies where user has at least reader", async () => {
    const db = await setupDb();
    const ids = await getAuthorizedCompanyIds("user-reader", "reader", db as any);
    expect(ids).toContain("co-1");
    expect(ids).toContain("co-2");
  });

  it("returns only admin companies for admin role filter", async () => {
    const db = await setupDb();
    const ids = await getAuthorizedCompanyIds("user-admin", "admin", db as any);
    expect(ids).toContain("co-1");
    expect(ids).toContain("co-2");
  });

  it("returns empty array for user with no roles", async () => {
    const db = await setupDb();
    const ids = await getAuthorizedCompanyIds("user-none", "reader", db as any);
    expect(ids).toHaveLength(0);
  });
});
