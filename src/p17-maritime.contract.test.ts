import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT=process.cwd();
const API=readFileSync(join(ROOT,"src","p17-maritime.ts"),"utf8");
const MAIN=readFileSync(join(ROOT,"src","index.ts"),"utf8");
const A=readFileSync(join(ROOT,"migrations","096_p17a_maritime_source_governance_ingestion.sql"),"utf8");
const E=readFileSync(join(ROOT,"migrations","097_p17e_project_maritime_workflows.sql"),"utf8");
const M104=readFileSync(join(ROOT,"migrations","104_p17e_nomination_submission_guard.sql"),"utf8");
const M105=readFileSync(join(ROOT,"migrations","105_p17f_buyer_identity_and_grant_audit.sql"),"utf8");
const M106=readFileSync(join(ROOT,"migrations","106_p17d_vessel_position_observations.sql"),"utf8");
const M107=readFileSync(join(ROOT,"migrations","107_p17e_loading_survey_reconciliation_laytime.sql"),"utf8");
const M108=readFileSync(join(ROOT,"migrations","108_p17f_buyer_mapping_rls_recursion_fix.sql"),"utf8");
const M109=readFileSync(join(ROOT,"migrations","109_p17f_buyer_self_read_rls_recursion_fix.sql"),"utf8");
const M110A=readFileSync(join(ROOT,"migrations","110a_p17d_legacy_position_project_scope.sql"),"utf8");
const ROLES=readFileSync(join(ROOT,"src","role-catalogue.ts"),"utf8");
const SIM=readFileSync(join(ROOT,"migrations","101_p17b_logistics_simulation_graph.sql"),"utf8");
const SOURCE_UI=readFileSync(join(ROOT,"frontend","src","MaritimeSourceRegistry.tsx"),"utf8");
const PORT_UI=readFileSync(join(ROOT,"frontend","src","PortNetworkPage.tsx"),"utf8");
const SCENARIO_UI=readFileSync(join(ROOT,"frontend","src","PkeLogisticsScenarioWorkbench.tsx"),"utf8");
const IDENTITY_UI=readFileSync(join(ROOT,"frontend","src","MaritimeIdentityReview.tsx"),"utf8");
const PAGE=readFileSync(join(ROOT,"frontend","src","role-permissions.ts"),"utf8");
const WORKSPACE=readFileSync(join(ROOT,"frontend","src","MaritimeOperationsWorkspace.tsx"),"utf8");
const WORKFLOW_ACTIONS=readFileSync(join(ROOT,"frontend","src","P17WorkflowActions.tsx"),"utf8");
const AIS_ADMIN_UI=readFileSync(join(ROOT,"frontend","src","P17AisAdminPanel.tsx"),"utf8");
const BUYER_UI=readFileSync(join(ROOT,"frontend","src","P17BuyerVisibilityPanel.tsx"),"utf8");
const INGESTION_UI=readFileSync(join(ROOT,"frontend","src","P17IngestionRunPanel.tsx"),"utf8");
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
  expect(API).toContain("MARITIME_RIGHTS_REVIEW_INVALID");
  expect(API).toContain("SOURCE_RIGHTS_NOT_ACTIVE");
 });
 it("records immutable run identity, content hashes and idempotent staging",()=>{
  expect(A).toContain("UNIQUE(source_id,idempotency_key)");
  expect(A).toContain("UNIQUE(run_id,external_record_id,payload_sha256)");
  expect(A).toContain("payload_sha256 ~ '^[0-9a-f]{64}$'");
  expect(API).toContain("ON CONFLICT(run_id,external_record_id,payload_sha256) DO NOTHING");
  expect(API).toContain("SOURCE_QUOTA_EXHAUSTED");
  expect(API).toContain("createHash(\"sha256\")");
  expect(API).toContain("Array.isArray(payload)");
  expect(API).toContain("JSON.stringify(canonicalize(payload))");
  expect(API).toContain("quotaLimit=source.rows[0].quota_limit==null?null:Number(source.rows[0].quota_limit)");
  expect(API).toContain("rejected>seen");
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
  expect(API).toContain("PORT_CALL_INPUT_INVALID");
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
  for(const route of ["/api/v1/projects/:projectId/master-data-change-requests","/api/v1/projects/:projectId/master-data-change-requests/:requestId"])expect(MAIN).toContain(route);
  expect(MAIN).toContain("pks.master_data.change_request.manage");
  expect(MAIN).toContain("Platform Admin may decide but may not rewrite the submitted proposal.");
 });
 it("keeps canonical facility/organization writes behind the existing database approval trigger",()=>{
  expect(MAIN).toContain("public.p2a_master_data_change_requests");
  expect(MAIN).toContain("WHERE id=${idx++}::uuid AND project_id=${idx}::uuid RETURNING *");
  expect(MAIN).toContain("if (isAdmin)");
  expect(MAIN).toContain("Canonical data changed after submission.");
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
  expect(API).toContain("validateSimulationGraph(graph)");
  expect(API).toContain("validSimulationEvidence(evidence)");
  expect(API).toContain("P17B_CHANGE_EVIDENCE_REQUIRED");
  expect(API).toContain("operationalUseAllowed:false");
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
  expect(API).toContain("MARITIME_RIGHTS_REVIEW_INVALID");
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
  expect(API).toContain("validGeoJson(featureType,geometry)");
  expect(API).toContain("createHash(\"sha256\").update(JSON.stringify(canonicalize(geometry)))");
  expect(API).toContain("geoRing");
 });
 it("requires substantive independent review notes before crosswalk or geometry decisions",()=>{
  expect(IDENTITY_UI).toContain("Catatan review minimal 5 karakter");
  expect(IDENTITY_UI).toContain("reviewStatus:status");
  expect(API).toContain("PORT_CROSSWALK_MAKER_CHECKER");
  expect(API).toContain("JSON.stringify(canonicalize(snapshot))");
  expect(API).toContain("Object.keys(snapshot).length===0");
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
  expect(APP).toContain("buyerPortalEnabled");
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
  expect(DASH).toContain("BuyerAccessControlPanel");
  expect(DASH).toContain("actual sign-off tetap terpisah");
 });
});
describe("P17 Buyer Portal server-derived visibility",()=>{
 const PAGE=readFileSync(join(ROOT,"frontend","src","role-permissions.ts"),"utf8");
 it("requires an authenticated mapped identity and an active supported grant before showing the portal",()=>{
  expect(PAGE).toContain("user.buyerPortalEnabled === true");
  expect(MAIN).toContain("buyerPortalEnabled");
  expect(API).toContain("identityMapped:identity.rows[0]?.identity_mapped===true");
  expect(readFileSync(join(ROOT,"frontend","src","App.tsx"),"utf8")).toContain("buyerAccess.data?.identityMapped === true");
  expect(MAIN).toContain("g.scope IN ('summary','milestones')");
 });
});
describe("P17 schema release safety gate",()=>{
 it("installs a pre-route middleware that blocks the P17 mutation surfaces",()=>{
  const gate=API.slice(API.indexOf("const p17WriteReleaseGate"),API.indexOf("const {requireAuth"));
  expect(gate).toContain('app.use(p17WriteReleaseGate)');
  expect(gate).toContain('503,"P17_SCHEMA_RELEASE_BLOCKED"');
  expect(gate).toContain("migrations 096-110");
  for(const migration of ["108_p17f_buyer_mapping_rls_recursion_fix.sql","109_p17f_buyer_self_read_rls_recursion_fix.sql","110_p17d_vessel_position_runtime_rls_fix.sql"]) expect(gate).toContain(migration);
  expect(gate).toContain("P17_AIS_PROJECT_SCOPE_BLOCKED");
  expect(gate).toContain("pke_has_project_permission");
  expect(gate).toContain("pke_has_any_project_permission");
  expect(gate).toContain("app.current_project_id");
  expect(gate).toContain("vessel.position.review");
  for(const permission of ["documents.view","workflow.view","port.view","shipping.update","shipping.view","vessel.nominate","vessel.nomination.review","vessel.port_call.confirm","vessel.port_call.manage","vessel.position.view","vessel.view","voyage.create","voyage.update","voyage.view"]) expect(gate).toContain(permission);
  expect(gate).toContain("terminal_representative");
  expect(gate).toContain("internal_auditor");
  for(const fragment of ["admin/maritime/","master-data-change-requests","pke-logistics","scenarios","simulation-scenarios","voyages","vessel-nominations","vessel-port-calls","buyer-visibility-grants","loading-operations","admin"]) expect(gate).toContain(fragment);
  expect(gate).toContain("const mutating=[\"POST\",\"PUT\",\"PATCH\",\"DELETE\"].includes(req.method)");
  expect(gate).toContain("const protectedPath=schemaAdmin||buyerProjection||p17AdminProjectWorkflow||p17SchemaBackedRead||(p17ProjectWorkflow&&mutating)");
  expect(gate).toContain("const p17SchemaBackedRead=");
  for(const readPath of ["buyer-visibility-grant-candidates","voyages","vessel-nominations","vessel-port-calls","loading-operations","advisory-screening","vessel-positions","p17-control-tower"])expect(gate).toContain(readPath);
  expect(gate).toContain("/api/v1/admin/p17-control-tower");
  expect(gate).toContain("migration_history");
  expect(gate).toContain("status='applied'");
  expect(gate).toContain("relrowsecurity");
  expect(gate).toContain("policy_count");
  expect(gate).toContain('"buyer_auth_mapping_events"');
  expect(gate).toContain('"buyer_visibility_grant_events"');
  expect(gate).toContain("requiredPermissions");
  expect(gate).toContain("pke_project_role_permission_allowlist");
  expect(gate).toContain("P17_ROLE_PERMISSION_RELEASE_BLOCKED");
  expect(gate).toContain("if(!protectedPath)return next()");
 });
 it("does not install a broad /projects write block",()=>{
  const gate=API.slice(API.indexOf("const p17WriteReleaseGate"),API.indexOf("const {requireAuth"));
  expect(gate).not.toContain('path.startsWith("/api/v1/projects/")');
 });
});


