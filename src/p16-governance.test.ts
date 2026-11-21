import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { hasPageAccess } from "../frontend/src/role-permissions";

const ROOT = __dirname;
const API = readFileSync(join(ROOT, "index.ts"), "utf8");
const MIGRATION_083 = readFileSync(join(ROOT, "..", "migrations", "083_p2b_port_warehouse_governance.sql"), "utf8");
const MIGRATION_084 = readFileSync(join(ROOT, "..", "migrations", "084_p2b_pm_depth_vessel_permissions.sql"), "utf8");
const MIGRATION_085 = readFileSync(join(ROOT, "..", "migrations", "085_p2b_port_evidence_document_guard.sql"), "utf8");
const MIGRATION_086 = readFileSync(join(ROOT, "..", "migrations", "086_p2b_master_guard_updated_at_fix.sql"), "utf8");
const MIGRATION_087 = readFileSync(join(ROOT, "..", "migrations", "087_p2b_admin_master_rls_guard_alignment.sql"), "utf8");
const MIGRATION_088 = readFileSync(join(ROOT, "..", "migrations", "088_p2b_admin_global_read_policies.sql"), "utf8");
const MIGRATION_089 = readFileSync(join(ROOT, "..", "migrations", "089_p2b_resource_read_permission_scope.sql"), "utf8");
const MIGRATION_090 = readFileSync(join(ROOT, "..", "migrations", "090_p2b_resource_read_project_context.sql"), "utf8");
const MIGRATION_091 = readFileSync(join(ROOT, "..", "migrations", "091_p16_selected_project_child_rls.sql"), "utf8");
const MIGRATION_092 = readFileSync(join(ROOT, "..", "migrations", "092_p16_parent_and_project_scope.sql"), "utf8");
const UI = readFileSync(join(ROOT, "..", "frontend", "src", "PortNetworkPage.tsx"), "utf8");
const UAT_MANIFEST = JSON.parse(readFileSync(join(ROOT, "..", "migration_history_manifest_uat_001_092.json"), "utf8"));

