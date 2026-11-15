"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.report_schedules = exports.report_runs = exports.notification_deliveries = exports.user_notifications = exports.project_export_documents = exports.project_export_document_requirements = exports.country_export_document_requirements = exports.export_document_types = exports.regulatory_sources = exports.chart_of_accounts = exports.journal_lines = exports.journal_entries = exports.fx_exposures = exports.fx_exposure = exports.fx_rates = exports.inventory_movements = exports.inventory_lots = exports.warehouse_receipts = exports.tracking_events = exports.truck_trips = exports.project_workflows = exports.admin_action_queue = exports.approval_events = exports.project_template_versions = exports.project_templates = exports.service_vendors = exports.buyer_parties = exports.cycle_policies = exports.contract_programs = exports.contracts = exports.pks_sites = exports.buyers = exports.project_members = exports.projects = exports.role_permissions = exports.permissions = exports.role_catalog = exports.users = exports.fxExposureTypeEnum = exports.rabCategoryEnum = exports.trackingEventTypeEnum = exports.projectStatusEnum = exports.userRoleEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
// Enums
exports.userRoleEnum = (0, pg_core_1.pgEnum)("user_role", [
    "admin", "pm", "field_manager", "procurement", "checker",
    "warehouse_manager", "packing_supervisor", "loading_manager",
    "document_officer", "finance", "cashier", "accounting",
    "funder", "buyer", "supplier", "transporter", "external_provider", "viewer"
]);
exports.projectStatusEnum = (0, pg_core_1.pgEnum)("project_status", [
    "draft", "active", "partial", "settled", "closed"
]);
exports.trackingEventTypeEnum = (0, pg_core_1.pgEnum)("tracking_event_type", [
    "departure", "checkpoint", "arrival", "weighbridge", "receipt", "exception"
]);
exports.rabCategoryEnum = (0, pg_core_1.pgEnum)("rab_category", [
    "fixed", "variable", "contingency", "tax", "overhead"
]);
exports.fxExposureTypeEnum = (0, pg_core_1.pgEnum)("fx_exposure_type", [
    "open", "revalued", "realized", "unrealized"
]);
// Core tables
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    neon_auth_user_id: (0, pg_core_1.uuid)("neon_auth_user_id"),
    email: (0, pg_core_1.text)("email").notNull().unique(),
    name: (0, pg_core_1.text)("name"),
    role: (0, exports.userRoleEnum)("role").notNull().default("viewer"),
    password_hash: (0, pg_core_1.text)("password_hash").notNull(),
    mfa_enabled: (0, pg_core_1.boolean)("mfa_enabled").default(false),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.role_catalog = (0, pg_core_1.pgTable)("role_catalog", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    name: (0, pg_core_1.text)("name").notNull().unique(),
    description: (0, pg_core_1.text)("description"),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.permissions = (0, pg_core_1.pgTable)("permissions", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    name: (0, pg_core_1.text)("name").notNull(),
    code: (0, pg_core_1.text)("code").notNull().unique(),
    description: (0, pg_core_1.text)("description"),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.role_permissions = (0, pg_core_1.pgTable)("role_permissions", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    role_id: (0, pg_core_1.uuid)("role_id").notNull().references(() => exports.role_catalog.id),
    permission_id: (0, pg_core_1.uuid)("permission_id").notNull().references(() => exports.permissions.id),
    granted_by: (0, pg_core_1.uuid)("granted_by").references(() => exports.users.id),
    granted_at: (0, pg_core_1.timestamp)("granted_at").defaultNow(),
});
exports.projects = (0, pg_core_1.pgTable)("projects", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    contract_program_id: (0, pg_core_1.uuid)("contract_program_id").notNull().references(() => exports.contract_programs.id, { onDelete: "cascade" }),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    status: (0, pg_core_1.text)("status").notNull().default("draft"),
    quantity_tranche: (0, pg_core_1.numeric)("quantity_tranche", { precision: 15, scale: 2 }),
    settlement_unit: (0, pg_core_1.text)("settlement_unit").notNull(),
    target_quantity: (0, pg_core_1.numeric)("target_quantity", { precision: 15, scale: 2 }).notNull(),
    started_at: (0, pg_core_1.timestamp)("started_at"),
    closed_at: (0, pg_core_1.timestamp)("closed_at"),
    is_active: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
    export_country_code: (0, pg_core_1.text)("export_country_code"),
});
exports.project_members = (0, pg_core_1.pgTable)("project_members", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_id: (0, pg_core_1.uuid)("project_id").notNull().references(() => exports.projects.id),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => exports.users.id),
    role_id: (0, pg_core_1.uuid)("role_id").references(() => exports.role_catalog.id),
    joined_at: (0, pg_core_1.timestamp)("joined_at").defaultNow(),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
});
exports.buyers = (0, pg_core_1.pgTable)("buyers", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    name: (0, pg_core_1.text)("name").notNull(),
    code: (0, pg_core_1.text)("code").unique(),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.pks_sites = (0, pg_core_1.pgTable)("pks_sites", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    name: (0, pg_core_1.text)("name").notNull(),
    location: (0, pg_core_1.text)("location"),
    code: (0, pg_core_1.text)("code").unique(),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.contracts = (0, pg_core_1.pgTable)("contracts", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    buyer_id: (0, pg_core_1.uuid)("buyer_id").notNull().references(() => exports.buyers.id, { onDelete: "cascade" }),
    code: (0, pg_core_1.text)("code").notNull(),
    name: (0, pg_core_1.text)("name").notNull(),
    start_date: (0, pg_core_1.timestamp)("start_date").notNull(),
    end_date: (0, pg_core_1.timestamp)("end_date"),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.contract_programs = (0, pg_core_1.pgTable)("contract_programs", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    buyer_id: (0, pg_core_1.uuid)("buyer_id").references(() => exports.buyers.id, { onDelete: "set null" }),
    contract_id: (0, pg_core_1.uuid)("contract_id").references(() => exports.contracts.id, { onDelete: "set null" }),
    settlement_unit: (0, pg_core_1.text)("settlement_unit").notNull(),
    target_quantity: (0, pg_core_1.numeric)("target_quantity", { precision: 15, scale: 2 }).notNull(),
    cadence: (0, pg_core_1.text)("cadence").notNull(),
    generation_mode: (0, pg_core_1.text)("generation_mode").notNull().default("scheduled_draft"),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.cycle_policies = (0, pg_core_1.pgTable)("cycle_policies", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    contract_program_id: (0, pg_core_1.uuid)("contract_program_id").notNull().references(() => exports.contract_programs.id, { onDelete: "cascade" }),
    cadence: (0, pg_core_1.text)("cadence").notNull(),
    target_quantity: (0, pg_core_1.numeric)("target_quantity", { precision: 15, scale: 2 }),
    generation_mode: (0, pg_core_1.text)("generation_mode").notNull(),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Phase 2 entities
exports.buyer_parties = (0, pg_core_1.pgTable)("buyer_parties", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    buyer_id: (0, pg_core_1.uuid)("buyer_id").notNull().references(() => exports.buyers.id, { onDelete: "cascade" }),
    name: (0, pg_core_1.text)("name").notNull(),
    role: (0, pg_core_1.text)(),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.service_vendors = (0, pg_core_1.pgTable)("service_vendors", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    name: (0, pg_core_1.text)("name").notNull(),
    code: (0, pg_core_1.text)("code").unique(),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.project_templates = (0, pg_core_1.pgTable)("project_templates", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    contract_program_id: (0, pg_core_1.uuid)("contract_program_id").references(() => exports.contract_programs.id, { onDelete: "set null" }),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.project_template_versions = (0, pg_core_1.pgTable)("project_template_versions", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_template_id: (0, pg_core_1.uuid)("project_template_id").notNull().references(() => exports.project_templates.id, { onDelete: "cascade" }),
    version_number: (0, pg_core_1.integer)("version_number").notNull(),
    status: (0, pg_core_1.text)("status").notNull().default("draft"),
    config_snapshot: (0, pg_core_1.jsonb)("config_snapshot"),
    effective_date: (0, pg_core_1.timestamp)("effective_date"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.approval_events = (0, pg_core_1.pgTable)("approval_events", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    entity_type: (0, pg_core_1.text)("entity_type").notNull(),
    entity_id: (0, pg_core_1.uuid)("entity_id").notNull(),
    action: (0, pg_core_1.text)("action").notNull(),
    approved_by: (0, pg_core_1.uuid)("approved_by").references(() => exports.users.id),
    status: (0, pg_core_1.text)("status").notNull().default("pending"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.admin_action_queue = (0, pg_core_1.pgTable)("admin_action_queue", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    action_type: (0, pg_core_1.text)("action_type").notNull(),
    entity_type: (0, pg_core_1.text)("entity_type").notNull(),
    entity_id: (0, pg_core_1.uuid)("entity_id").notNull(),
    details: (0, pg_core_1.jsonb)("details"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    resolved_at: (0, pg_core_1.timestamp)("resolved_at"),
    resolved_by: (0, pg_core_1.uuid)("resolved_by").references(() => exports.users.id),
    is_resolved: (0, pg_core_1.boolean)("is_resolved").default(false),
});
exports.project_workflows = (0, pg_core_1.pgTable)("project_workflows", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_id: (0, pg_core_1.uuid)("project_id").notNull(),
    workflow_template_id: (0, pg_core_1.uuid)("workflow_template_id"),
    version: (0, pg_core_1.text)("version").default("1.0"),
    status: (0, pg_core_1.text)("status").notNull().default("active"),
    config_snapshot: (0, pg_core_1.jsonb)("config_snapshot"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Operational workflow entities (P06)
exports.truck_trips = (0, pg_core_1.pgTable)("truck_trips", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_id: (0, pg_core_1.uuid)("project_id").notNull().references(() => exports.projects.id),
    transport_leg_id: (0, pg_core_1.uuid)("transport_leg_id").notNull(),
    pks_site_id: (0, pg_core_1.uuid)("pks_site_id").references(() => exports.pks_sites.id),
    vehicle_id: (0, pg_core_1.uuid)("vehicle_id").references(() => exports.service_vendors.id),
    driver_name: (0, pg_core_1.text)("driver_name"),
    license_plate: (0, pg_core_1.text)("license_plate").notNull(),
    departure_time: (0, pg_core_1.timestamp)("departure_time"),
    arrival_time: (0, pg_core_1.timestamp)("arrival_time"),
    status: (0, pg_core_1.text)("status").notNull().default("scheduled"),
    gps_latitude: (0, pg_core_1.numeric)("gps_latitude", { precision: 9, scale: 6 }),
    gps_longitude: (0, pg_core_1.numeric)("gps_longitude", { precision: 10, scale: 6 }),
    gps_accuracy: (0, pg_core_1.numeric)("gps_accuracy", { precision: 5, scale: 2 }),
    checker_id: (0, pg_core_1.uuid)("checker_id").references(() => exports.users.id),
    departure_checkpoint_id: (0, pg_core_1.uuid)("departure_checkpoint_id"),
    arrival_checkpoint_id: (0, pg_core_1.uuid)("arrival_checkpoint_id"),
    is_active: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.tracking_events = (0, pg_core_1.pgTable)("tracking_events", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    truck_trip_id: (0, pg_core_1.uuid)("truck_trip_id").notNull().references(() => exports.truck_trips.id),
    event_type: (0, pg_core_1.text)("event_type").notNull(),
    checker_id: (0, pg_core_1.uuid)("checker_id").notNull().references(() => exports.users.id),
    latitude: (0, pg_core_1.numeric)("latitude", { precision: 9, scale: 6 }).notNull(),
    longitude: (0, pg_core_1.numeric)("longitude", { precision: 10, scale: 6 }).notNull(),
    gps_accuracy: (0, pg_core_1.numeric)("gps_accuracy", { precision: 5, scale: 2 }).notNull(),
    source: (0, pg_core_1.text)("source").notNull().default("checker_device"),
    capture_timestamp: (0, pg_core_1.timestamp)("capture_timestamp").notNull(),
    server_received_timestamp: (0, pg_core_1.timestamp)("server_received_timestamp").notNull().defaultNow(),
    qr_scanned: (0, pg_core_1.boolean)("qr_scanned").notNull().default(false),
    status: (0, pg_core_1.text)("status").notNull().default("verified"),
    notes: (0, pg_core_1.text)("notes"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Warehouse & inventory (P06)
exports.warehouse_receipts = (0, pg_core_1.pgTable)("warehouse_receipts", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_id: (0, pg_core_1.uuid)("project_id").notNull().references(() => exports.projects.id),
    truck_trip_id: (0, pg_core_1.uuid)("truck_trip_id").references(() => exports.truck_trips.id),
    lot_id: (0, pg_core_1.uuid)("lot_id").references(() => exports.inventory_lots.id),
    received_quantity: (0, pg_core_1.numeric)("received_quantity", { precision: 15, scale: 2 }).notNull(),
    unit: (0, pg_core_1.text)("unit").notNull(),
    condition_status: (0, pg_core_1.text)("condition_status"),
    exception_reason: (0, pg_core_1.text)("exception_reason"),
    weighbridge_ticket_key: (0, pg_core_1.text)("weighbridge_ticket_key"),
    checker_id: (0, pg_core_1.uuid)("checker_id").notNull().references(() => exports.users.id),
    gps_latitude: (0, pg_core_1.numeric)("gps_latitude", { precision: 9, scale: 6 }),
    gps_longitude: (0, pg_core_1.numeric)("gps_longitude", { precision: 10, scale: 6 }),
    gps_accuracy: (0, pg_core_1.numeric)("gps_accuracy", { precision: 5, scale: 2 }),
    check_timestamp: (0, pg_core_1.timestamp)("check_timestamp").notNull(),
    received_at: (0, pg_core_1.timestamp)("received_at").notNull().defaultNow(),
    status: (0, pg_core_1.text)("status").notNull().default("pending"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.inventory_lots = (0, pg_core_1.pgTable)("inventory_lots", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_id: (0, pg_core_1.uuid)("project_id").notNull().references(() => exports.projects.id),
    pks_site_id: (0, pg_core_1.uuid)("pks_site_id").references(() => exports.pks_sites.id),
    quantity: (0, pg_core_1.numeric)("quantity", { precision: 15, scale: 2 }).notNull(),
    unit: (0, pg_core_1.text)("unit").notNull().default("MT"),
    location: (0, pg_core_1.text)("location"),
    status: (0, pg_core_1.text)("status").notNull().default("incoming"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.inventory_movements = (0, pg_core_1.pgTable)("inventory_movements", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_id: (0, pg_core_1.uuid)("project_id").notNull().references(() => exports.projects.id),
    lot_id: (0, pg_core_1.uuid)("lot_id").notNull().references(() => exports.inventory_lots.id),
    warehouse_receipt_id: (0, pg_core_1.uuid)("warehouse_receipt_id").references(() => exports.warehouse_receipts.id),
    movement_type: (0, pg_core_1.text)("movement_type").notNull(),
    quantity: (0, pg_core_1.numeric)("quantity", { precision: 15, scale: 2 }).notNull(),
    unit: (0, pg_core_1.text)("unit").notNull(),
    source_location: (0, pg_core_1.text)("source_location"),
    destination_location: (0, pg_core_1.text)("destination_location"),
    reason: (0, pg_core_1.text)("reason"),
    actor_id: (0, pg_core_1.uuid)("actor_id").notNull().references(() => exports.users.id),
    timestamp: (0, pg_core_1.timestamp)("timestamp").notNull().defaultNow(),
    reference_id: (0, pg_core_1.uuid)("reference_id"),
    reference_type: (0, pg_core_1.text)("reference_type"),
    status: (0, pg_core_1.text)("status").notNull().default("posted"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Finance entities (P07)
exports.fx_rates = (0, pg_core_1.pgTable)("fx_rates", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    from_currency_id: (0, pg_core_1.uuid)("from_currency_id").notNull(),
    to_currency_id: (0, pg_core_1.uuid)("to_currency_id").notNull(),
    rate: (0, pg_core_1.numeric)("rate", { precision: 18, scale: 6 }).notNull(),
    rate_type: (0, pg_core_1.text)("rate_type").notNull().default("reference"),
    rate_source: (0, pg_core_1.text)("rate_source"),
    rate_date: (0, pg_core_1.timestamp)("rate_date").notNull(),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.fx_exposure = (0, pg_core_1.pgTable)("fx_exposure", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_id: (0, pg_core_1.uuid)("project_id").notNull().references(() => exports.projects.id),
    amount_idr: (0, pg_core_1.numeric)("amount_idr", { precision: 18, scale: 2 }),
    amount_fx: (0, pg_core_1.numeric)("amount_fx", { precision: 18, scale: 2 }),
    fx_rate: (0, pg_core_1.numeric)("fx_rate", { precision: 18, scale: 6 }),
    exposure_type: (0, pg_core_1.text)("exposure_type").notNull().default("open"),
    status: (0, pg_core_1.text)("status").notNull().default("open"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// P07 v1.2 canonical FX exposures table (plural).
exports.fx_exposures = (0, pg_core_1.pgTable)("fx_exposures", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_id: (0, pg_core_1.uuid)("project_id").references(() => exports.projects.id),
    exposure_type: (0, pg_core_1.text)("exposure_type").notNull(),
    original_currency_id: (0, pg_core_1.uuid)("original_currency_id").notNull(),
    original_amount: (0, pg_core_1.numeric)("original_amount", { precision: 18, scale: 2 }).notNull(),
    functional_amount: (0, pg_core_1.numeric)("functional_amount", { precision: 18, scale: 2 }).notNull(),
    fx_rate: (0, pg_core_1.numeric)("fx_rate", { precision: 18, scale: 6 }).notNull(),
    fx_date: (0, pg_core_1.timestamp)("fx_date").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.journal_entries = (0, pg_core_1.pgTable)("journal_entries", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_id: (0, pg_core_1.uuid)("project_id").references(() => exports.projects.id),
    entry_type: (0, pg_core_1.text)("entry_type").notNull(),
    reference_id: (0, pg_core_1.uuid)("reference_id"),
    reference_type: (0, pg_core_1.text)("reference_type"),
    description: (0, pg_core_1.text)("description").notNull(),
    entry_date: (0, pg_core_1.timestamp)("entry_date").notNull().defaultNow(),
    posted_at: (0, pg_core_1.timestamp)("posted_at"),
    status: (0, pg_core_1.text)("status").notNull().default("draft"),
    posted_by: (0, pg_core_1.uuid)("posted_by").references(() => exports.users.id),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.journal_lines = (0, pg_core_1.pgTable)("journal_lines", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    journal_entry_id: (0, pg_core_1.uuid)("journal_entry_id").notNull().references(() => exports.journal_entries.id),
    account_id: (0, pg_core_1.uuid)("account_id").notNull().references(() => exports.chart_of_accounts.id),
    debit: (0, pg_core_1.numeric)("debit", { precision: 18, scale: 2 }).notNull().default("0"),
    credit: (0, pg_core_1.numeric)("credit", { precision: 18, scale: 2 }).notNull().default("0"),
    description: (0, pg_core_1.text)("description"),
    line_order: (0, pg_core_1.integer)("line_order").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Chart of accounts (P07 GL)
exports.chart_of_accounts = (0, pg_core_1.pgTable)("chart_of_accounts", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    code: (0, pg_core_1.text)("code").notNull().unique(),
    name: (0, pg_core_1.text)("name").notNull(),
    description: (0, pg_core_1.text)("description"),
    parent_id: (0, pg_core_1.uuid)("parent_id"),
    account_type: (0, pg_core_1.text)("account_type").notNull(),
    is_active: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// ============================================
// Regulatory & compliance documents (P08)
// ============================================
// Regulatory sources
exports.regulatory_sources = (0, pg_core_1.pgTable)("regulatory_sources", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    source_id: (0, pg_core_1.text)("source_id").notNull().unique(),
    title: (0, pg_core_1.text)("title").notNull(),
    issuing_authority: (0, pg_core_1.text)("issuing_authority").notNull(),
    jurisdiction: (0, pg_core_1.text)("jurisdiction").notNull(),
    document_type: (0, pg_core_1.text)("document_type"),
    regulation_number: (0, pg_core_1.text)("regulation_number"),
    article_annex_section: (0, pg_core_1.text)("article_annex_section"),
    publication_date: (0, pg_core_1.timestamp)("publication_date"),
    effective_date: (0, pg_core_1.timestamp)("effective_date").notNull(),
    expiry_repeal_date: (0, pg_core_1.timestamp)("expiry_repeal_date"),
    status: (0, pg_core_1.text)("status").notNull().default("draft"),
    official_url: (0, pg_core_1.text)("official_url"),
    source_file_reference: (0, pg_core_1.text)("source_file_reference"),
    source_checksum: (0, pg_core_1.text)("source_checksum"),
    date_retrieved: (0, pg_core_1.timestamp)("date_retrieved"),
    last_reviewed: (0, pg_core_1.timestamp)("last_reviewed"),
    reviewer_id: (0, pg_core_1.uuid)("reviewer_id").references(() => exports.users.id),
    verification_status: (0, pg_core_1.text)("verification_status").notNull().default("pending"),
    related_regulatory_rules: (0, pg_core_1.uuid)("related_regulatory_rules").array(),
    created_at: (0, pg_core_1.timestamp)("created_at").notNull().defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").notNull().defaultNow(),
});
// Export document types
exports.export_document_types = (0, pg_core_1.pgTable)("export_document_types", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    document_type_id: (0, pg_core_1.text)("document_type_id").notNull().unique(),
    document_name: (0, pg_core_1.text)("document_name").notNull(),
    document_category: (0, pg_core_1.text)("document_category"),
    description: (0, pg_core_1.text)("description"),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Country export document requirements
exports.country_export_document_requirements = (0, pg_core_1.pgTable)("country_export_document_requirements", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    country_code: (0, pg_core_1.text)("country_code").notNull(),
    document_type_id: (0, pg_core_1.uuid)("document_type_id").notNull().references(() => exports.export_document_types.id),
    importing_authority: (0, pg_core_1.text)("importing_authority"),
    mandatory: (0, pg_core_1.boolean)("mandatory").default(true),
    status: (0, pg_core_1.text)("status").notNull().default("active"),
    effective_from: (0, pg_core_1.timestamp)("effective_from"),
    effective_to: (0, pg_core_1.timestamp)("effective_to"),
    official_source_url: (0, pg_core_1.text)("official_source_url"),
    notes: (0, pg_core_1.text)("notes"),
    last_verified_at: (0, pg_core_1.timestamp)("last_verified_at"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Project export document requirements
exports.project_export_document_requirements = (0, pg_core_1.pgTable)("project_export_document_requirements", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_id: (0, pg_core_1.uuid)("project_id").notNull().references(() => exports.projects.id),
    country_requirement_id: (0, pg_core_1.uuid)("country_requirement_id").references(() => exports.country_export_document_requirements.id),
    is_required: (0, pg_core_1.boolean)("is_required").default(true),
    status: (0, pg_core_1.text)("status").notNull().default("required"),
    override_reason: (0, pg_core_1.text)("override_reason"),
    overridden_by: (0, pg_core_1.uuid)("overridden_by").references(() => exports.users.id),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Project export documents
exports.project_export_documents = (0, pg_core_1.pgTable)("project_export_documents", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    project_id: (0, pg_core_1.uuid)("project_id").notNull().references(() => exports.projects.id),
    project_requirement_id: (0, pg_core_1.uuid)("project_requirement_id").notNull().references(() => exports.project_export_document_requirements.id),
    file_reference: (0, pg_core_1.text)("file_reference").notNull(),
    object_key: (0, pg_core_1.text)("object_key").notNull(),
    original_filename: (0, pg_core_1.text)("original_filename").notNull(),
    mime_type: (0, pg_core_1.text)("mime_type"),
    sha256_checksum: (0, pg_core_1.text)("sha256_checksum"),
    version_no: (0, pg_core_1.integer)("version_no").notNull().default(1),
    status: (0, pg_core_1.text)("status").notNull().default("uploaded"),
    uploaded_by: (0, pg_core_1.uuid)("uploaded_by").notNull().references(() => exports.users.id),
    reviewed_by: (0, pg_core_1.uuid)("reviewed_by").references(() => exports.users.id),
    uploaded_at: (0, pg_core_1.timestamp)("uploaded_at"),
    reviewed_at: (0, pg_core_1.timestamp)("reviewed_at"),
    expiry_date: (0, pg_core_1.timestamp)("expiry_date"),
    notes: (0, pg_core_1.text)("notes"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// User notifications
exports.user_notifications = (0, pg_core_1.pgTable)("user_notifications", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    event_id: (0, pg_core_1.uuid)("event_id").notNull().defaultRandom(),
    project_id: (0, pg_core_1.uuid)("project_id"),
    recipient_user_id: (0, pg_core_1.uuid)("recipient_user_id").notNull().references(() => exports.users.id),
    created_by: (0, pg_core_1.uuid)("created_by").notNull().references(() => exports.users.id),
    title: (0, pg_core_1.text)("title").notNull(),
    message: (0, pg_core_1.text)("message").notNull(),
    category: (0, pg_core_1.text)("category").notNull().default("system"),
    priority: (0, pg_core_1.text)("priority").notNull().default("normal"),
    read_at: (0, pg_core_1.timestamp)("read_at"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Notification deliveries
exports.notification_deliveries = (0, pg_core_1.pgTable)("notification_deliveries", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    notification_id: (0, pg_core_1.uuid)("notification_id").notNull(),
    channel: (0, pg_core_1.text)("channel").notNull(),
    provider: (0, pg_core_1.text)("provider"),
    status: (0, pg_core_1.text)("status").notNull().default("pending"),
    attempt_count: (0, pg_core_1.integer)("attempt_count").notNull().default(0),
    last_attempt_at: (0, pg_core_1.timestamp)("last_attempt_at"),
    next_retry_at: (0, pg_core_1.timestamp)("next_retry_at"),
    error_message: (0, pg_core_1.text)("error_message"),
    idempotency_key: (0, pg_core_1.text)("idempotency_key").unique(),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Report runs
exports.report_runs = (0, pg_core_1.pgTable)("report_runs", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    schedule_id: (0, pg_core_1.uuid)("schedule_id"),
    template_id: (0, pg_core_1.text)("template_id").notNull(),
    template_version: (0, pg_core_1.integer)("template_version").notNull().default(1),
    cutoff_at: (0, pg_core_1.timestamp)("cutoff_at").notNull(),
    generated_at: (0, pg_core_1.timestamp)("generated_at").notNull().defaultNow(),
    requested_by: (0, pg_core_1.uuid)("requested_by").references(() => exports.users.id),
    audience: (0, pg_core_1.text)("audience"),
    project_id: (0, pg_core_1.uuid)("project_id").references(() => exports.projects.id),
    status: (0, pg_core_1.text)("status").notNull().default("queued"),
    idempotency_key: (0, pg_core_1.text)("idempotency_key").unique(),
    file_reference: (0, pg_core_1.text)("file_reference"),
    data_freshness: (0, pg_core_1.timestamp)("data_freshness").notNull().defaultNow(),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Report schedules
exports.report_schedules = (0, pg_core_1.pgTable)("report_schedules", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    template_id: (0, pg_core_1.text)("template_id").notNull(),
    template_version: (0, pg_core_1.integer)("template_version").notNull().default(1),
    audience: (0, pg_core_1.text)("audience").notNull(),
    recipient_user_id: (0, pg_core_1.uuid)("recipient_user_id"),
    project_id: (0, pg_core_1.uuid)("project_id").references(() => exports.projects.id),
    frequency: (0, pg_core_1.text)("frequency").notNull(),
    timezone: (0, pg_core_1.text)("timezone").notNull().default("Asia/Jakarta"),
    execution_time: (0, pg_core_1.timestamp)("execution_time", { mode: "string" }).notNull().default("06:00:00"),
    cutoff_policy: (0, pg_core_1.text)("cutoff_policy").notNull().default("previous_day"),
    channel: (0, pg_core_1.text)("channel").notNull().default("in_app"),
    approval_required: (0, pg_core_1.boolean)("approval_required").notNull().default(false),
    last_execution_at: (0, pg_core_1.timestamp)("last_execution_at"),
    next_execution_at: (0, pg_core_1.timestamp)("next_execution_at"),
    status: (0, pg_core_1.text)("status").notNull().default("active"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
