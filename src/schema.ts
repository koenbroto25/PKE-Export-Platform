const { pgTable, uuid, text, numeric, integer, timestamp, boolean, jsonb, pgEnum } = require("drizzle-orm/pg-core");

// Enums
export const userRoleEnum = pgEnum("user_role", [
  "admin", "pm", "field_manager", "procurement", "checker", 
  "warehouse_manager", "packing_supervisor", "loading_manager", 
  "document_officer", "finance", "cashier", "accounting", 
  "funder", "buyer", "supplier", "transporter", "external_provider"
]);

export const projectStatusEnum = pgEnum("project_status", [
  "draft", "active", "partial", "settled", "closed"
]);

export const trackingEventTypeEnum = pgEnum("tracking_event_type", [
  "departure", "checkpoint", "arrival", "weighbridge", "receipt", "exception"
]);

export const rabCategoryEnum = pgEnum("rab_category", [
  "fixed", "variable", "contingency", "tax", "overhead"
]);

export const fxExposureTypeEnum = pgEnum("fx_exposure_type", [
  "open", "revalued", "realized", "unrealized"
]);

// Core tables
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: userRoleEnum("role").notNull().default("viewer"),
  password_hash: text("password_hash").notNull(),
  mfa_enabled: boolean("mfa_enabled").default(false),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const role_catalog = pgTable("role_catalog", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const role_permissions = pgTable("role_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  role_id: uuid("role_id").notNull().references(() => role_catalog.id),
  permission_id: uuid("permission_id").notNull().references(() => permissions.id),
  granted_by: uuid("granted_by").references(() => users.id),
  granted_at: timestamp("granted_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  contract_program_id: uuid("contract_program_id").notNull().references(() => contract_programs.id).onDelete("cascade"),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  quantity_truncate: numeric("quantity_truncate", { precision: 15, scale: 2 }),
  settlement_unit: text("settlement_unit").notNull(),
  target_quantity: numeric("target_quantity", { precision: 15, scale: 2 }).notNull(),
  started_at: timestamp("started_at"),
  closed_at: timestamp("closed_at"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const project_members = pgTable("project_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull().references(() => projects.id),
  user_id: uuid("user_id").notNull().references(() => users.id),
  role_id: uuid("role_id").references(() => role_catalog.id),
  joined_at: timestamp("joined_at").defaultNow(),
  is_active: boolean("is_active").default(true),
});

export const buyers = pgTable("buyers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  code: text("code").unique(),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const pks_sites = pgTable("pks_sites", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  code: text("code").unique(),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const contracts = pgTable("contracts", {
  id: uuid("id").defaultRandom().primaryKey(),
  buyer_id: uuid("buyer_id").notNull().references(() => buyers.id).onDelete("cascade"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  start_date: timestamp("start_date").notNull(),
  end_date: timestamp("end_date"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const contract_programs = pgTable("contract_programs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  buyer_id: uuid("buyer_id").references(() => buyers.id).onDelete("set null"),
  contract_id: uuid("contract_id").references(() => contracts.id).onDelete("set null"),
  settlement_unit: text("settlement_unit").notNull(),
  target_quantity: numeric("target_quantity", { precision: 15, scale: 2 }).notNull(),
  cadence: text("cadence").notNull(),
  generation_mode: text("generation_mode").notNull().default("scheduled_draft"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const cycle_policies = pgTable("cycle_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  contract_program_id: uuid("contract_program_id").notNull().references(() => contract_programs.id).onDelete("cascade"),
  cadence: text("cadence").notNull(),
  target_quantity: numeric("target_quantity", { precision: 15, scale: 2 }),
  generation_mode: text("generation_mode").notNull(),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Phase 2 entities
export const buyer_parties = pgTable("buyer_parties", {
  id: uuid("id").defaultRandom().primaryKey(),
  buyer_id: uuid("buyer_id").notNull().references(() => buyers.id).onDelete("cascade"),
  name: text("name").notNull(),
  role: text(),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const service_vendors = pgTable("service_vendors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  code: text("code").unique(),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const project_templates = pgTable("project_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  contract_program_id: uuid("contract_program_id").references(() => contract_programs.id).onDelete("set null"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const project_template_versions = pgTable("project_template_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_template_id: uuid("project_template_id").notNull().references(() => project_templates.id).onDelete("cascade"),
  version_number: integer("version_number").notNull(),
  status: text("status").notNull().default("draft"),
  config_snapshot: jsonb("config_snapshot"),
  effective_date: timestamp("effective_date"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const approval_events = pgTable("approval_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  entity_type: text("entity_type").notNull(),
  entity_id: uuid("entity_id").notNull(),
  action: text("action").notNull(),
  approved_by: uuid("approved_by").references(() => users.id),
  status: text("status").notNull().default("pending"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const admin_action_queue = pgTable("admin_action_queue", {
  id: uuid("id").defaultRandom().primaryKey(),
  action_type: text("action_type").notNull(),
  entity_type: text("entity_type").notNull(),
  entity_id: uuid("entity_id").notNull(),
  details: jsonb("details"),
  created_at: timestamp("created_at").defaultNow(),
  resolved_at: timestamp("resolved_at"),
  resolved_by: uuid("resolved_by").references(() => users.id),
  is_resolved: boolean("is_resolved").default(false),
});

export const company_settings = pgTable("company_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  functional_currency: text("functional_currency").notNull().default("IDR"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});