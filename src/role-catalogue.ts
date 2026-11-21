/**
 * F1 / PRI-0 / WP-01 + WP-03 — centrally governed Project role templates.
 *
 * This source-controlled catalogue is the canonical definition surface while
 * the legacy role_catalog table is reconciled. It does not itself grant access:
 * a Project role is created only through the explicit activation endpoint, and
 * each requested permission must already exist and be active in public.permissions.
 *
 * Do not add payment execution permissions to operational/Finance templates.
 */

export type RoleDomain =
  | "governance" | "procurement" | "production_quality" | "warehouse_logistics"
  | "shipping_loading" | "finance";

export type RoleScope = "platform" | "project";

export interface CanonicalRoleTemplate {
  code: string;
  label: string;
  domain: RoleDomain;
  scope: RoleScope;
  classification: "internal" | "external";
  templateVersion: 1;
  mandatory: boolean;
  assignmentMode: "appointment" | "project_assignment" | "object_assignment";
  permissionCodes: readonly string[];
  restrictions: readonly string[];
  legacyAliases: readonly string[];
}

const role = (
  code: string,
  label: string,
  domain: RoleDomain,
  permissionCodes: readonly string[],
  restrictions: readonly string[] = [],
  options: Partial<Pick<CanonicalRoleTemplate, "scope" | "classification" | "mandatory" | "assignmentMode" | "legacyAliases">> = {},
): CanonicalRoleTemplate => ({
  code, label, domain, scope: options.scope ?? "project",
  classification: options.classification ?? "internal", templateVersion: 1,
  mandatory: options.mandatory ?? false,
  assignmentMode: options.assignmentMode ?? (options.classification === "external" ? "object_assignment" : "project_assignment"),
  permissionCodes, restrictions, legacyAliases: options.legacyAliases ?? [],
});

