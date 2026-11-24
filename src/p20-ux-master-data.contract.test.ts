import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("P20 UX master-data and Project Manager contracts", () => {
  const app = read("frontend/src/App.tsx");
  const api = read("src/index.ts");
  const roles = read("src/role-catalogue.ts");
  const ports = read("frontend/src/PortNetworkPage.tsx");

  it("loads the global PKS/KCP catalogue separately from Project participation", () => {
    expect(app).toContain("/projects/${projectId}/pks-sites/catalog");
    expect(app).toContain("Direktori master PKS / KCP");
    expect(app).toContain("Tautkan fasilitas master ke Project");
    expect(app).toContain("status: 'proposed'");
    expect(api).toContain('app.get("/api/v1/projects/:projectId/pks-sites/catalog"');
    expect(api).toContain('app.post("/api/v1/projects/:projectId/pks-sites"');
    expect(api).toContain("pks.participation.manage");
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
  });
});
