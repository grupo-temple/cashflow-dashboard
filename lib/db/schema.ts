import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── Companies ────────────────────────────────────────────────────────────────

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3B82F6"),
  cuit: text("cuit").notNull().unique(),
  contabiliumCredentialId: text("contabilium_credential_id").references(
    () => contabiliumCredentials.id,
    { onDelete: "set null" }
  ),
  exchangeRateType: text("exchange_rate_type", {
    enum: ["oficial", "mep", "ccl"],
  })
    .notNull()
    .default("oficial"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Contabilium Credentials ───────────────────────────────────────────────────

export const contabiliumCredentials = sqliteTable("contabilium_credentials", {
  id: text("id").primaryKey(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  tokenCacheEncrypted: text("token_cache_encrypted"),
  tokenExpiresAt: text("token_expires_at"),
  credentialType: text("credential_type", {
    enum: ["multi_empresa", "individual"],
  }).notNull(),
  empresaSelectorValue: text("empresa_selector_value"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Sync Logs ─────────────────────────────────────────────────────────────────

export const syncLogs = sqliteTable(
  "sync_logs",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    status: text("status", {
      enum: ["pending", "success", "error", "timeout"],
    }).notNull(),
    errorCode: text("error_code"),
    errorHttpStatus: integer("error_http_status"),
  },
  (t) => [index("sync_logs_company_started_idx").on(t.companyId, t.startedAt)]
);

// ── Comprobantes (AR/AP invoices) ─────────────────────────────────────────────

export const comprobantes = sqliteTable(
  "comprobantes",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: ["venta", "compra"] }).notNull(),
    numero: text("numero"),
    cuitContraparte: text("cuit_contraparte"),
    razonSocialContraparte: text("razon_social_contraparte"),
    fechaEmision: text("fecha_emision"),
    fechaVencimiento: text("fecha_vencimiento"),
    importeTotal: real("importe_total").notNull().default(0),
    saldoPendiente: real("saldo_pendiente").notNull().default(0),
    moneda: text("moneda", { enum: ["ARS", "USD"] }).notNull().default("ARS"),
    isIntercompany: integer("is_intercompany", { mode: "boolean" })
      .notNull()
      .default(false),
    contabiliumId: text("contabilium_id").notNull().unique(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("comprobantes_company_vencimiento_idx").on(
      t.companyId,
      t.fechaVencimiento
    ),
    index("comprobantes_company_tipo_idx").on(t.companyId, t.tipo),
  ]
);

// ── Movimientos (cobros / pagos) ──────────────────────────────────────────────

export const movimientos = sqliteTable(
  "movimientos",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: ["cobro", "pago"] }).notNull(),
    fecha: text("fecha").notNull(),
    importe: real("importe").notNull(),
    moneda: text("moneda", { enum: ["ARS", "USD"] }).notNull().default("ARS"),
    comprobanteId: text("comprobante_id").references(() => comprobantes.id, {
      onDelete: "set null",
    }),
    descripcion: text("descripcion"),
    contabiliumId: text("contabilium_id").notNull().unique(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("movimientos_company_fecha_idx").on(t.companyId, t.fecha),
    index("movimientos_company_tipo_idx").on(t.companyId, t.tipo),
  ]
);

// ── Manual Entries ────────────────────────────────────────────────────────────

export const manualEntries = sqliteTable(
  "manual_entries",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: ["cobro", "pago"] }).notNull(),
    fechaEsperada: text("fecha_esperada").notNull(),
    importe: real("importe").notNull(),
    moneda: text("moneda", { enum: ["ARS", "USD"] }).notNull().default("ARS"),
    descripcion: text("descripcion").notNull(),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("manual_entries_company_fecha_idx").on(
      t.companyId,
      t.fechaEsperada
    ),
  ]
);

// ── Saldos Iniciales ──────────────────────────────────────────────────────────

