import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT=process.cwd();
const API=readFileSync(join(ROOT,"src","p17-maritime.ts"),"utf8");
const MAIN=readFileSync(join(ROOT,"src","index.ts"),"utf8");
const A=readFileSync(join(ROOT,"migrations","096_p17a_maritime_source_governance_ingestion.sql"),"utf8");
const E=readFileSync(join(ROOT,"migrations","097_p17e_project_maritime_workflows.sql"),"utf8");
const ROLES=readFileSync(join(ROOT,"src","role-catalogue.ts"),"utf8");
const SIM=readFileSync(join(ROOT,"migrations","101_p17b_logistics_simulation_graph.sql"),"utf8");
const SOURCE_UI=readFileSync(join(ROOT,"frontend","src","MaritimeSourceRegistry.tsx"),"utf8");
const PORT_UI=readFileSync(join(ROOT,"frontend","src","PortNetworkPage.tsx"),"utf8");
const SCENARIO_UI=readFileSync(join(ROOT,"frontend","src","PkeLogisticsScenarioWorkbench.tsx"),"utf8");
const IDENTITY_UI=readFileSync(join(ROOT,"frontend","src","MaritimeIdentityReview.tsx"),"utf8");
describe("P17-A maritime source governance",()=>{
 it("mounts authenticated admin-only source registry and ingestion endpoints",()=>{
  for(const route of ["/api/v1/admin/maritime/sources","/api/v1/admin/maritime/sources/:id/rights","/api/v1/admin/maritime/sources/:id/enable","/api/v1/admin/maritime/sources/:id/field-permissions","/api/v1/admin/maritime/sources/:id/runs","/api/v1/admin/maritime/runs/:runId/staging","/api/v1/admin/maritime/staging/:stagingId/review","/api/v1/admin/maritime/runs/:runId/complete","/api/v1/admin/maritime/sources/:id/health"])expect(API).toContain(route);
  expect(MAIN).toContain("registerP17MaritimeRoutes(app");
 });
 it("fails closed on rights and expiry, stores secret references only",()=>{
  expect(A).toContain("rights_status='approved'");
  expect(A).toContain("internal_processing_allowed IS TRUE");
  expect(A).toContain("rights_expires_at > rights_reviewed_at");
  expect(A).toContain("credential_secret_ref");
  expect(A).toContain("maritime_source_quota_pair_ck");
  expect(A).toContain("records_staged <= records_seen AND records_rejected <= records_seen");
  expect(A).not.toMatch(/api[_-]?key\s+text|secret_value\s+text/i);
  expect(API).toContain("RIGHTS_EVIDENCE_REQUIRED");
  expect(API).toContain("SOURCE_RIGHTS_NOT_ACTIVE");
 });
 it("records immutable run identity, content hashes and idempotent staging",()=>{
  expect(A).toContain("UNIQUE(source_id,idempotency_key)");
  expect(A).toContain("UNIQUE(run_id,external_record_id,payload_sha256)");
  expect(A).toContain("payload_sha256 ~ '^[0-9a-f]{64}$'");
  expect(API).toContain("STAGING_DUPLICATE");
  expect(API).toContain("SOURCE_QUOTA_EXHAUSTED");
  expect(API).toContain("quotaLimit=b.quotaLimit==null?null:Number(b.quotaLimit)");
  expect(API).toContain("recordsRejected>recordsSeen");
  expect(API).toContain("public.maritime_provider_usage");
  expect(API).toContain("maritime_provider_health");
 });
 it("keeps source governance and ingestion private to Platform Admin",()=>{
  for(const table of ["maritime_data_sources","maritime_source_field_permissions","maritime_ingestion_runs","maritime_ingestion_staging","maritime_provider_usage","maritime_provider_health"])expect(A).toContain("maritime_sources_admin_all");
  expect(A).toContain("pke_is_platform_admin()");
 });
});
describe("P17-E Project maritime workflows",()=>{
 it("provides Project-scoped voyage, nomination and port-call endpoints",()=>{
  for(const route of ["/api/v1/projects/:projectId/voyages","/api/v1/projects/:projectId/voyages/:voyageId","/api/v1/projects/:projectId/vessel-nominations","/api/v1/projects/:projectId/vessel-nominations/:id/decision","/api/v1/projects/:projectId/vessel-port-calls"])expect(API).toContain(route);
 });
 it("enforces idempotency, version conflicts and same-Project parent relationships",()=>{
  expect(E).toContain("voyages_project_idempotency_uq");
  expect(E).toContain("vessel_nominations_project_shipment_fk");
  expect(E).toContain("vessel_nominations_project_voyage_fk");
  expect(E).toContain("vessel_port_calls_project_voyage_fk");
  expect(API).toContain("VOYAGE_VERSION_CONFLICT");
  expect(API).toContain("SHIPMENT_OUTSIDE_PROJECT");
  expect(API).toContain("PORT_CALL_VOYAGE_MISMATCH");
 });
 it("enforces independent nomination decisions and explicit actual milestones",()=>{
  expect(E).toContain("reviewed_by <> nominated_by");
  expect(E).toContain("Independent nomination reviewer required");
  expect(E).toContain("Actual port-call milestones require independent confirmation");
  expect(API).toContain("MAKER_CHECKER_REQUIRED");
  expect(API).toContain("ACTUAL_TIME_REQUIRED");
 });
 it("keeps permission grants narrow and role scoped",()=>{
  for(const permission of ["voyage.create","voyage.update","vessel.nomination.review","vessel.port_call.manage","vessel.port_call.confirm"])expect(E).toContain(permission);
  expect(ROLES).toContain("vessel.nominate");
  expect(ROLES).toContain("vessel.port_call.confirm");
  expect(E).toContain("('pm','voyage.view')");
  expect(ROLES).toContain('"vessel.view", "vessel.port.assess", "voyage.view", "voyage.create"');
 });
 it("never treats port call or AIS as clearance authority",()=>{
  expect(API).toContain("operationalClearance:false");
  expect(E).not.toMatch(/automatic_clearance|auto_clearance/i);
 });
});
describe("P17-B Project master-data editing",()=>{
 it("exposes Project-scoped PM draft, submit and Admin decision endpoints",()=>{
  for(const route of ["/api/v1/projects/:projectId/master-data-change-requests","/api/v1/projects/:projectId/master-data-change-requests/:requestId","/api/v1/admin/projects/:projectId/master-data-change-requests/:requestId/decision"])expect(API).toContain(route);
  expect(API).toContain("pks.master_data.change_request.manage");
  expect(API).toContain("independent Platform Admin");
 });
 it("keeps canonical facility/organization writes behind the existing database approval trigger",()=>{
  expect(API).toContain("public.p2a_master_data_change_requests");
  expect(API).toContain("status='draft' AND requested_by=$6::uuid");
  expect(API).toContain("requireAuth,requireAdmin,async(req:R,res:Response)=>");
  expect(API).toContain("submitted requests are immutable");
 });
});
describe("P17-B logistics chain simulation and PM governance",()=>{
 const L=readFileSync(join(ROOT,"migrations","099_p17b_logistics_scenario_and_pm_change_requests.sql"),"utf8");
 it("exposes Project-scoped scenario and logistics change request endpoints",()=>{
  for(const route of ["/api/v1/projects/:projectId/pke-logistics/scenarios","/api/v1/projects/:projectId/pke-logistics/change-requests","/api/v1/projects/:projectId/pke-logistics/change-requests/:requestId","/api/v1/admin/projects/:projectId/pke-logistics/change-requests/:requestId/decision"])expect(API).toContain(route);
  expect(API).toContain("pke.logistics.master.change_request.manage");
 });
 it("enforces linked PKS-route-port-terminal-service-warehouse scenario integrity",()=>{
  for(const relation of ["v_route.pks_site_id<>NEW.pks_site_id","v_route.port_id<>NEW.port_id","v_terminal.port_id<>NEW.port_id","v_service.port_id<>NEW.port_id","v_warehouse.port_id<>NEW.port_id"])expect(L).toContain(relation);
  expect(L).toContain("simulation_only IS TRUE");
  expect(L).toContain("SIMULATION_ONLY:%");
 });
 it("keeps simulated records unverified and source-rights unapproved",()=>{
  expect(L).toContain("verification_status='unverified'");
  expect(L).toContain("PKE logistics change request permission required");
  expect(L).toContain("Only Platform Admin may decide logistics change request");
 });
});
describe("P17-B isolated logistics simulation graph",()=>{
 it("provides Project-scoped scenario create/read/update APIs",()=>{
  for(const route of ["/api/v1/projects/:projectId/pke-logistics/scenarios","/api/v1/projects/:projectId/pke-logistics/simulation-scenarios","/api/v1/projects/:projectId/pke-logistics/simulation-scenarios/:scenarioId"])expect(API).toContain(route);
  expect(API).toContain("pke.logistics.master.change_request.manage");
  expect(API).toContain("p17b_logistics_simulation_scenarios");
 });
 it("validates all six logistics nodes and their relationship edges",()=>{
  for(const node of ["pks_site","road_route","port","terminal","loading_service","warehouse"])expect(SIM).toContain("'"+node+"'");
  for(const edge of ["pks_to_road_route","road_route_to_port","port_has_terminal","terminal_has_loading_service","terminal_has_warehouse"])expect(SIM).toContain("'"+edge+"'");
  expect(SIM).toContain("simulation_only IS TRUE");
  expect(SIM).toContain("verification_status");
 });
 it("keeps simulations non-canonical and Project-scoped with audit events",()=>{
  expect(SIM).toContain("p17b_logistics_simulation_audit");
  expect(SIM).toContain("pke_has_project_permission(project_id,'pke.logistics.master.view')");
  expect(SIM).toContain("pke_has_project_permission(project_id,'pke.logistics.master.change_request.manage')");
 });
});
describe("P17-B logistics change scope and stale snapshot guard",()=>{
 const SCOPE=readFileSync(join(ROOT,"migrations","102_p17b_logistics_request_scope_guard.sql"),"utf8");
 it("checks project scope for each canonical logistics target",()=>{
  for(const guard of ["pke_p16_project_port_permission","pke_p16_project_warehouse_permission","project_pks_site_participation","route.estimate","port.view","warehouse.view"])expect(SCOPE).toContain(guard);
 });
 it("rejects stale snapshots before approval",()=>{
  expect(SCOPE).toContain("Logistics master target changed since proposal creation");
  expect(SCOPE).toContain("p17b_logistics_change_00_scope_guard");
  expect(SCOPE).toContain("p17b_logistics_change_scope_insert");
 });
});
describe("P17-B simulation edge topology",()=>{
 const EDGES=readFileSync(join(ROOT,"migrations","103_p17b_logistics_simulation_edge_semantics.sql"),"utf8");
 it("requires five unique, correctly directed logistics edges",()=>{
  for(const relation of ["pks_to_road_route","road_route_to_port","port_has_terminal","terminal_has_loading_service","terminal_has_warehouse"])expect(EDGES).toContain("'"+relation+"'");
  expect(EDGES).toContain("endpoint types do not match");
  expect(EDGES).toContain("exactly the five typed logistics relationships");
 });
});
describe("P17-B Project Manager role catalogue",()=>{
 const CATALOG=readFileSync(join(ROOT,"src","role-catalogue.ts"),"utf8");
 it("grants Project Manager the Project-scoped logistics workbench permissions",()=>{
  const pm=CATALOG.slice(CATALOG.indexOf('role("pm"'),CATALOG.indexOf('role("internal_auditor"'));
  expect(pm).toContain('"pke.logistics.master.view"');
  expect(pm).toContain('"pke.logistics.master.change_request.manage"');
 });
});
describe("P17-B Platform Admin and Project PM workbench access",()=>{
 it("allows Platform Admin to enter Project-scoped logistics routes while PM remains permission-scoped",()=>{
  expect(API).toContain("const requireProjectAccess=async");
  expect(API).toContain("public.pke_is_platform_admin() AS is_admin");
  expect(API).toContain("return requireProjectPermission(req,res,projectId,permission)");
  expect(API).toContain("set_config('app.current_project_id',$1,true)");
 });
});
describe("P17-A Platform Admin source governance workbench",()=>{
 it("mounts the source registry only for Platform Admin on the port workspace",()=>{
  expect(PORT_UI).toContain('import MaritimeSourceRegistry from "./MaritimeSourceRegistry"');
  expect(PORT_UI).toContain("<MaritimeSourceRegistry platformAdmin={platformAdmin} />");
  expect(SOURCE_UI).toContain('if(!platformAdmin)return null');
 });
 it("supports source registration, rights decisions and field-purpose permission with fail-closed activation",()=>{
  expect(SOURCE_UI).toContain("/admin/maritime/sources");
  expect(SOURCE_UI).toContain("/rights");
  expect(SOURCE_UI).toContain("/field-permissions");
  expect(SOURCE_UI).toContain("/enable");
  expect(SOURCE_UI).toContain("rightsEvidenceUrl");
  expect(SOURCE_UI).toContain("internalProcessingAllowed");
  expect(SOURCE_UI).toContain("Aktifkan sumber");
  expect(API).toContain("RIGHTS_EVIDENCE_REQUIRED");
  expect(API).toContain("SOURCE_RIGHTS_NOT_CURRENT");
 });
});
describe("P17-B Project PM simulation scenario creation",()=>{
 it("provides PM/Admin create flow with six unverified nodes and five typed edges",()=>{
  expect(SCENARIO_UI).toContain("/pke-logistics/simulation-scenarios");
  expect(SCENARIO_UI).toContain("scenarioCode:code");
  expect(SCENARIO_UI).toContain("simulation_only:true");
  expect(SCENARIO_UI).toContain("verification_status:\"unverified\"");
  expect(SCENARIO_UI).toContain("pks_to_road_route");
  expect(SCENARIO_UI).toContain("terminal_has_warehouse");
  expect(SCENARIO_UI).toContain("dispatch_allowed:false");
  expect(SCENARIO_UI).toContain("production_use_allowed:false");
 });
});
describe("P17-B Platform Admin identity and geospatial review UI",()=>{
 it("loads the protected crosswalk and GeoJSON review queues",()=>{
  expect(PORT_UI).toContain("<MaritimeIdentityReview platformAdmin={platformAdmin} />");
  expect(IDENTITY_UI).toContain('if(!platformAdmin)return null');
  expect(IDENTITY_UI).toContain("/admin/maritime/port-crosswalk");
  expect(IDENTITY_UI).toContain("/admin/maritime/port-geospatial-features");
 });
 it("requires substantive independent review notes before crosswalk or geometry decisions",()=>{
  expect(IDENTITY_UI).toContain("Catatan review minimal 5 karakter");
  expect(IDENTITY_UI).toContain("reviewStatus:status");
  expect(API).toContain("PORT_CROSSWALK_MAKER_CHECKER");
  expect(API).toContain("PORT_GEO_MAKER_CHECKER");
 });
});
describe("P17 Production-safe read projections",()=>{
 const MAIN=readFileSync(join(ROOT,"src","index.ts"),"utf8");
 const APP=readFileSync(join(ROOT,"frontend","src","App.tsx"),"utf8");
 const PAGE=readFileSync(join(ROOT,"frontend","src","role-permissions.ts"),"utf8");
 const PORT=readFileSync(join(ROOT,"frontend","src","PortNetworkPage.tsx"),"utf8");
 it("reads shipment events and loading tickets using Project-scoped SQL predicates",()=>{
  expect(MAIN).toContain("/api/v1/projects/:projectId/shipments/:shipmentId/timeline");
  expect(MAIN).toContain("/api/v1/projects/:projectId/loading-operations/:operationId/tickets");
  expect(MAIN).toContain("WHERE shipment_id=$1::uuid AND project_id=$2::uuid");
  expect(MAIN).toContain("WHERE loading_operation_id=$1::uuid AND project_id=$2::uuid");
 });
 it("mounts the maritime workspace and gates it by Project permissions",()=>{
  expect(APP).toContain("MaritimeOperationsWorkspace");
  expect(APP).toContain("/maritime-operations");
  expect(PAGE).toContain("'maritime-operations'");
 });
 it("discloses the buyer identity/grant blocker and preliminary assessment limitation",()=>{
  expect(APP).toContain("identitas Neon Auth belum dipetakan");
  expect(PORT).toContain("tidak pernah menjadi izin sandar atau navigasi");
 });
});
describe("P17 role dashboard linkage",()=>{
 const DASH=readFileSync(join(ROOT,"frontend","src","RoleDashboardPage.tsx"),"utf8");
 it("provides maritime navigation for Project roles with vessel/shipping responsibilities",()=>{
  expect(DASH).toContain("Voyage & kapal");
  expect(DASH).toContain("Parsial / read-only");
  expect(DASH).toContain("Project Manager");
 });
 it("does not claim AIS, buyer visibility or loading completion acceptance",()=>{
  expect(DASH).toContain("AIS provider");
  expect(DASH).toContain("buyer shipment projection");
  expect(DASH).toContain("actual sign-off belum lulus");
 });
});
describe("P17 buyer portal navigation fail-closed",()=>{
 const PAGE=readFileSync(join(ROOT,"frontend","src","role-permissions.ts"),"utf8");
 it("keeps buyer portal hidden until server-side identity mapping and grants are ready",()=>{
  expect(PAGE).toContain("if (pageKey === 'buyer') return false");
  expect(PAGE).toContain("verified Neon Auth");
 });
});
describe("P17 schema release safety gate",()=>{
 it("installs a pre-route middleware that blocks the P17 mutation surfaces",()=>{
  const gate=API.slice(API.indexOf("const p17WriteReleaseGate"),API.indexOf("const {requireAuth"));
  expect(gate).toContain('app.use(p17WriteReleaseGate)');
  expect(gate).toContain('503,"P17_SCHEMA_RELEASE_BLOCKED"');
  expect(gate).toContain("migrations 096-103");
  for(const fragment of ["admin/maritime/","master-data-change-requests","pke-logistics/","simulation-scenarios","voyages","vessel-nominations","vessel-port-calls","admin/projects/"]) expect(gate).toContain(fragment);
  expect(gate).toContain('if(!["POST","PUT","PATCH","DELETE"].includes(req.method)) return next()');
 });
 it("does not install a broad /projects write block",()=>{
  const gate=API.slice(API.indexOf("const p17WriteReleaseGate"),API.indexOf("const {requireAuth"));
  expect(gate).not.toContain('path.startsWith("/api/v1/projects/")');
 });
});


describe("P17 migration atomicity",()=>{
 it.each([
  ["096",A],
  ["097",E],
  ["098",readFileSync(join(ROOT,"migrations","098_p17b_port_identity_geospatial.sql"),"utf8")],
  ["099",readFileSync(join(ROOT,"migrations","099_p17b_logistics_scenario_and_pm_change_requests.sql"),"utf8")],
  ["100",readFileSync(join(ROOT,"migrations","100_p17b_logistics_change_audit.sql"),"utf8")],
  ["101",SIM],
  ["102",readFileSync(join(ROOT,"migrations","102_p17b_logistics_request_scope_guard.sql"),"utf8")],
  ["103",readFileSync(join(ROOT,"migrations","103_p17b_logistics_simulation_edge_semantics.sql"),"utf8")]
 ])("wraps migration %s in a single transaction",(_id,sql)=>{
  expect(sql.trimStart()).toMatch(/^--[\s\S]*?BEGIN;/);
  expect(sql.trimEnd()).toMatch(/COMMIT;$/);
 });
});
