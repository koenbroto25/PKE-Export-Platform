import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const migration = readFileSync(new URL("../migrations/080_p2a_quality_provenance_read_scope.sql", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../frontend/src/QualityProvenancePanel.tsx", import.meta.url), "utf8");
describe("Migration 080 P15 quality provenance read scope", () => {
  it("matches the exact UAT migration SHA-256", () => {
    expect(createHash("sha256").update(migration).digest("hex")).toBe("a98a90a8865cc216005394d3e49e2f85164ebf8577563afa9dd7b54feb11a150");
  });
  it("allows only Project quality roles to read the shared attribute dictionary", () => {
    expect(migration).toContain("pke_product_attributes_quality_view");
    expect(migration).toContain("quality.sample.view");
    expect(migration).toContain("quality.result.view");
    expect(migration).toContain("GRANT SELECT ON public.product_attributes TO app_runtime_secure");
  });
  it("exposes Project-scoped sample/result reads and permission-gated write/review controls", () => {
    expect(indexSource).toContain('app.get("/api/v1/projects/:projectId/quality-samples"');
    expect(indexSource).toContain("WHERE project_id=$1::uuid ORDER BY sampled_at DESC");
    expect(indexSource).toContain("WHERE s.project_id=$1::uuid ORDER BY r.created_at");
    expect(uiSource).toContain("quality-samples");
    expect(uiSource).toContain("canCreateResults");
    expect(uiSource).toContain("canReview");
  });
});