export const CANONICAL_ROLE_TEMPLATES: readonly CanonicalRoleTemplate[] = [
  role("platform_admin", "Platform Administrator", "governance", [], [
    "Platform-wide governance only; never reinterpret as Project Admin.",
    "Appointment and global identity authority are separate from Project membership.",
  ], { scope: "platform", mandatory: true, assignmentMode: "appointment", legacyAliases: ["admin"] }),
  role("project_admin", "Project Administrator", "governance", [
    "project.view", "project.update", "project.members.view", "project.members.invite",
    "project.members.manage", "project.roles.manage", "project.configuration.manage",
    "project.change.view", "project.change.create", "project.change.update",
    "audit.view", "accounting.view", "reports.view", "report.view", "documents.view", "workflow.view", "approvals.view", "finance.view",
  ], [
    "Project-scoped administration only; no platform-wide user or role governance.",
    "Finance, Accounting and Reports access is strictly read-only; no create, update, delete, post, or Cash Advance request authority.",
    "No payment execution or independent technical approval.",
  ], { mandatory: true, legacyAliases: ["admin"] }),
  role("pm", "Project Manager", "governance", [
    "project.view", "project.update", "project.members.view", "project.members.invite", "project.members.manage", "project.roles.manage", "project.configuration.manage",
    "contract.view", "manage_contract_programs", "shipping.view", "shipment.view",
    "finance.view", "inventory.view", "operations.view", "logistics.view", "warehouse.view",
    "documents.view", "workflow.view", "approvals.view", "reports.view", "audit.view",
    "project.tasks.view", "project.tasks.create", "project.tasks.assign", "project.tasks.update", "project.tasks.resolve", "project.tasks.escalate",
  ], [
    "PM is appointed per Project by Platform Admin; one PM may serve multiple Projects.",
    "Read-all is SELECT-only; no QA release, warehouse verification, Finance approval, payment, loading sign-off or delete authority.",
    "PKS operational overlay only; global legal identity requires independent approval.",
  ], { mandatory: true }),
  role("internal_auditor", "Internal Auditor", "governance", [
    "project.view", "audit.view", "operations.view", "inventory.view", "warehouse.view",
    "logistics.view", "shipping.view", "shipment.view", "finance.view", "accounting.view",
    "documents.view", "workflow.view", "reports.view",
  ], [
    "Read-only on business records; may not modify audit_events or source transactions.",
    "Finding/corrective-action write capability requires its separately governed permission set.",
  ]),
  role("procurement", "Procurement Officer", "procurement", [
    "supplier.view", "supplier.manage", "buyer.requirement.view", "buyer.requirement.manage",
    "contract.view", "product.view", "facility.view", "facility.capacity.view",
  ]),
  role("pks_site_manager", "PKS Site Manager", "procurement", [
    "facility.view", "facility.update", "facility.capacity.view", "facility.capacity.manage",
    "facility.product.view", "facility.product.manage", "product.view",
  ], ["Project participation and operating data only; global legal identity edits require independent approval."]),
  role("supplier", "Supplier", "procurement", [
    "supplier.view", "product.view", "documents.view", "shipment.view",
  ], ["Object-assigned records and documents only."], { classification: "external" }),
  role("buyer", "Buyer", "procurement", [
    "buyer.requirement.view", "buyer.shipment.view", "documents.view", "shipment.view",
  ], ["Only the buyer's own contract and shipment projection."], { classification: "external" }),
  role("contract_manager", "Contract Manager", "procurement", [
    "contract.view", "manage_contract_programs", "buyer.requirement.view", "buyer.requirement.manage",
  ]),
  role("production_manager", "Production Manager", "production_quality", [
    "operations.view", "operations.create", "operations.update", "inventory.view",
    "facility.view", "facility.capacity.view", "product.view",
  ]),
  role("packing_supervisor", "Packing Supervisor", "production_quality", [
    "operations.view", "operations.create", "operations.update", "record_packing",
    "inventory.view", "product.view",
  ], [], { legacyAliases: ["packing_supervisor"] }),
  role("qc_officer", "Quality Control Officer", "production_quality", [
    "quality.sample.create", "quality.result.create", "product.view", "inventory.view",
  ]),
  role("qa_manager", "Quality Assurance Manager", "production_quality", [
    "quality.result.review", "product.view", "inventory.view", "documents.view",
  ], ["Independent QA release/hold approval must remain separate from production execution."]),
  role("laboratory_officer", "Laboratory Officer", "production_quality", [
    "quality.result.create", "product.view", "documents.view",
  ]),
  role("hse_officer", "HSE Officer", "production_quality", [
    "operations.view", "operations.update", "compliance.view", "compliance.assess", "documents.view",
  ]),
  role("warehouse_manager", "Warehouse Manager", "warehouse_logistics", [
    "warehouse.view", "warehouse.create", "warehouse.update", "warehouse.receipt.create",
    "inventory.view", "inventory.update", "inventory.reserve", "inventory.hold", "inventory.reconcile",
  ], [], { legacyAliases: ["warehouse"] }),
  role("warehouse_officer", "Warehouse Officer", "warehouse_logistics", [
    "warehouse.view", "warehouse.receipt.create", "inventory.view",
  ]),
  role("inventory_controller", "Inventory Controller", "warehouse_logistics", [
    "inventory.view", "inventory.create", "inventory.update", "inventory.reserve",
    "inventory.hold", "inventory.reconcile", "warehouse.view",
  ]),
  role("transport_manager", "Transport Manager", "warehouse_logistics", [
    "logistics.view", "logistics.create", "logistics.update", "record_truck_trips",
    "shipping.view", "shipment.view",
  ]),
  role("dispatcher", "Dispatcher", "warehouse_logistics", [
    "logistics.view", "logistics.create", "logistics.update", "record_truck_trips",
  ]),
  role("transporter", "Transporter", "warehouse_logistics", [
    "logistics.view", "record_truck_trips", "verify_checkpoints",
  ], ["Assigned trips and evidence only."], { classification: "external" }),
  role("checker", "Checker", "warehouse_logistics", [
    "logistics.view", "verify_checkpoints", "operations.view",
  ]),
  role("driver", "Driver", "warehouse_logistics", [
    "record_truck_trips", "verify_checkpoints",
  ], ["Assigned trip/checkpoint scope only."], { classification: "external" }),
  role("master_of_loading", "Master of Loading", "shipping_loading", [
    "shipping.view", "shipping.update", "shipment.view", "loading.ticket.create",
    "inventory.view", "documents.view", "workflow.view", "voyage.view", "vessel.view", "port.view",
  ], [
    "Coordinates shore-side readiness and loading evidence.",
    "Cannot approve independent survey, QA release, warehouse receipt, vessel stability or statutory terminal decisions.",
  ], { legacyAliases: ["loading_manager"] }),
  role("loading_supervisor", "Loading Supervisor", "shipping_loading", [
    "shipping.view", "shipping.update", "shipment.view", "loading.ticket.create",
  ]),
  role("loading_operator", "Loading Operator", "shipping_loading", [
    "shipping.view", "shipment.view", "loading.ticket.create",
  ]),
  role("terminal_representative", "Terminal Representative", "shipping_loading", [
    "port.view", "shipping.view", "shipment.view", "loading.ticket.create",
  ], ["Terminal-authorized scope only."], { classification: "external" }),
  role("shipping_agent", "Shipping Agent", "shipping_loading", [
    "shipment.view", "shipping.view", "shipping.create", "vessel.view", "voyage.view", "documents.view",
  ], ["Assigned shipment/voyage and permitted document scope only."], { classification: "external" }),
  role("marine_surveyor", "Marine Surveyor", "shipping_loading", [
    "shipment.view", "vessel.view", "shipping.view", "documents.view",
  ], ["Independent survey evidence only; no operational approval authority."], { classification: "external" }),
  role("ship_master", "Ship Master", "shipping_loading", [
    "vessel.view", "voyage.view", "shipment.view", "documents.view",
  ], ["Vessel/voyage assigned scope only; not the application's Master of Loading."], { classification: "external" }),
  role("finance", "Finance Officer", "finance", [
    "project.view", "finance.view", "finance.create", "finance.update", "finance.delete", "reports.view", "reports.create",
    "report.view", "view_financial", "view_rab", "manage_rab",
  ], ["Finance reporting and controls only; no payment instruction, approval, reconciliation or evidence-verification grants."]),
  role("accounting", "Accountant", "finance", [
    "project.view", "accounting.view", "accounting.create", "reports.view", "report.view", "view_financial", "view_rab",
  ], ["Journal posting/reversal must be separately assigned and independently approved."]),
  role("cashier", "Cashier", "finance", [
    "payment.view", "finance.view", "reports.view",
  ], ["No payment instruction issue, payment approval or payment evidence verification by default."]),
  role("funder", "Project Funder", "finance", [
    "project.view", "funder.view",
  ], ["External Funder may view basic Project context and only report artifacts explicitly shared to their active Project Funder assignment. No generic Finance, Accounting, payment or internal Reports access."], { classification: "external" }),
  role("document_officer", "Document Officer", "governance", ["project.view","document.view","document.download","documents.view","documents.create","documents.update","documents.upload","documents.verify","documents.manage"], ["Document lifecycle only; no Finance, Accounting or payment execution grants."]),
  role("external_provider", "External Provider", "procurement", ["project.view","document.view","document.download","documents.view","documents.create","documents.upload","view_published_docs"], ["External assigned-document scope only."], { classification: "external" }),
  role("field_manager", "Field Manager", "warehouse_logistics", ["project.view","logistics.view","logistics.create","logistics.update","operations.view","operations.update","record_truck_trips","verify_checkpoints","shipment.event.create"], ["Field execution and logistics scope only."]),
  role("viewer", "Viewer", "governance", ["project.view","documents.view","inventory.view","report.view","reports.view","shipment.view","shipping.view"], ["Read-only Project visibility."], { classification: "external" }),
] as const;

const byCode = new Map(CANONICAL_ROLE_TEMPLATES.map((template) => [template.code, template]));

export function getCanonicalRoleTemplate(code: string): CanonicalRoleTemplate | null {
  return byCode.get(code) ?? null;
}

export function listProjectRoleTemplates(): CanonicalRoleTemplate[] {
  return CANONICAL_ROLE_TEMPLATES.filter((template) => template.scope === "project").map((template) => ({
    ...template,
    permissionCodes: [...template.permissionCodes],
    restrictions: [...template.restrictions],
    legacyAliases: [...template.legacyAliases],
  }));
}

export function getUnknownRolePermissionCodes(): string[] {
  const known = new Set<string>();
  for (const template of CANONICAL_ROLE_TEMPLATES) {
    for (const permission of template.permissionCodes) known.add(permission);
  }
  return [...known].sort();
}