describe("P17-D legacy AIS Project-scope correction",()=>{
 it("replaces the global legacy read policy with a current-Project permission check",()=>{
  expect(M110A).toContain("DROP POLICY IF EXISTS pke_scope_select");
  expect(M110A).toContain("source_id IS NULL");
  expect(M110A).toContain("app.current_project_id");
  expect(M110A).toContain("pke_has_project_permission");
  const policyDefinition=M110A.slice(M110A.indexOf("CREATE POLICY"),M110A.indexOf("DO $verify$"));
  expect(policyDefinition).not.toContain("pke_has_any_project_permission");
  expect(M110A).toContain("position('pke_has_any_project_permission' IN policy_expression)");
  expect(M110A).toContain("vessel.position.view");
  expect(M110A).toContain("COMMIT;");
 });
});

describe("P17 migration atomicity",()=>{
 it("wraps migration 110a in one explicit transaction",()=>{
  expect(M110A.trimStart()).toMatch(/^--[\\s\\S]*?BEGIN;/);
  expect(M110A.trimEnd()).toMatch(/COMMIT;$/);
  expect((M110A.match(/^BEGIN;\\s*$/gim)||[]).length).toBe(1);
  expect((M110A.match(/^COMMIT;\\s*$/gim)||[]).length).toBe(1);
 });
 it.each([
  ["096",A],
  ["097",E],
  ["098",readFileSync(join(ROOT,"migrations","098_p17b_port_identity_geospatial.sql"),"utf8")],
  ["099",readFileSync(join(ROOT,"migrations","099_p17b_logistics_scenario_and_pm_change_requests.sql"),"utf8")],
  ["100",readFileSync(join(ROOT,"migrations","100_p17b_logistics_change_audit.sql"),"utf8")],
  ["101",SIM],
  ["102",readFileSync(join(ROOT,"migrations","102_p17b_logistics_request_scope_guard.sql"),"utf8")],
  ["103",readFileSync(join(ROOT,"migrations","103_p17b_logistics_simulation_edge_semantics.sql"),"utf8")],
  ["104",M104],
  ["105",M105],
  ["106",M106],
  ["107",M107]
 ])("wraps migration %s in a single transaction",(_id,sql)=>{
  expect(sql.trimStart()).toMatch(/^--[\s\S]*?BEGIN;/);
  expect(sql.trimEnd()).toMatch(/COMMIT;$/);
 });
});