export const saldosIniciales = sqliteTable(
  "saldos_iniciales",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    cuentaNombre: text("cuenta_nombre").notNull(),
    saldo: real("saldo").notNull(),
    moneda: text("moneda", { enum: ["ARS", "USD"] }).notNull().default("ARS"),
    fechaArqueo: text("fecha_arqueo").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index("saldos_company_idx").on(t.companyId)]
);

// ── Exchange Rates ────────────────────────────────────────────────────────────

export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: ["oficial", "mep", "ccl"] }).notNull(),
    valorArsPorUsd: real("valor_ars_por_usd").notNull(),
    fechaVigencia: text("fecha_vigencia").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("exchange_rates_company_fecha_idx").on(
      t.companyId,
      t.fechaVigencia
    ),
  ]
);

// ── Alert Configs ─────────────────────────────────────────────────────────────

export const alertConfigs = sqliteTable("alert_configs", {
  id: text("id").primaryKey(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  tipo: text("tipo", { enum: ["saldo_bajo", "factura_vencida"] }).notNull(),
  umbral: real("umbral"),
  diasAnticipacion: integer("dias_anticipacion"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Alertas Activas ───────────────────────────────────────────────────────────

export const alertasActivas = sqliteTable(
  "alertas_activas",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: ["saldo_bajo", "factura_vencida"] }).notNull(),
    mensaje: text("mensaje").notNull(),
    severidad: text("severidad", {
      enum: ["info", "warning", "critical"],
    }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    resolvedAt: text("resolved_at"),
  },
  (t) => [
    index("alertas_company_resolved_idx").on(t.companyId, t.resolvedAt),
  ]
);

// ── Audit Log (append-only) ───────────────────────────────────────────────────

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    action: text("action", { enum: ["create", "update", "delete"] }).notNull(),
    tableName: text("table_name").notNull(),
    recordId: text("record_id").notNull(),
    oldValueJson: text("old_value_json"),
    newValueJson: text("new_value_json"),
    timestamp: text("timestamp")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("audit_log_table_record_idx").on(t.tableName, t.recordId),
    index("audit_log_timestamp_idx").on(t.timestamp),
  ]
);

// ── Better Auth — generated tables ───────────────────────────────────────────
// These are created by the Better Auth adapter. Defined here so Drizzle
// includes them in migrations and can reference them via FK.

export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: text("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: text("access_token_expires_at"),
  refreshTokenExpiresAt: text("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const verifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// ── User Company Roles (source of truth for RBAC) ────────────────────────────

export const userCompanyRoles = sqliteTable(
  "user_company_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["admin", "operator", "reader"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.companyId] }),
    index("user_company_roles_company_idx").on(t.companyId),
  ]
);

// ── Type exports ──────────────────────────────────────────────────────────────

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type ContabiliumCredential = typeof contabiliumCredentials.$inferSelect;
export type NewContabiliumCredential =
  typeof contabiliumCredentials.$inferInsert;

export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;

export type Comprobante = typeof comprobantes.$inferSelect;
export type NewComprobante = typeof comprobantes.$inferInsert;

export type Movimiento = typeof movimientos.$inferSelect;
export type NewMovimiento = typeof movimientos.$inferInsert;

export type ManualEntry = typeof manualEntries.$inferSelect;
export type NewManualEntry = typeof manualEntries.$inferInsert;

export type SaldoInicial = typeof saldosIniciales.$inferSelect;
export type NewSaldoInicial = typeof saldosIniciales.$inferInsert;

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;

export type AlertConfig = typeof alertConfigs.$inferSelect;
export type NewAlertConfig = typeof alertConfigs.$inferInsert;

export type AlertaActiva = typeof alertasActivas.$inferSelect;
export type NewAlertaActiva = typeof alertasActivas.$inferInsert;

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type UserCompanyRole = typeof userCompanyRoles.$inferSelect;
export type NewUserCompanyRole = typeof userCompanyRoles.$inferInsert;
