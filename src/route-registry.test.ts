import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = __dirname;
const INDEX_SRC = readFileSync(join(ROOT, "index.ts"), "utf8");

// Matches Express route registrations: app.METHOD("/api/v1/...", ...)
const ROUTE_RE = /app\.(get|post|patch|put|delete|use)\s*\(\s*["']([^"']+)["']/g;

function registerRoutes(src: string): { method: string; path: string }[] {
  const routes: { method: string; path: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = ROUTE_RE.exec(src)) !== null) {
    routes.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return routes;
}

describe("API route registry (regression)", () => {
  it("registers P2-A Project product requirement CRUD with Admin-only approval", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => `${r.method} ${r.path}`));
    expect(set.has("GET /api/v1/projects/:projectId/product-requirements")).toBe(true);
    expect(set.has("POST /api/v1/projects/:projectId/product-requirements")).toBe(true);
    expect(set.has("PATCH /api/v1/projects/:projectId/product-requirements/:requirementId")).toBe(true);
    expect(INDEX_SRC).toContain('"product.requirement.view"');
    expect(INDEX_SRC).toContain('"product.requirement.manage"');
    expect(INDEX_SRC).toContain("Only Platform Admin may approve Project product requirements.");
    expect(INDEX_SRC).toContain("project_product_requirements");
  });

  it("registers P2-A facility catalog and public candidate CRUD with Project permission gates", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => `${r.method} ${r.path}`));
    expect(set.has("GET /api/v1/projects/:projectId/pks-sites/catalog")).toBe(true);
    expect(set.has("GET /api/v1/projects/:projectId/pks-candidates")).toBe(true);
    expect(set.has("POST /api/v1/projects/:projectId/pks-candidates")).toBe(true);
    expect(set.has("PATCH /api/v1/projects/:projectId/pks-candidates/:candidateId")).toBe(true);
    expect(INDEX_SRC).toContain("p2a_master_data_candidates");
    expect(INDEX_SRC).toContain("Only Platform Admin may change candidate verification status.");
    expect(INDEX_SRC).toContain("sourceUrl && !/^https?:\\/\\//i.test(sourceUrl)");
  });

  it("registers P2-A Project PKS participation endpoints with scoped edit permission", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => `${r.method} ${r.path}`));
    expect(set.has("GET /api/v1/projects/:projectId/pks-sites")).toBe(true);
    expect(set.has("POST /api/v1/projects/:projectId/pks-sites")).toBe(true);
    expect(set.has("PATCH /api/v1/projects/:projectId/pks-sites/:participationId")).toBe(true);
    expect(INDEX_SRC).toContain('"pks.site.view"');
    expect(INDEX_SRC).toContain('"pks.participation.manage"');
    expect(INDEX_SRC).toContain("project_pks_site_participation");
  });


  it("registers P15 Project-scoped master-data change requests with Admin-only approval", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => r.method + " " + r.path));
    expect(set.has("GET /api/v1/projects/:projectId/master-data-change-requests")).toBe(true);
    expect(set.has("POST /api/v1/projects/:projectId/master-data-change-requests")).toBe(true);
    expect(set.has("PATCH /api/v1/projects/:projectId/master-data-change-requests/:requestId")).toBe(true);
    expect(INDEX_SRC).toContain('"pks.master_data.change_request.view"');
    expect(INDEX_SRC).toContain('"pks.master_data.change_request.manage"');
    expect(INDEX_SRC).toContain("PM may only submit a draft; approval is Admin-only.");
    expect(INDEX_SRC).toContain("Canonical data changed after submission");
  });

  it("registers P15 Admin-only verification routes for organizations, facilities and products", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => r.method + " " + r.path));
    expect(set.has("PATCH /api/v1/projects/:projectId/master-data/organizations/:organizationId/verification")).toBe(true);
    expect(set.has("PATCH /api/v1/projects/:projectId/master-data/facilities/:facilityId/verification")).toBe(true);
    expect(set.has("PATCH /api/v1/projects/:projectId/master-data/products/:productId/classification")).toBe(true);
    expect(INDEX_SRC).toContain("requireAuth, requireAdmin");
    expect(INDEX_SRC).toContain("Evidence document must be approved, checksum-verified and belong to this Project.");
  });

  it("registers P15 evidence-linked quality sample and result APIs", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => r.method + " " + r.path));
    expect(set.has("GET /api/v1/projects/:projectId/quality-samples")).toBe(true);
    expect(set.has("PATCH /api/v1/projects/:projectId/quality-samples/:sampleId/mark-tested")).toBe(true);
    expect(set.has("POST /api/v1/projects/:projectId/quality-samples")).toBe(true);
    expect(set.has("POST /api/v1/projects/:projectId/quality-samples/:sampleId/results")).toBe(true);
    expect(set.has("PATCH /api/v1/projects/:projectId/quality-samples/:sampleId/review")).toBe(true);
    expect(set.has("PATCH /api/v1/projects/:projectId/quality-results/:resultId/review")).toBe(true);
    expect(INDEX_SRC).toContain("Quality result lacks complete sample-linked evidence or measurement provenance.");
    expect(INDEX_SRC).toContain("Tested samples require an approved lab report and laboratory.");
  });

  it("registers P16 authenticated port and warehouse read surfaces with Project permission gates", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => r.method + " " + r.path));
    for (const route of [
      "GET /api/v1/ports",
      "GET /api/v1/ports/:portId",
      "GET /api/v1/warehouses",
      "GET /api/v1/warehouses/:warehouseId",
    ]) expect(set.has(route)).toBe(true);
    expect(INDEX_SRC).toContain('requireProjectPermission(req, res, projectId, "port.view")');
    expect(INDEX_SRC).toContain('requireProjectPermission(req, res, projectId, "warehouse.view")');
    expect(INDEX_SRC).toContain('assessmentMode: "advisory_only"');
    expect(INDEX_SRC).toContain('canManage: false');
  });

  it("registers exactly one handler per method+path (no duplicate route groups)", () => {
    const routes = registerRoutes(INDEX_SRC).filter((r) => r.method !== "USE");
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const r of routes) {
      const key = `${r.method} ${r.path}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  it("keeps the two required /api/v1 middleware mounts (auth + RLS transaction)", () => {
    const mounts = registerRoutes(INDEX_SRC).filter((r) => r.method === "USE" && r.path === "/api/v1");
    expect(mounts).toHaveLength(2);
  });

  it("keeps one correct handler per reconciled method+path", () => {
    const routes = registerRoutes(INDEX_SRC);
    const set = new Set(routes.map((r) => `${r.method} ${r.path}`));
    const expected = [
      "GET /api/v1/health",
      "GET /api/v1/me",
      "GET /api/v1/contract-programs",
      "POST /api/v1/contract-programs",
      "GET /api/v1/projects",
      "POST /api/v1/projects",
      "GET /api/v1/fx-rates",
      "POST /api/v1/fx-rates",
      "GET /api/v1/fx-exposure",
      "POST /api/v1/fx-exposure",
      "GET /api/v1/notifications",
      "PATCH /api/v1/notifications/:id/read",
      "GET /api/v1/roles",
      "GET /api/v1/rab",
      "POST /api/v1/rab",
      "GET /api/v1/users",
      "POST /api/v1/admin/users/:id/password-reset",
    ];
    for (const e of expected) expect(set.has(e)).toBe(true);
  });

  it("does not register routes against tables absent from Production", () => {
    const absentTables = ["document_registry", "rab_items", "payments", "compliance_rules", "compliance_documents"];
    const body = INDEX_SRC;
    for (const table of absentTables) {
      // Check for actual SQL table references, not substrings in route paths
      expect(body).not.toMatch(new RegExp(`(FROM|INTO|UPDATE|JOIN|TABLE)\\s+"?${table}"?`, "i"));
    }
  });

  it("maps fx_rates to Production columns (from_currency_id/to_currency_id/rate_date/rate_source)", () => {
    expect(INDEX_SRC).toContain("from_currency_id");
    expect(INDEX_SRC).toContain("to_currency_id");
    expect(INDEX_SRC).toContain("rate_date");
    expect(INDEX_SRC).toContain("rate_source");
    expect(INDEX_SRC).not.toMatch(/\bfrom_currency\b/);
    expect(INDEX_SRC).not.toMatch(/\bto_currency\b/);
    const fxInsertBlock = INDEX_SRC.slice(INDEX_SRC.indexOf("INSERT INTO fx_rates"));
    expect(fxInsertBlock).not.toMatch(/\bfrom_currency\b/);
    expect(fxInsertBlock).not.toMatch(/\bto_currency\b/);
  });

  it("registers P08 compliance document routes backed by Production tables", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => `${r.method} ${r.path}`));
    const expected = [
      "GET /api/v1/regulatory-knowledge",
      "GET /api/v1/country-packs",
      "GET /api/v1/projects/:projectId/document-requirements",
      "GET /api/v1/projects/:projectId/documents",
      "POST /api/v1/projects/:projectId/documents",
      "PATCH /api/v1/documents/:id",
    ];
    for (const e of expected) expect(set.has(e)).toBe(true);
  });

  it("does not use absent document tables (document_registry, compliance_documents, compliance_rules)", () => {
    const absentTables = ["document_registry", "compliance_documents", "compliance_rules"];
    const body = INDEX_SRC;
    for (const table of absentTables) {
      expect(body).not.toContain(table);
    }
  });

  it("queries regulatory_sources not mock data in regulatory-knowledge", () => {
    expect(INDEX_SRC).toContain("FROM regulatory_sources");
    expect(INDEX_SRC).not.toContain("FDA registration");
    expect(INDEX_SRC).not.toContain("Placeholder country pack data");
  });

  it("queries country_export_document_requirements not mock data in country-packs", () => {
    expect(INDEX_SRC).toContain("FROM country_export_document_requirements");
    expect(INDEX_SRC).toContain("JOIN export_document_types");
    expect(INDEX_SRC).not.toContain("China PKE Standard");
  });

  it("registers P05 storage status and presigned URL routes", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => `${r.method} ${r.path}`));
    const expected = [
      "GET /api/v1/storage/status",
      "POST /api/v1/storage/presigned-upload",
      "GET /api/v1/storage/presigned-download/*objectKey",
    ];
    for (const e of expected) expect(set.has(e)).toBe(true);
  });

  it("uses project_export_documents table for document CRUD", () => {
    expect(INDEX_SRC).toContain("FROM project_export_documents");
    expect(INDEX_SRC).toContain("FROM project_export_document_requirements");
    expect(INDEX_SRC).toContain("sha256_checksum");
    expect(INDEX_SRC).toContain("object_key");
    expect(INDEX_SRC).toContain("version_no");
  });

  it("scopes notification reads and mark-read to recipient_user_id", () => {
    expect(INDEX_SRC).toContain("FROM user_notifications");
    expect(INDEX_SRC).toContain("WHERE recipient_user_id = $1::uuid");
    expect(INDEX_SRC).not.toContain("FROM notifications");
  });

  it("registers P07 RAB routes backed by Production rab table", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => `${r.method} ${r.path}`));
    const expected = [
      "GET /api/v1/rab",
      "POST /api/v1/rab",
    ];
    for (const e of expected) expect(set.has(e)).toBe(true);
  });

  it("uses rab table not rab_items for RAB CRUD", () => {
    expect(INDEX_SRC).toContain("FROM rab");
    expect(INDEX_SRC).toContain("INSERT INTO rab");
    expect(INDEX_SRC).not.toContain("rab_items");
  });

  it("registers P07 chart-of-accounts routes", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => `${r.method} ${r.path}`));
    const expected = [
      "GET /api/v1/chart-of-accounts",
      "POST /api/v1/chart-of-accounts",
    ];
    for (const e of expected) expect(set.has(e)).toBe(true);
  });

  it("registers PATCH operating-profile route alongside PUT", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => `${r.method} ${r.path}`));
    const expected = [
      "PUT /api/v1/projects/:projectId/operating-profile",
      "PATCH /api/v1/projects/:projectId/operating-profile",
    ];
    for (const e of expected) expect(set.has(e)).toBe(true);
  });

  it("registers P05/P07 fail-closed payment-instructions routes (503 unavailable)", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => `${r.method} ${r.path}`));
    const expected = [
      "GET /api/v1/payment-instructions",
      "POST /api/v1/payment-instructions",
      "PATCH /api/v1/payment-instructions/:id",
    ];
    for (const e of expected) expect(set.has(e)).toBe(true);
  });

  it("registers buyer/supplier project scope routes with project_members join", () => {
    const set = new Set(registerRoutes(INDEX_SRC).map((r) => `${r.method} ${r.path}`));
    const expected = [
      "GET /api/v1/buyer-projects",
      "GET /api/v1/supplier-projects",
    ];
    for (const e of expected) expect(set.has(e)).toBe(true);
  });

  it("uses project_members for buyer/supplier project scope, not client-supplied scope", () => {
    expect(INDEX_SRC).toContain("FROM project_members pm");
    expect(INDEX_SRC).toContain("pm.user_id = $1::uuid");
    expect(INDEX_SRC).toContain("pm.is_active = true");
  });
});