describe("P17-A/B API/database schema alignment",()=>{
 it("persists migration-096 rights and field-purpose evidence without exposing secret references",()=>{
  for(const col of ["commercial_use_allowed","internal_processing_allowed","customer_display_allowed","redistribution_allowed","derivative_use_allowed","caching_allowed","retention_days","terms_url","rights_evidence_url","attribution_text","rights_expires_at","evidence_reference","reviewed_by","reviewed_at"])expect(API).toContain(col);
  expect(API).not.toContain("credential_secret_ref");
 });
 it("uses migration-096 ingestion columns and quota/field-purpose controls",()=>{
  for(const col of ["dataset_code","run_status","started_at","triggered_by","entity_type","raw_payload","review_status","details","checked_by","maritime_provider_usage","SOURCE_QUOTA_EXHAUSTED","MARITIME_FIELD_PURPOSE_BLOCKED"])expect(API).toContain(col);
  expect(API).not.toContain("maritime_ingestion_runs(source_id,idempotency_key,status");
  expect(API).not.toContain("maritime_ingestion_staging(run_id,external_record_id,payload");
  expect(API).not.toContain("maritime_provider_health(source_id,health_status,latency_ms,message");
 });
 it("aligns P17-B response keys and database review enums",()=>{
  expect(API).toContain("return res.json({crosswalk:q.rows})");
  expect(API).toContain("return res.json({features:q.rows})");
  expect(API).toContain('["matched","rejected","superseded"]');
  expect(API).toContain('["verified","rejected","superseded"]');
 });
 it("uses the per-request RLS transaction and never checks out another pool connection",()=>{
  expect(API).not.toContain("req.db.connect()");
  expect(API).not.toContain('req.db.query("BEGIN")');
  expect(API).not.toContain('req.db.query("COMMIT")');
 });
});

