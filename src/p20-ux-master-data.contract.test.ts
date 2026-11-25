import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("P20 UX master-data and Project Manager contracts", () => {
  const app = read("frontend/src/App.tsx");
  const api = read("src/index.ts");
  const roles = read("src/role-catalogue.ts");
  const ports = read("frontend/src/PortNetworkPage.tsx");
  const masterChanges = read("frontend/src/MasterDataChangeRequests.tsx");

  it("loads the global PKS/KCP catalogue separately from Project participation", () => {
    expect(app).toContain("/projects/${projectId}/pks-sites/catalog");
    expect(app).toContain("Direktori master PKS / KCP");
    expect(app).toContain("Tautkan fasilitas master ke Project");
    expect(app).toContain("status: 'proposed'");
    expect(api).toContain('app.get("/api/v1/projects/:projectId/pks-sites/catalog"');
    expect(api).toContain('app.post("/api/v1/projects/:projectId/pks-sites"');
    expect(api).toContain("pks.participation.manage");
  });

  it("uses typed, review-gated proposals for global PKS/KCP and facility master changes", () => {
    expect(masterChanges).toContain("proposalFields");
    expect(masterChanges).toContain("Nama fasilitas PKS/KCP");
    expect(masterChanges).toContain("Jenis fasilitas");
    expect(masterChanges).toContain("Advanced JSON (opsional)");
    expect(api).toContain("p2a_master_data_change_requests");
    expect(api).toContain("Platform Admin may decide but may not rewrite the submitted proposal.");
  });

  it("shows the canonical Project role templates and loads permissions from their own API", () => {
    expect(api).toContain('app.get("/api/v1/role-templates", requireAuth');
    expect(api).toContain("listProjectRoleTemplates()");
    expect(app).toContain("get('/role-templates')");
    expect(app).toContain("get('/permissions')");
    expect(app).toContain("Template role Project (canonical)");
    expect(app).toContain("Aktifkan template");
    expect(app).toContain("roleCode === 'pm'");
    expect(app).toContain("/role-templates/${encodeURIComponent(roleCode)}/activate");
    expect(api).toContain('app.post("/api/v1/projects/:id/role-templates/:roleCode/activate"');
    expect(api).toContain('requireProjectPermission(req, res, projectId, "project.roles.manage")');
    expect(app).toContain("permissionCatalogue.data?.permissions");
  });

  it("keeps PM as a permanent system template with a separate appointment", () => {
    expect(roles).toContain('role("pm", "Project Manager"');
    expect(roles).toContain('{ mandatory: true }');
    expect(roles).toContain("PM is appointed per Project by Platform Admin");
    expect(app).toContain("Status Project Manager");
    expect(app).toContain("Belum ada Project Manager aktif");
    expect(app).toContain("Template role PM adalah role sistem permanen");
    expect(app).toContain("/admin/projects/${selectedProjectId}/pm-appointment");
    expect(api).toContain('app.post("/api/v1/admin/projects/:projectId/pm-appointment"');
  });

  it("keeps the shared role dashboard discoverable and honest about workflow gaps", () => {
    const dashboard = read("frontend/src/RoleDashboardPage.tsx");
    const permissions = read("frontend/src/role-permissions.ts");
    const appShell = read("frontend/src/App.tsx");

    for (const role of [
      "platform_admin", "project_admin", "pm", "internal_auditor", "procurement",
      "pks_site_manager", "supplier", "buyer", "contract_manager", "production_manager",
      "packing_supervisor", "qc_officer", "regulatory_compliance_officer", "qa_manager",
      "laboratory_officer", "hse_officer", "warehouse_manager", "warehouse_officer",
      "inventory_controller", "transport_manager", "dispatcher", "transporter", "checker",
      "driver", "master_of_loading", "loading_supervisor", "loading_operator",
      "terminal_representative", "shipping_agent", "marine_surveyor", "ship_master",
      "finance", "accounting", "cashier", "funder", "document_officer",
      "external_provider", "field_manager", "viewer",
    ]) {
      expect(dashboard).toContain(role + ": {");
    }
    expect(dashboard).toContain("role-focus-grid");
    expect(dashboard).toContain("Antrean instruksi Project");
    expect(dashboard).toContain("Export Chain · Source Coverage");
    expect(dashboard).toContain("Production, packing & quality");
    expect(dashboard).toContain("Port & loading");
    expect(dashboard).toContain("bank execution dan reconciliation belum tersedia");
    expect(dashboard).toContain("Official customs / permit status");
    expect(dashboard).toContain("Quantity / document reconciliation");
    expect(dashboard).toContain("Open-source / external cross-check");
    expect(dashboard).toContain("Snapshot sumber untuk cross-check");
    expect(permissions).toContain("PAGE_PERMISSION_REQUIREMENTS");
    expect(appShell).toContain("sidebar-menu-search");
    expect(appShell).toContain("navSearch.trim()");
    expect(appShell).toContain("if (!groupItems.length) return null");
    expect(appShell).toContain("handleProjectContextChange");
    expect(appShell).toContain("window.confirm('Pindah Project context?");
    expect(appShell).toContain("navigate('/')");
    expect(appShell).toContain("PROJECT CONTEXT");
    expect(appShell).toContain("Platform-wide");
  });

  it("documents role dashboard as a shared permission-gated view rather than falsely claiming every workflow is complete", () => {
    const dashboard = read("frontend/src/RoleDashboardPage.tsx");
    expect(dashboard).toContain("ROLE_META");
    expect(dashboard).toContain("hasProjectPermission");
    expect(dashboard).toContain("sourceFailed");
    expect(dashboard).toContain("Tidak termasuk permission aktif pada Project ini");
    expect(dashboard).toContain("Belum tersedia");
    expect(dashboard).toContain("UX-02 · ADMIN CONTROL CENTER");
    expect(dashboard).toContain("UX-03 · PROJECT MANAGER COCKPIT");
    expect(dashboard).toContain("Project-scoped");
  });
  it("keeps port and warehouse master writes behind Platform Admin and provenance review", () => {
    expect(ports).toContain("platformAdmin = activeUser?.platformAdmin === true");
    expect(ports).toContain("{platformAdmin ?");
    expect(ports).toContain("source_reference");
    expect(ports).toContain("evidence_sha256");
    expect(ports).toContain("Verifikasi independen");
    expect(ports).toContain("Data master (JSON");
    expect(ports).toContain("typedMasterFields");
    expect(ports).toContain("Formulir master terstruktur");
    expect(ports).toContain('key: "pks_site_id"');
    expect(ports).toContain('key: "evidence_sha256"');
    for (const resourceKey of ["terminals:", "berths:", "channels:", "anchorages:", '"loading-services":', '"port-equipment":', '"operating-limits":', '"warehouse-zones":', '"warehouse-bins":', '"warehouse-equipment":']) {
      expect(ports).toContain(resourceKey);
    }
  });
});
