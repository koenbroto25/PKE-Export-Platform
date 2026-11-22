import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT=process.cwd();
const API=readFileSync(join(ROOT,"src","p17-maritime.ts"),"utf8");
const MAIN=readFileSync(join(ROOT,"src","index.ts"),"utf8");
const A=readFileSync(join(ROOT,"migrations","096_p17a_maritime_source_governance_ingestion.sql"),"utf8");
const E=readFileSync(join(ROOT,"migrations","097_p17e_project_maritime_workflows.sql"),"utf8");
const ROLES=readFileSync(join(ROOT,"src","role-catalogue.ts"),"utf8");
describe("P17-A maritime source governance",()=>{
 it("mounts authenticated admin-only source registry and ingestion endpoints",()=>{
  for(const route of ["/api/v1/admin/maritime/sources","/api/v1/admin/maritime/sources/:id/rights","/api/v1/admin/maritime/sources/:id/enable","/api/v1/admin/maritime/sources/:id/runs","/api/v1/admin/maritime/runs/:runId/staging"])expect(API).toContain(route);
  expect(MAIN).toContain("registerP17MaritimeRoutes(app");
 });
 it("fails closed on rights and expiry, stores secret references only",()=>{
  expect(A).toContain("rights_status='approved'");
  expect(A).toContain("internal_processing_allowed IS TRUE");
  expect(A).toContain("rights_expires_at > rights_reviewed_at");
  expect(A).toContain("credential_secret_ref");
  expect(A).not.toMatch(/api[_-]?key\s+text|secret_value\s+text/i);
  expect(API).toContain("RIGHTS_EVIDENCE_REQUIRED");
  expect(API).toContain("SOURCE_RIGHTS_NOT_ACTIVE");
 });
 it("records immutable run identity, content hashes and idempotent staging",()=>{
  expect(A).toContain("UNIQUE(source_id,idempotency_key)");
  expect(A).toContain("UNIQUE(run_id,external_record_id,payload_sha256)");
  expect(A).toContain("payload_sha256 ~ '^[0-9a-f]{64}$'");
  expect(API).toContain("STAGING_DUPLICATE");
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
 });
 it("never treats port call or AIS as clearance authority",()=>{
  expect(API).toContain("operationalClearance:false");
  expect(E).not.toMatch(/automatic_clearance|auto_clearance/i);
 });
});