describe("P16 Port, Warehouse and Vessel governance", () => {
  it("registers P16 master CRUD, evidence, review, route and assessment endpoints", () => {
    const expected = [
      'app.post("/api/v1/p16/master/:resource"',
      'app.patch("/api/v1/p16/master/:resource/:recordId"',
      'app.patch("/api/v1/p16/master/:resource/:recordId/review"',
      'app.post("/api/v1/ports/:portId/depth-observations"',
      'app.post("/api/v1/ports/:portId/tide-observations"',
      'app.patch("/api/v1/port-depth-observations/:id/review"',
      'app.patch("/api/v1/port-tide-observations/:id/review"',
      'app.get("/api/v1/port-routes"',
      'app.get("/api/v1/vessels"',
      'app.post("/api/v1/vessel-port-assessments"',
    ];
    for (const route of expected) expect(API).toContain(route);
  });

  it("keeps global P16 master-data mutation behind Platform Admin middleware", () => {
    expect(API).toContain('app.post("/api/v1/p16/master/:resource",requireAuth,requireAdmin');
    expect(API).toContain('app.patch("/api/v1/p16/master/:resource/:recordId",requireAuth,requireAdmin');
    expect(API).toContain('app.patch("/api/v1/p16/master/:resource/:recordId/review",requireAuth,requireAdmin');
    expect(MIGRATION_083).toContain("pke_is_platform_admin()");
    expect(MIGRATION_083).toContain("p16_admin_insert");
    expect(MIGRATION_083).toContain("p16_admin_update");
    expect(MIGRATION_083).toContain("p16_admin_delete");
  });

  it("scopes depth and tide submissions to Project permissions and a linked Project port", () => {
    expect(API).toContain('requireProjectPermission(req,res,projectId,"port.depth.submit")');
    expect(API).toContain("pke_p16_project_port_permission($1::uuid,$2::uuid,'port.depth.submit')");
    expect(MIGRATION_083).toContain("p16_depth_submit");
    expect(MIGRATION_083).toContain("p16_tide_submit");
    expect(MIGRATION_084).toContain("('pm','port.depth.submit')");
  });

  it("requires approved, upload-verified Project document evidence with matching SHA-256", () => {
    expect(MIGRATION_085).toContain("d.status='approved'");
    expect(MIGRATION_085).toContain("d.upload_verified_at IS NOT NULL");
    expect(MIGRATION_085).toContain("d.storage_bucket='pke-private-documents'");
    expect(MIGRATION_085).toContain("d.sha256_checksum=NEW.evidence_sha256");
    expect(MIGRATION_085).toContain("d.object_key=NEW.evidence_object_key");
  });

  it("uses independent maker-checker review and immutable audit snapshots for master data", () => {
    expect(MIGRATION_083).toContain("OLD.submitted_by=v_actor");
    expect(MIGRATION_083).toContain("NEW.verified_by:=v_actor");
    expect(MIGRATION_083).toContain("p16.master.reviewed");
    expect(MIGRATION_083).toContain("before_snapshot,after_snapshot");
  });

  it("gives PM Project-scoped route and vessel assessment permissions without granting global master writes", () => {
    expect(MIGRATION_083).toContain("('pm','route.estimate')");
    expect(MIGRATION_083).toContain("('pm','vessel.port.assess')");
    expect(MIGRATION_084).toContain("('pm','vessel.view')");
    expect(MIGRATION_083).toContain("p16_route_project_read");
    expect(MIGRATION_083).toContain("p16_assessment_project_read");
  });

  it("keeps vessel screening advisory and requires verified, fresh evidence", () => {
    expect(API).toContain("Advisory screening only");
    expect(API).toContain("quality_status='verified'");
    expect(API).toContain("observed_at>=now()-interval '24 hours'");
    expect(API).toContain("eligible_for_review");
    expect(API).toContain("insufficient_data");
    expect(API).toContain("manual_review_required");
    expect(API).toContain("evidence_object_key IS NOT NULL");
    expect(API).toContain("COALESCE(p.evidence_sha256");
    expect(API).toContain("effective_verification_status");
    expect(UI).toContain("effective_verification_status");
  });

  it("exposes Project evidence submission, Admin master editing and review controls in the UI", () => {
    expect(UI).toContain('permissions.includes("port.depth.submit")');
    expect(UI).toContain('post(`/ports/');
    expect(UI).toContain('patch(`/p16/master/');
    expect(UI).toContain("Simpan sebagai diajukan");
    expect(UI).toContain("Ajukan survei kedalaman");
    expect(UI).toContain("Ajukan observasi pasang-surut");
    expect(UI).toContain("Jalankan screening");
  });
  it("pins UAT migration ledger 083-085 to exact SQL source hashes without modifying Production history", () => {
    expect(UAT_MANIFEST.branch_id).toBe("br-young-boat-b3re832d");
    expect(UAT_MANIFEST.ledger_row_count).toBe(92);
    expect(UAT_MANIFEST.applied_count).toBe(76);
    expect(UAT_MANIFEST.baseline_count).toBe(16);
    expect(UAT_MANIFEST.entries).toHaveLength(92);
    for (const [id, filename] of [
      [83, "083_p2b_port_warehouse_governance.sql"],
      [84, "084_p2b_pm_depth_vessel_permissions.sql"],
      [85, "085_p2b_port_evidence_document_guard.sql"],
      [86, "086_p2b_master_guard_updated_at_fix.sql"],
      [87, "087_p2b_admin_master_rls_guard_alignment.sql"],
      [88, "088_p2b_admin_global_read_policies.sql"],
      [89, "089_p2b_resource_read_permission_scope.sql"],
      [90, "090_p2b_resource_read_project_context.sql"],\n      [91, "091_p16_selected_project_child_rls.sql"],\n      [92, "092_p16_parent_and_project_scope.sql"],
    ] as const) {
      const entry = UAT_MANIFEST.entries[id - 1];
      const actual = createHash("sha256").update(readFileSync(join(ROOT, "..", "migrations", filename))).digest("hex");
      expect(entry.id).toBe(id);
      expect(entry.filename).toBe(filename);
      expect(entry.sha256).toBe(actual);
      expect(entry.status).toBe("applied");
    }
    expect(UAT_MANIFEST.purpose).toBe("verified_uat_history_only_not_production_history");
    expect(MIGRATION_086).toContain("'updated_at'");
  });

  it("uses an authenticated RLS gate while the SECURITY DEFINER trigger enforces Platform Admin", () => {
    expect(MIGRATION_087).toContain("pke_current_user_id() IS NOT NULL");
    expect(MIGRATION_087).toContain("pke_is_platform_admin()");
    expect(MIGRATION_087).toContain("updated_at");
    expect(MIGRATION_088).toContain("p16_admin_select");
    expect(MIGRATION_088).toContain("pke_is_platform_admin()");
    expect(MIGRATION_089).toContain("port.view");
    expect(MIGRATION_089).toContain("warehouse.view");
    expect(MIGRATION_089).toContain("vessel.view");
    expect(MIGRATION_089).toContain("DROP POLICY IF EXISTS pke_ports_member_read");
    expect(MIGRATION_090).toContain("pke_has_project_permission");
    expect(MIGRATION_090).toContain("app.current_project_id");
    expect(MIGRATION_090).not.toContain("pke_has_any_project_permission");
    expect(MIGRATION_091).toContain("pke_p16_project_warehouse_permission");
    expect(MIGRATION_091).toContain("pke_p16_project_vessel_permission");
    expect(MIGRATION_091).toContain("pke_is_platform_admin()");
    expect(MIGRATION_091).not.toContain("pke_has_any_project_permission");
    expect(MIGRATION_092).toContain("pke_p16_project_port_permission");
    expect(MIGRATION_092).toContain("pke_p16_project_warehouse_permission");
    expect(MIGRATION_092).toContain("project_export_documents");
    expect(MIGRATION_092).toContain("app.current_project_id");
    expect(API).toContain("requireP16ReadAccess");
    expect(UI).toContain("platformAdmin || permissions.includes(\"port.view\")");
  });

  it("makes the P16 workspace visible to Platform Admin without Project membership", () => {
    expect(hasPageAccess("port-network", { platformAdmin: true })).toBe(true);
    expect(hasPageAccess("port-network", { selectedProjectId: "a1000000-0000-4000-8000-000000000001", projectPermissions: ["port.view"] })).toBe(true);
    expect(hasPageAccess("port-network", { selectedProjectId: "a1000000-0000-4000-8000-000000000001", projectPermissions: [] })).toBe(false);
  });

});