describe("P17-E nomination lifecycle completion",()=>{
 it("supports nominator submission, independent versioned review and withdrawal",()=>{
  expect(API).toContain("/vessel-nominations/:id/submit");
  expect(API).toContain("/vessel-nominations/:id/withdraw");
  expect(API).toContain("decision_note=$4");
  expect(API).toContain("expectedVersion");
  expect(M104).toContain("OLD.nomination_status='draft' AND NEW.nomination_status='submitted'");
  expect(M104).toContain("NEW.version<>OLD.version+1");
  expect(M104).toContain("Independent nomination reviewer and decision note required");
 });
 it("persists voyage, nomination and port-call workflow events",()=>{
  expect(API).toContain("nomination_submitted");
  expect(API).toContain("nomination_reviewed");
  expect(API).toContain("nomination_withdrawn");
  expect(API).toContain("port_call_created");
  expect(API).toContain("/api/v1/projects/:projectId/maritime-workflow-events");
  expect(readFileSync(join(ROOT,"frontend","src","MaritimeOperationsWorkspace.tsx"),"utf8")).toContain("Maritime workflow timeline");
  expect(E).toContain("maritime_workflow_events");
 });
});
describe("P17-F Buyer identity and visibility",()=>{
 it("requires verified Neon Auth identity, independent mapping review and scoped grants",()=>{
  expect(M105).toContain("neon_auth_user_id IS NOT NULL");
  expect(M105).toContain("reviewed_by<>created_by");
  expect(M105).toContain("buyer_visibility_grants_buyer_read");
  expect(M105).toContain("shipments_buyer_summary_read");
  expect(M105).toContain("buyer_auth_mapping_project_grant_manager_read");
  expect(M105).toContain("('pm','buyer.visibility.manage')");
  expect(M105).toContain("('buyer','buyer.shipment.view')");
  expect(M105).toContain("buyer_auth_mapping_single_user_uq");
  expect(M105).toContain("buyer_auth_mapping_single_owner_uq");
  expect(M105).not.toContain("user_id uuid NOT NULL UNIQUE");
  expect(API).toContain("m.mapping_status<>'revoked'");
  expect(M105).toContain("INSERT INTO public.permissions(name,code,description,is_active)");
  expect(M105).toContain("INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)");
  expect(API).toContain("buyer-visibility-grant-candidates");
  expect(API).toContain("BUYER_GRANT_EXPIRY_FAILED");
  expect(readFileSync(join(ROOT,"frontend","src","RoleDashboardPage.tsx"),"utf8")).toContain("expireGrants");
  expect(readFileSync(join(ROOT,"frontend","src","RoleDashboardPage.tsx"),"utf8")).toContain("BuyerAccessControlPanel");
  expect(API).toContain("/api/v1/admin/buyer-auth-mappings");
  expect(API).toContain("/buyer-visibility-grants");
  expect(API).toContain("/api/v1/buyer/shipments");
  expect(API).toContain("g.status='active'");
 });
});
describe("P17-G Project export control tower",()=>{
 it("uses actual Project-scoped shipment, loading, voyage and PKS-port route data",()=>{
  expect(API).toContain("/api/v1/projects/:projectId/p17-control-tower");
  expect(API).toContain("public.loading_tickets");
  expect(API).toContain("public.pks_port_routes");
  expect(API).toContain("lastKnownVesselPositions");
  expect(API).toContain("/advisory-screening");
  expect(API).toContain("operationalClearance:false");
  expect(API).toContain("plannedQuantityIsNotLoadedQuantity:true");
  expect(API).toContain("verified_ticket_quantity");
  expect(API).toContain("verified_unit_count<>1 OR a.unit<>t.verified_unit_code");
  expect(API).toContain("pke_capability_status");
  expect(API).toContain("aisPositionsAreLastKnownNotLive:true");
  expect(API).toContain("operationalClearance:false");
  expect(readFileSync(join(ROOT,"frontend","src","MaritimeOperationsWorkspace.tsx"),"utf8")).toContain("Project Export Control Tower");
 });
});

