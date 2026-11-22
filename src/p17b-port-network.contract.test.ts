import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT=process.cwd();
const API=readFileSync(join(ROOT,"src","p17-maritime.ts"),"utf8");
const MIGRATION=readFileSync(join(ROOT,"migrations","098_p17b_port_identity_geospatial.sql"),"utf8");
const MAIN=readFileSync(join(ROOT,"src","index.ts"),"utf8");
const UI=readFileSync(join(ROOT,"frontend","src","PortNetworkPage.tsx"),"utf8");
describe("P17-B port identity and PKS-linked geospatial governance",()=>{
 it("exposes admin-only crosswalk and versioned geospatial review endpoints",()=>{
  for(const route of ["/api/v1/admin/maritime/port-crosswalk","/api/v1/admin/maritime/port-crosswalk/:id/review","/api/v1/admin/maritime/port-geospatial-features","/api/v1/admin/maritime/port-geospatial-features/:id/review"])expect(API).toContain(route);
  expect(API).toContain("requireAuth,requireAdmin");
 });
 it("requires current source rights and field-level internal processing grants",()=>{
  expect(API).toContain("s.source_class='port_master'");
  expect(API).toContain("s.source_class='port_geometry'");
  expect(API).toContain("external_port_identity");
  expect(API).toContain("geometry_geojson");
  expect(API).toContain("rights_status='approved'");
  expect(API).toContain("rights_expires_at>now()");
 });
 it("requires independent maker-checker review and explicit source evidence",()=>{
  expect(API).toContain("PORT_CROSSWALK_MAKER_CHECKER");
  expect(API).toContain("PORT_GEO_MAKER_CHECKER");
  expect(MIGRATION).toContain("created_by uuid REFERENCES public.users(id)");
  expect(MIGRATION).toContain("reviewed_by uuid REFERENCES public.users(id)");
  expect(MIGRATION).toContain("source_reference text NOT NULL");
 });
 it("keeps port/PKS identity, GeoJSON, provenance, license and versioning explicit",()=>{
  expect(MIGRATION).toContain("REFERENCES public.ports(id)");
  expect(MIGRATION).toContain("REFERENCES public.pks_sites(id)");
  expect(MIGRATION).toContain("geometry_geojson jsonb NOT NULL");
  expect(MIGRATION).toContain("geometry_sha256");
  expect(MIGRATION).toContain("license_code");
  expect(MIGRATION).toContain("dataset_version");
  expect(MIGRATION).toContain("version_no integer NOT NULL DEFAULT 1");
 });
 it("retains the existing PKS-to-port route as the operational relationship and does not duplicate P16 master tables",()=>{
  expect(MIGRATION).toContain("ALTER TABLE public.pks_port_routes");
  expect(MIGRATION).toContain("route_geometry_feature_id");
  expect(MIGRATION).not.toMatch(/CREATE TABLE public\.(ports|pks_sites|pks_port_routes)/);
  expect(MIGRATION).toContain("pks_port_routes_verified_priority_idx");
 });
 it("prioritizes only verified road routes with verified PKE loading capability",()=>{
  expect(MAIN).toContain("AS is_primary_reference");
  expect(MAIN).toContain("pke_loading_service_verified");
  expect(MAIN).toContain("producer_company_verified");
  expect(MAIN).toContain("po.organization_type='processor'");
  expect(MAIN).toContain("ps.facility_type IN ('kernel_crushing_plant','integrated_mill_kcp')");
  expect(MAIN).toContain("'palm_kernel_expeller'");
  expect(MAIN).toContain("LEFT JOIN public.partner_organizations po ON po.id=ps.organization_id");
  expect(UI).toContain("Produsen belum ditautkan");
  expect(UI).toContain("produsen:");
  expect(MAIN).toContain('"distance_method","route_geometry_feature_id"');
  expect(MAIN).toContain("distance_method IN ('road_network','operator_quote','gps_track')");
  expect(MAIN).toContain("ps.verification_evidence_sha256 ~ '^[0-9a-f]{64}$'");
  expect(MAIN).toContain("ls.evidence_sha256 ~ '^[0-9a-f]{64}$'");
  expect(MAIN).toContain("verified_warehouse_count");
  expect(MAIN).toContain("ORDER BY ps.name,is_primary_reference DESC,(r.route_mode='road') DESC");
  expect(UI).toContain("Rujukan utama PKE");
  expect(UI).toContain("layanan loading PKE");
  expect(UI).toContain("PKS operasional dan terverifikasi");
 });
 it("keeps crosswalk global-admin-only and geo visibility Project scoped",()=>{
  expect(MIGRATION).toContain("p17b_crosswalk_admin_select");
  expect(MIGRATION).toContain("p17b_geo_admin_all");
  expect(MIGRATION).toContain("p17b_geo_project_read");
  expect(MIGRATION).toContain("pke_p16_project_port_permission");
  expect(MIGRATION).toContain("pke_has_project_permission");
 });
});
