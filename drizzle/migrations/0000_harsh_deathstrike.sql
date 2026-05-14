CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` text,
	`refresh_token_expires_at` text,
	`scope` text,
	`password` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `alert_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`tipo` text NOT NULL,
	`umbral` real,
	`dias_anticipacion` integer,
	`activo` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `alertas_activas` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`tipo` text NOT NULL,
	`mensaje` text NOT NULL,
	`severidad` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alertas_company_resolved_idx` ON `alertas_activas` (`company_id`,`resolved_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`old_value_json` text,
	`new_value_json` text,
	`timestamp` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_table_record_idx` ON `audit_log` (`table_name`,`record_id`);--> statement-breakpoint
CREATE INDEX `audit_log_timestamp_idx` ON `audit_log` (`timestamp`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#3B82F6' NOT NULL,
	`cuit` text NOT NULL,
	`contabilium_credential_id` text,
	`exchange_rate_type` text DEFAULT 'oficial' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`contabilium_credential_id`) REFERENCES `contabilium_credentials`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_cuit_unique` ON `companies` (`cuit`);--> statement-breakpoint
CREATE TABLE `comprobantes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`tipo` text NOT NULL,
	`numero` text,
	`cuit_contraparte` text,
	`razon_social_contraparte` text,
	`fecha_emision` text,
	`fecha_vencimiento` text,
	`importe_total` real DEFAULT 0 NOT NULL,
	`saldo_pendiente` real DEFAULT 0 NOT NULL,
	`moneda` text DEFAULT 'ARS' NOT NULL,
	`is_intercompany` integer DEFAULT false NOT NULL,
	`contabilium_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comprobantes_contabilium_id_unique` ON `comprobantes` (`contabilium_id`);--> statement-breakpoint
CREATE INDEX `comprobantes_company_vencimiento_idx` ON `comprobantes` (`company_id`,`fecha_vencimiento`);--> statement-breakpoint
CREATE INDEX `comprobantes_company_tipo_idx` ON `comprobantes` (`company_id`,`tipo`);--> statement-breakpoint
CREATE TABLE `contabilium_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_encrypted` text NOT NULL,
	`token_cache_encrypted` text,
	`token_expires_at` text,
	`credential_type` text NOT NULL,
	`empresa_selector_value` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`tipo` text NOT NULL,
	`valor_ars_por_usd` real NOT NULL,
	`fecha_vigencia` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exchange_rates_company_fecha_idx` ON `exchange_rates` (`company_id`,`fecha_vigencia`);--> statement-breakpoint
CREATE TABLE `manual_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`tipo` text NOT NULL,
	`fecha_esperada` text NOT NULL,
	`importe` real NOT NULL,
	`moneda` text DEFAULT 'ARS' NOT NULL,
	`descripcion` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `manual_entries_company_fecha_idx` ON `manual_entries` (`company_id`,`fecha_esperada`);--> statement-breakpoint
CREATE TABLE `movimientos` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`tipo` text NOT NULL,
	`fecha` text NOT NULL,
	`importe` real NOT NULL,
	`moneda` text DEFAULT 'ARS' NOT NULL,
	`comprobante_id` text,
	`descripcion` text,
	`contabilium_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comprobante_id`) REFERENCES `comprobantes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movimientos_contabilium_id_unique` ON `movimientos` (`contabilium_id`);--> statement-breakpoint
CREATE INDEX `movimientos_company_fecha_idx` ON `movimientos` (`company_id`,`fecha`);--> statement-breakpoint
CREATE INDEX `movimientos_company_tipo_idx` ON `movimientos` (`company_id`,`tipo`);--> statement-breakpoint
CREATE TABLE `saldos_iniciales` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`cuenta_nombre` text NOT NULL,
	`saldo` real NOT NULL,
	`moneda` text DEFAULT 'ARS' NOT NULL,
	`fecha_arqueo` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `saldos_company_idx` ON `saldos_iniciales` (`company_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	`token` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`error_code` text,
	`error_http_status` integer,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_logs_company_started_idx` ON `sync_logs` (`company_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `user_company_roles` (
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`user_id`, `company_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_company_roles_company_idx` ON `user_company_roles` (`company_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