describe("P17-D evidence-backed AIS observations",()=>{
 it("requires current source rights, permitted fields, canonical MMSI and independent review",()=>{
  expect(API).toContain("/api/v1/admin/maritime/vessel-positions");
  expect(API).toContain("/api/v1/projects/:projectId/vessel-positions");
  expect(API).toContain("AIS_SOURCE_RIGHTS_BLOCKED");
  expect(API).toContain("AIS_PAYLOAD_HASH_MISMATCH");
  expect(API).toContain("AIS_PAYLOAD_FIELDS_MISMATCH");
  expect(API).toContain("AIS_VESSEL_IDENTITY_MISMATCH");
  expect(API).toContain("freshness_sla_seconds");
  expect(M106).toContain("vessel_tracking_source_review_stamp_ck");
  expect(M106).toContain("reviewed_by<>created_by");
  expect(M106).toContain("vessel_tracking_accepted_project_read");
  expect(M106).toContain("vessel_tracking_source_evidence_ck");
 });
});

describe("P17-E loading survey, quantity reconciliation and laytime",()=>{
 it("provides Project-scoped acceptance and evidence APIs",()=>{
  expect(API).toContain("/loading-operations/:operationId/unit");
  expect(API).toContain("/loading-operations/:operationId/acceptances");
  expect(API).toContain('["shipping.view","shipping.survey.view","shipping.laytime.view","loading.quantity.reconcile"]');
  expect(API).toContain("LOADING_TICKETS_NOT_VERIFIED");
  expect(API).toContain("verifiedTicketUnits.length!==1");
  expect(API).toContain("completedSegmentUnits.length!==1");
  expect(API).toContain("LOADING_SEGMENT_UNIT_MISMATCH");
  expect(API).toContain("LOADING_ACCEPTANCE_MAKER_CHECKER");
  expect(API).toContain("LAYTIME_EVIDENCE_INVALID");
  expect(API).toContain("quantity_variance");
  expect(readFileSync(join(ROOT,"frontend","src","MaritimeOperationsWorkspace.tsx"),"utf8")).toContain("LoadingAcceptancePanel");
  expect(readFileSync(join(ROOT,"frontend","src","MaritimeOperationsWorkspace.tsx"),"utf8")).toContain("operationTicketVariance");
  expect(readFileSync(join(ROOT,"frontend","src","MaritimeOperationsWorkspace.tsx"),"utf8")).toContain("segmentTicketVariance");
 });
 it("enforces immutable evidence, independent reviewers and no acceptance with quantity variance",()=>{
  expect(M107).toContain("loading_operation_acceptances");
  expect(M107).toContain("evidence_size_bytes bigint NOT NULL");
  expect(API).toContain("privateStorage.verifyObject(evidence,evidenceSize,hash)");
  expect(readFileSync(join(ROOT,"src","index.ts"),"utf8")).toContain("privateStorage });");
  expect(API).toContain("/acceptances/presign");
  expect(readFileSync(join(ROOT,"frontend","src","MaritimeOperationsWorkspace.tsx"),"utf8")).toContain("Upload & submit evidence");
  expect(M107).toContain("reviewed_by<>submitted_by");
  expect(M107).toContain("Quantity reconciliation with variance cannot be accepted");
  expect(M107).toContain("loading_acceptance_one_pending_uq");
  expect(API).toContain("latest_version_no");
  expect(API).toContain("is_latest");
  expect(M107).toContain("loading_acceptance_admin_all");
  expect(M107).toContain("loading_acceptance_review_ck");
  expect(M107).toContain("CREATE TRIGGER loading_operation_unit_guard");
  expect(M107).toContain("pke_guard_loading_operation_unit");
  expect(M107).toContain("shipping.survey.review");
  expect(M107).toContain("shipping.laytime.verify");
 });
});


