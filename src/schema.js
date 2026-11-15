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
    contract_program_id: uuid("contract_program_id").notNull().references(() => contract_programs.id, { onDelete: "cascade" }),
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
export const rab_items = pgTable("rab_items", {
    id: uuid("id").defaultRandom().primaryKey(),
    project_id: uuid("project_id").notNull().references(() => projects.id),
    description: text("description").notNull(),
    category: text("category").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    version: integer("version").notNull().default(1),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
});
export const fx_rates = pgTable("fx_rates", {
    id: uuid("id").defaultRandom().primaryKey(),
    from_currency: text("from_currency").notNull(),
    to_currency: text("to_currency").notNull(),
    rate: numeric("rate", { precision: 18, scale: 6 }).notNull(),
    rate_type: text("rate_type").notNull().default("reference"),
    source: text("source"),
    effective_date: timestamp("effective_date").notNull(),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at").defaultNow(),
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
export const payments = pgTable("payments", {
    id: uuid("id").defaultRandom().primaryKey(),
    project_id: uuid("project_id").notNull().references(() => projects.id),
    reference: text("reference").notNull().unique(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    status: text("status").notNull().default("pending"),
    payment_date: timestamp("payment_date"),
    evidence_url: text("evidence_url"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
});
export const journal_entries = pgTable("journal_entries", {
    id: uuid("id").defaultRandom().primaryKey(),
    project_id: uuid("project_id").notNull().references(() => projects.id),
    entry_number: text("entry_number").notNull().unique(),
    posting_date: timestamp("posting_date").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("draft"),
    total_debit: numeric("total_debit", { precision: 18, scale: 2 }).notNull().default("0"),
    total_credit: numeric("total_credit", { precision: 18, scale: 2 }).notNull().default("0"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
});
export const journal_lines = pgTable("journal_lines", {
    id: uuid("id").defaultRandom().primaryKey(),
    entry_id: uuid("entry_id").notNull().references(() => journal_entries.id),
    account_code: text("account_code").notNull(),
    account_name: text("account_name").notNull(),
    debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
    credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
    created_at: timestamp("created_at").defaultNow(),
});
// Compliance entities (P08)
export const compliance_rules = pgTable("compliance_rules", {
    id: uuid("id").defaultRandom().primaryKey(),
    rule_code: text("rule_code").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    authority: text("authority"),
    jurisdiction: text("jurisdiction"),
    effective_date: timestamp("effective_date"),
    expiry_date: timestamp("expiry_date"),
    status: text("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
});
export const compliance_documents = pgTable("compliance_documents", {
    id: uuid("id").defaultRandom().primaryKey(),
    project_id: uuid("project_id").references(() => projects.id),
    shipment_id: uuid("shipment_id"),
    rule_id: uuid("rule_id").references(() => compliance_rules.id),
    document_type: text("document_type").notNull(),
    document_number: text("document_number"),
    issue_date: timestamp("issue_date"),
    expiry_date: timestamp("expiry_date"),
    verification_state: text("verification_state").notNull().default("pending"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
});
// System notifications (P11)
export const notifications = pgTable("notifications", {
    id: uuid("id").defaultRandom().primaryKey(),
    recipient_user_id: uuid("recipient_user_id").references(() => users.id),
    title: text("title").notNull(),
    message: text("message").notNull(),
    category: text("category").notNull().default("system"),
    priority: text("priority").notNull().default("normal"),
    read_at: timestamp("read_at"),
    created_at: timestamp("created_at").defaultNow(),
});
