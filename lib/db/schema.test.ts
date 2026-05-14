import { describe, it, expect } from "vitest";
import {
  companies,
  contabiliumCredentials,
  syncLogs,
  comprobantes,
  movimientos,
  manualEntries,
  saldosIniciales,
  exchangeRates,
  alertConfigs,
  alertasActivas,
  auditLog,
  users,
  sessions,
  accounts,
  verifications,
  userCompanyRoles,
} from "./schema";

describe("schema exports", () => {
  it("exports all tables", () => {
    const tables = [
      companies,
      contabiliumCredentials,
      syncLogs,
      comprobantes,
      movimientos,
      manualEntries,
      saldosIniciales,
      exchangeRates,
      alertConfigs,
      alertasActivas,
      auditLog,
      users,
      sessions,
      accounts,
      verifications,
      userCompanyRoles,
    ];
    for (const t of tables) {
      expect(t).toBeDefined();
    }
  });

  it("companies has required columns", () => {
    const cols = Object.keys(companies);
    expect(cols).toContain("id");
    expect(cols).toContain("name");
    expect(cols).toContain("cuit");
    expect(cols).toContain("color");
  });

  it("comprobantes has is_intercompany and contabilium_id", () => {
    const cols = Object.keys(comprobantes);
    expect(cols).toContain("isIntercompany");
    expect(cols).toContain("contabiliumId");
  });

  it("syncLogs has error_code and error_http_status (no error_message)", () => {
    const cols = Object.keys(syncLogs);
    expect(cols).toContain("errorCode");
    expect(cols).toContain("errorHttpStatus");
    expect(cols).not.toContain("errorMessage");
  });

  it("alertasActivas has severidad and resolved_at", () => {
    const cols = Object.keys(alertasActivas);
    expect(cols).toContain("severidad");
    expect(cols).toContain("resolvedAt");
  });

  it("userCompanyRoles has composite primary key fields", () => {
    const cols = Object.keys(userCompanyRoles);
    expect(cols).toContain("userId");
    expect(cols).toContain("companyId");
    expect(cols).toContain("role");
  });

  it("auditLog has all required audit fields", () => {
    const cols = Object.keys(auditLog);
    expect(cols).toContain("userId");
    expect(cols).toContain("action");
    expect(cols).toContain("tableName");
    expect(cols).toContain("recordId");
    expect(cols).toContain("oldValueJson");
    expect(cols).toContain("newValueJson");
  });

  it("type inference works — infer types without throwing", () => {
    type C = typeof companies.$inferSelect;
    type NC = typeof companies.$inferInsert;
    type UCR = typeof userCompanyRoles.$inferSelect;
    // If TypeScript compiles this, the types are valid
    const _check: [C, NC, UCR] = [] as unknown as [C, NC, UCR];
    expect(_check).toBeDefined();
  });
});