describe("P17-D AIS evidence and freshness hardening",()=>{
 it("uses one atomic extension of the canonical tracking table and preserves legacy-only global reads",()=>{
  expect((M106.match(/\bBEGIN;/g)||[])).toHaveLength(1);
  expect((M106.match(/\bCOMMIT;/g)||[])).toHaveLength(1);
  expect((M106.match(/CREATE OR REPLACE FUNCTION/g)||[])).toHaveLength(1);
  expect(M106).toContain("source_id IS NULL AND public.pke_has_any_project_permission");
  expect(M106).toContain("review_status='accepted'");
  expect(M106).toContain("source_class='ais'");
 });
 it("derives fresh or stale from the approved source SLA, never calls unknown live",()=>{
  expect(API).toContain("metadata?.freshness_sla_seconds");
  expect(API).toContain("freshness_delayed_grace_seconds");
  expect(API).toContain("AIS_PAYLOAD_HASH_MISMATCH");
  expect(API).toContain("AIS_PAYLOAD_FIELDS_MISMATCH");
  expect(readFileSync(join(ROOT,"frontend","src","MaritimeSourceRegistry.tsx"),"utf8")).toContain("freshnessDelayedGraceSeconds");
  expect(API).toContain("AIS_OBSERVATION_TIME_FUTURE");
  expect(API).toContain(':"unknown"');
  expect(API).toContain("freshness_status");
 });
});

describe("P17-E loading acceptance database invariants",()=>{
 it("has one atomic table/trigger definition with declared reconciliation variables",()=>{
  expect((M107.match(/\bBEGIN;/g)||[])).toHaveLength(1);
  expect((M107.match(/\bCOMMIT;/g)||[])).toHaveLength(1);
  expect((M107.match(/CREATE TABLE/g)||[])).toHaveLength(1);
  expect(M107).toContain("DECLARE\n  operation_quantity numeric;");
  expect(M107).toContain("Quantity reconciliation with variance cannot be accepted");
  expect(M107).toContain("NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()");
 });
 it("provisions the full survey and laytime permission set to the matching operational roles",()=>{
  for(const permission of ["shipping.survey.view","shipping.survey.submit","shipping.survey.review","shipping.laytime.view","shipping.laytime.manage","shipping.laytime.verify","loading.quantity.reconcile"])expect(M107).toContain(permission);
  expect(M107).toContain("INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)");
 });
});

