import { pgTable, uuid, text, numeric, integer, timestamp, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";

// Enums
export const userRoleEnum = pgEnum("user_role", [
  "admin", "pm", "field_manager", "procurement", "checker", 
  "warehouse_manager", "packing_supervisor", "loading_manager", 
  "document_officer", "finance", "cashier", "accounting", 
  "funder", "buyer", "supplier", "transporter", "external_provider", "viewer"
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
  neon_auth_user_id: uuid("neon_auth_user_id"),
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
  contract_program_id: uuid("contract_program_id").references(() => contract_programs.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  quantity_tranche: numeric("quantity_tranche", { precision: 15, scale: 2 }),
  settlement_unit: text("settlement_unit").notNull(),
  target_quantity: numeric("target_quantity", { precision: 15, scale: 2 }).notNull(),
  started_at: timestamp("started_at"),
  closed_at: timestamp("closed_at"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
  export_country_code: text("export_country_code"),
});

export const project_roles = pgTable("project_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull().references(() => projects.id),
  role_code: text("role_code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  is_active: boolean("is_active").notNull().default(true),
  created_by: uuid("created_by").references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const project_members = pgTable("project_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull().references(() => projects.id),
  user_id: uuid("user_id").notNull().references(() => users.id),
  role_id: uuid("role_id").references(() => role_catalog.id),
  project_role_id: uuid("project_role_id").references(() => project_roles.id),
  joined_at: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  is_active: boolean("is_active").notNull().default(true),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  deactivated_at: timestamp("deactivated_at", { withTimezone: true }),
  deactivated_by: uuid("deactivated_by").references(() => users.id),
  invited_at: timestamp("invited_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const project_role_permissions = pgTable("project_role_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull().references(() => projects.id),
  project_role_id: uuid("project_role_id").notNull().references(() => project_roles.id),
  permission_id: uuid("permission_id").notNull().references(() => permissions.id),
  granted_by: uuid("granted_by").references(() => users.id),
  granted_at: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
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
  project_id: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  buyer_id: uuid("buyer_id").notNull().references(() => buyers.id, { onDelete: "cascade" }),
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
  project_id: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  buyer_id: uuid("buyer_id").references(() => buyers.id, { onDelete: "set null" }),
  contract_id: uuid("contract_id").references(() => contracts.id, { onDelete: "set null" }),
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
  project_id: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  contract_program_id: uuid("contract_program_id").notNull().references(() => contract_programs.id, { onDelete: "cascade" }),
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
  buyer_id: uuid("buyer_id").notNull().references(() => buyers.id, { onDelete: "cascade" }),
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
  contract_program_id: uuid("contract_program_id").references(() => contract_programs.id, { onDelete: "set null" }),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const project_template_versions = pgTable("project_template_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_template_id: uuid("project_template_id").notNull().references(() => project_templates.id, { onDelete: "cascade" }),
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

export const project_workflows = pgTable("project_workflows", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull(),
  workflow_template_id: uuid("workflow_template_id"),
  version: text("version").default("1.0"),
  status: text("status").notNull().default("active"),
  config_snapshot: jsonb("config_snapshot"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Operational workflow entities (P06)
export const truck_trips = pgTable("truck_trips", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull().references(() => projects.id),
  transport_leg_id: uuid("transport_leg_id").notNull(),
  pks_site_id: uuid("pks_site_id").references(() => pks_sites.id),
  vehicle_id: uuid("vehicle_id").references(() => service_vendors.id),
  driver_name: text("driver_name"),
  license_plate: text("license_plate").notNull(),
  departure_time: timestamp("departure_time"),
  arrival_time: timestamp("arrival_time"),
  status: text("status").notNull().default("scheduled"),
  gps_latitude: numeric("gps_latitude", { precision: 9, scale: 6 }),
  gps_longitude: numeric("gps_longitude", { precision: 10, scale: 6 }),
  gps_accuracy: numeric("gps_accuracy", { precision: 5, scale: 2 }),
  checker_id: uuid("checker_id").references(() => users.id),
  departure_checkpoint_id: uuid("departure_checkpoint_id"),
  arrival_checkpoint_id: uuid("arrival_checkpoint_id"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const tracking_events = pgTable("tracking_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  truck_trip_id: uuid("truck_trip_id").notNull().references(() => truck_trips.id),
  event_type: text("event_type").notNull(),
  checker_id: uuid("checker_id").notNull().references(() => users.id),
  latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 10, scale: 6 }).notNull(),
  gps_accuracy: numeric("gps_accuracy", { precision: 5, scale: 2 }).notNull(),
  source: text("source").notNull().default("checker_device"),
  capture_timestamp: timestamp("capture_timestamp").notNull(),
  server_received_timestamp: timestamp("server_received_timestamp").notNull().defaultNow(),
  qr_scanned: boolean("qr_scanned").notNull().default(false),
  status: text("status").notNull().default("verified"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
});

// Warehouse & inventory (P06)
export const warehouse_receipts = pgTable("warehouse_receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull().references(() => projects.id),
  truck_trip_id: uuid("truck_trip_id").references(() => truck_trips.id),
  lot_id: uuid("lot_id").references(() => inventory_lots.id),
  received_quantity: numeric("received_quantity", { precision: 15, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  condition_status: text("condition_status"),
  exception_reason: text("exception_reason"),
  weighbridge_ticket_key: text("weighbridge_ticket_key"),
  checker_id: uuid("checker_id").notNull().references(() => users.id),
  gps_latitude: numeric("gps_latitude", { precision: 9, scale: 6 }),
  gps_longitude: numeric("gps_longitude", { precision: 10, scale: 6 }),
  gps_accuracy: numeric("gps_accuracy", { precision: 5, scale: 2 }),
  check_timestamp: timestamp("check_timestamp").notNull(),
  received_at: timestamp("received_at").notNull().defaultNow(),
  status: text("status").notNull().default("pending"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const inventory_lots = pgTable("inventory_lots", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull().references(() => projects.id),
  pks_site_id: uuid("pks_site_id").references(() => pks_sites.id),
  quantity: numeric("quantity", { precision: 15, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("MT"),
  location: text("location"),
  status: text("status").notNull().default("incoming"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const inventory_movements = pgTable("inventory_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull().references(() => projects.id),
  lot_id: uuid("lot_id").notNull().references(() => inventory_lots.id),
  warehouse_receipt_id: uuid("warehouse_receipt_id").references(() => warehouse_receipts.id),
  movement_type: text("movement_type").notNull(),
  quantity: numeric("quantity", { precision: 15, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  source_location: text("source_location"),
  destination_location: text("destination_location"),
  reason: text("reason"),
  actor_id: uuid("actor_id").notNull().references(() => users.id),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  reference_id: uuid("reference_id"),
  reference_type: text("reference_type"),
  status: text("status").notNull().default("posted"),
  created_at: timestamp("created_at").defaultNow(),
});

// Finance entities (P07)
export const fx_rates = pgTable("fx_rates", {
  id: uuid("id").defaultRandom().primaryKey(),
  from_currency_id: uuid("from_currency_id").notNull(),
  to_currency_id: uuid("to_currency_id").notNull(),
  rate: numeric("rate", { precision: 18, scale: 6 }).notNull(),
  rate_type: text("rate_type").notNull().default("reference"),
  rate_source: text("rate_source"),
  rate_date: timestamp("rate_date").notNull(),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const fx_exposure = pgTable("fx_exposure", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull().references(() => projects.id),
  amount_idr: numeric("amount_idr", { precision: 18, scale: 2 }),
  amount_fx: numeric("amount_fx", { precision: 18, scale: 2 }),
  fx_rate: numeric("fx_rate", { precision: 18, scale: 6 }),
  exposure_type: text("exposure_type").notNull().default("open"),
  status: text("status").notNull().default("open"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// P07 v1.2 canonical FX exposures table (plural).
export const fx_exposures = pgTable("fx_exposures", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").references(() => projects.id),
  exposure_type: text("exposure_type").notNull(),
  original_currency_id: uuid("original_currency_id").notNull(),
  original_amount: numeric("original_amount", { precision: 18, scale: 2 }).notNull(),
  functional_amount: numeric("functional_amount", { precision: 18, scale: 2 }).notNull(),
  fx_rate: numeric("fx_rate", { precision: 18, scale: 6 }).notNull(),
  fx_date: timestamp("fx_date").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const journal_entries = pgTable("journal_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").references(() => projects.id),
  entry_type: text("entry_type").notNull(),
  reference_id: uuid("reference_id"),
  reference_type: text("reference_type"),
  description: text("description").notNull(),
  entry_date: timestamp("entry_date").notNull().defaultNow(),
  posted_at: timestamp("posted_at"),
  status: text("status").notNull().default("draft"),
  posted_by: uuid("posted_by").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const journal_lines = pgTable("journal_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  journal_entry_id: uuid("journal_entry_id").notNull().references(() => journal_entries.id),
  account_id: uuid("account_id").notNull().references(() => chart_of_accounts.id),
  debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
  description: text("description"),
  line_order: integer("line_order").notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Chart of accounts (P07 GL)
export const chart_of_accounts = pgTable("chart_of_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  parent_id: uuid("parent_id"),
  account_type: text("account_type").notNull(),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ============================================
// Regulatory & compliance documents (P08)
// ============================================

// Regulatory sources
export const regulatory_sources = pgTable("regulatory_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  source_id: text("source_id").notNull().unique(),
  title: text("title").notNull(),
  issuing_authority: text("issuing_authority").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  document_type: text("document_type"),
  regulation_number: text("regulation_number"),
  article_annex_section: text("article_annex_section"),
  publication_date: timestamp("publication_date"),
  effective_date: timestamp("effective_date").notNull(),
  expiry_repeal_date: timestamp("expiry_repeal_date"),
  status: text("status").notNull().default("draft"),
  official_url: text("official_url"),
  source_file_reference: text("source_file_reference"),
  source_checksum: text("source_checksum"),
  date_retrieved: timestamp("date_retrieved"),
  last_reviewed: timestamp("last_reviewed"),
  reviewer_id: uuid("reviewer_id").references(() => users.id),
  verification_status: text("verification_status").notNull().default("pending"),
  related_regulatory_rules: uuid("related_regulatory_rules").array(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

// Export document types
export const export_document_types = pgTable("export_document_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  document_type_id: text("document_type_id").notNull().unique(),
  document_name: text("document_name").notNull(),
  document_category: text("document_category"),
  description: text("description"),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Country export document requirements
export const country_export_document_requirements = pgTable("country_export_document_requirements", {
  id: uuid("id").defaultRandom().primaryKey(),
  country_code: text("country_code").notNull(),
  document_type_id: uuid("document_type_id").notNull().references(() => export_document_types.id),
  importing_authority: text("importing_authority"),
  mandatory: boolean("mandatory").default(true),
  status: text("status").notNull().default("active"),
  effective_from: timestamp("effective_from"),
  effective_to: timestamp("effective_to"),
  official_source_url: text("official_source_url"),
  notes: text("notes"),
  last_verified_at: timestamp("last_verified_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Project export document requirements
export const project_export_document_requirements = pgTable("project_export_document_requirements", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull().references(() => projects.id),
  country_requirement_id: uuid("country_requirement_id").references(() => country_export_document_requirements.id),
  is_required: boolean("is_required").default(true),
  status: text("status").notNull().default("required"),
  override_reason: text("override_reason"),
  overridden_by: uuid("overridden_by").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Project export documents
export const project_export_documents = pgTable("project_export_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  project_id: uuid("project_id").notNull().references(() => projects.id),
  project_requirement_id: uuid("project_requirement_id").notNull().references(() => project_export_document_requirements.id),
  file_reference: text("file_reference").notNull(),
  object_key: text("object_key").notNull(),
  original_filename: text("original_filename").notNull(),
  mime_type: text("mime_type"),
  sha256_checksum: text("sha256_checksum"),
  version_no: integer("version_no").notNull().default(1),
  status: text("status").notNull().default("uploaded"),
  uploaded_by: uuid("uploaded_by").notNull().references(() => users.id),
  reviewed_by: uuid("reviewed_by").references(() => users.id),
  uploaded_at: timestamp("uploaded_at"),
  reviewed_at: timestamp("reviewed_at"),
  expiry_date: timestamp("expiry_date"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// User notifications
export const user_notifications = pgTable("user_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  event_id: uuid("event_id").notNull().defaultRandom(),
  project_id: uuid("project_id"),
  recipient_user_id: uuid("recipient_user_id").notNull().references(() => users.id),
  created_by: uuid("created_by").notNull().references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  category: text("category").notNull().default("system"),
  priority: text("priority").notNull().default("normal"),
  read_at: timestamp("read_at"),
  created_at: timestamp("created_at").defaultNow(),
});

// Notification deliveries
export const notification_deliveries = pgTable("notification_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  notification_id: uuid("notification_id").notNull(),
  channel: text("channel").notNull(),
  provider: text("provider"),
  status: text("status").notNull().default("pending"),
  attempt_count: integer("attempt_count").notNull().default(0),
  last_attempt_at: timestamp("last_attempt_at"),
  next_retry_at: timestamp("next_retry_at"),
  error_message: text("error_message"),
  idempotency_key: text("idempotency_key").unique(),
  created_at: timestamp("created_at").defaultNow(),
});

// Report runs
export const report_runs = pgTable("report_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  schedule_id: uuid("schedule_id"),
  template_id: text("template_id").notNull(),
  template_version: integer("template_version").notNull().default(1),
  cutoff_at: timestamp("cutoff_at").notNull(),
  generated_at: timestamp("generated_at").notNull().defaultNow(),
  requested_by: uuid("requested_by").references(() => users.id),
  audience: text("audience"),
  project_id: uuid("project_id").references(() => projects.id),
  status: text("status").notNull().default("queued"),
  idempotency_key: text("idempotency_key").unique(),
  file_reference: text("file_reference"),
  data_freshness: timestamp("data_freshness").notNull().defaultNow(),
  created_at: timestamp("created_at").defaultNow(),
});

// Report schedules
export const report_schedules = pgTable("report_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  template_id: text("template_id").notNull(),
  template_version: integer("template_version").notNull().default(1),
  audience: text("audience").notNull(),
  recipient_user_id: uuid("recipient_user_id"),
  project_id: uuid("project_id").references(() => projects.id),
  frequency: text("frequency").notNull(),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  execution_time: timestamp("execution_time", { mode: "string" }).notNull().default("06:00:00"),
  cutoff_policy: text("cutoff_policy").notNull().default("previous_day"),
  channel: text("channel").notNull().default("in_app"),
  approval_required: boolean("approval_required").notNull().default(false),
  last_execution_at: timestamp("last_execution_at"),
  next_execution_at: timestamp("next_execution_at"),
  status: text("status").notNull().default("active"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

