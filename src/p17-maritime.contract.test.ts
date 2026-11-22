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