describe("P17-F Buyer identity lifecycle hardening",()=>{
 it("exposes Buyer Portal only after the server confirms a mapped identity and active grant",()=>{
  expect(MAIN).toContain("buyerPortalEnabled");
  expect(MAIN).toContain("m.mapping_status='active'");
  expect(readFileSync(join(ROOT,"frontend","src","App.tsx"),"utf8")).toContain("Lihat milestone");
  expect(PAGE).toContain("if (pageKey === 'buyer') return user.buyerPortalEnabled === true");
 });
 it("records mapping lifecycle events and permits only independent state transitions",()=>{
  expect(M105).toContain("buyer_auth_mapping_events");
  expect(M105).toContain("Invalid Buyer mapping lifecycle transition");
  expect(M105).toContain("NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()");
  expect(M105).toContain("u.neon_auth_user_id IS NOT NULL");
 });
});


describe("P17-B PKS to PKE port prioritization",()=>{
 it("ranks verified route candidates by evidenced PKE terminal, equipment and warehouse readiness",()=>{
  expect(API).toContain("evidence_candidate_only");
  expect(API).toContain("verified_pke_terminal_count");
  expect(API).toContain("verified_loading_equipment_count");
  expect(API).toContain("verified_warehouse_capacity_mt");
  expect(API).toContain("is_shipment_destination");
  expect(API).toContain("pr.verified_at IS NOT NULL");
  expect(readFileSync(join(ROOT,"frontend","src","MaritimeOperationsWorkspace.tsx"),"utf8")).toContain("nearby alternative");
  expect(readFileSync(join(ROOT,"frontend","src","MaritimeOperationsWorkspace.tsx"),"utf8")).toContain("capacity unknown");
 });
});

describe("P17-C advisory vessel and terminal compatibility",()=>{
 it("uses verified vessel dimensions and terminal operating restrictions without granting clearance",()=>{
  expect(API).toContain("/api/v1/projects/:projectId/vessels/:vesselId/advisory-screening");
  expect(API).toContain("operationalClearance:false");
  expect(API).toContain("insufficient_verified_data");
  expect(API).toContain("exceeds_advisory_limit");
  expect(API).toContain("PORT_PERMISSION_REQUIRED");
 });
 it("exposes the advisory screen in the Port Network UI",()=>{
  const ui=readFileSync(join(ROOT,"frontend","src","PortNetworkPage.tsx"),"utf8");
  expect(ui).toContain("P17-C · Advisory kompatibilitas kapal–terminal PKE");
  expect(ui).toContain("/advisory-screening?portId=");
  expect(ui).toContain("p17Advisory");
 });
});


describe("P17-F Buyer portal RLS recursion regression",()=>{
 it("keeps Buyer mapping self-read independent from Buyer row RLS",()=>{
  expect(M108).toContain("CREATE POLICY buyer_auth_mapping_self_read");
  expect(M108).toContain("public.pke_current_user_id()");
  expect(M108).toContain("u.neon_auth_user_id IS NOT NULL");
  expect(M108).not.toMatch(/JOIN\\s+public\\.buyers/i);
  expect(M108).not.toMatch(/FROM\\s+public\\.buyers/i);
 });
 it("validates active Buyer on the outer Buyer row without self-query recursion",()=>{
  expect(M109).toContain("CREATE POLICY buyers_verified_mapping_self_read");
  expect(M109).toContain("is_active IS TRUE");
  expect(M109).toContain("m.mapping_status = 'active'");
  expect(M109).toContain("u.neon_auth_user_id IS NOT NULL");
  expect(M109).not.toMatch(/FROM\\s+public\\.buyers/i);
 });
});


describe("P17 admin workspace reachability",()=>{
 it("mounts maritime source governance and port identity review in the Platform Admin workspace only",()=>{
  expect(WORKSPACE).toContain("MaritimeSourceRegistry");
  expect(WORKSPACE).toContain("MaritimeIdentityReview");
  expect(WORKSPACE).toContain("activeUser?.platformAdmin===true");
  expect(WORKSPACE).toContain("platformAdmin={true}");
 });
});


describe("P17 operational workflow UI",()=>{
 it("exposes voyage, nomination and port-call actions only behind Project permissions",()=>{
  expect(WORKSPACE).toContain("P17WorkflowActions");
  expect(WORKFLOW_ACTIONS).toContain("permissions.includes(\"voyage.create\")");
  expect(WORKFLOW_ACTIONS).toContain("permissions.includes(\"vessel.nominate\")");
  expect(WORKFLOW_ACTIONS).toContain("permissions.includes(\"vessel.nomination.review\")");
  expect(WORKFLOW_ACTIONS).toContain("permissions.includes(\"vessel.port_call.manage\")");
  expect(WORKFLOW_ACTIONS).toContain("permissions.includes(\"vessel.port_call.confirm\")");
  expect(WORKFLOW_ACTIONS).toContain("platformAdmin||permissions.includes");
  expect(WORKFLOW_ACTIONS).toContain("expectedVersion");
  expect(WORKFLOW_ACTIONS).toContain("crypto.randomUUID()");
 });
});


describe("P17-D AIS admin API and UI",()=>{
 it("provides an authenticated admin review queue and hash-verified observation intake",()=>{
  expect(API).toContain('app.get("/api/v1/admin/maritime/vessel-positions",requireAuth,requireAdmin');
  expect(API).toContain("AIS_ADMIN_QUEUE_READ_FAILED");
  expect(AIS_ADMIN_UI).toContain("/admin/maritime/vessel-positions?reviewStatus=pending");
  expect(AIS_ADMIN_UI).toContain("crypto.subtle.digest(\"SHA-256\"");
  expect(AIS_ADMIN_UI).toContain("payloadSha256");
  expect(AIS_ADMIN_UI).toContain("maker-checker");
  expect(WORKSPACE).toContain("P17AisAdminPanel");
 });
});


describe("P17-F Buyer identity and visibility UI",()=>{
 it("provides explicit Auth identity mapping review and Project-scoped grant management",()=>{
  expect(WORKSPACE).toContain("P17BuyerVisibilityPanel");
  expect(BUYER_UI).toContain("/admin/buyer-auth-mappings");
  expect(BUYER_UI).toContain("eligibleUsers");
  expect(BUYER_UI).toContain("Approve mapping");
  expect(BUYER_UI).toContain("/buyer-visibility-grants");
  expect(BUYER_UI).toContain("buyer.visibility.manage");
  expect(BUYER_UI).toContain("platformAdmin||permissions.includes");
  expect(BUYER_UI).toContain("Revoke grant");
 });
});


describe("P17-A provider ingestion staging UI",()=>{
 it("supports idempotent provider runs, canonical payload hashes, staging review and explicit run completion",()=>{
  expect(SOURCE_UI).toContain("P17IngestionRunPanel");
  expect(INGESTION_UI).toContain("/runs/");
  expect(INGESTION_UI).toContain("crypto.subtle.digest(\"SHA-256\"");
  expect(INGESTION_UI).toContain("payloadSha256");
  expect(INGESTION_UI).toContain("quarantined");
  expect(INGESTION_UI).toContain("Complete run");
  expect(INGESTION_UI).toContain("belum dipromosikan menjadi master data");
 });
});


describe("P17-B port identity and geospatial candidate forms",()=>{
 it("creates source-rights-gated crosswalk and GeoJSON candidates with recursive canonical SHA-256",()=>{
  expect(IDENTITY_UI).toContain("/admin/maritime/port-crosswalk");
  expect(IDENTITY_UI).toContain("/admin/maritime/port-geospatial-features");
  expect(IDENTITY_UI).toContain("crypto.subtle.digest(\"SHA-256\"");
  expect(IDENTITY_UI).toContain("Object.keys(v).sort()");
  expect(IDENTITY_UI).toContain("sourceSnapshot");
  expect(IDENTITY_UI).toContain("geometryGeojson");
 });
});


describe("P17-A to P17-B typed staging promotion",()=>{
 it("promotes only accepted port and geometry staging into pending evidence-reviewed candidates",()=>{
  expect(API).toContain('/admin/maritime/staging/:stagingId/promote');
  expect(API).toContain("MARITIME_STAGING_NOT_ACCEPTED");
  expect(API).toContain("r.triggered_by<>req_user_id()");
  expect(API).toContain("MARITIME_STAGING_MAKER_CHECKER");
  expect(API).toContain("MARITIME_PROMOTION_RIGHTS_BLOCKED");
  expect(API).toContain("canonicalMasterChanged:false");
  expect(INGESTION_UI).toContain("/promote");
  expect(INGESTION_UI).toContain("Promote to typed review candidate");
 });
});
