import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const migration = readFileSync(new URL("../migrations/082_p2a_quality_lab_report_transition.sql", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../frontend/src/QualityProvenancePanel.tsx", import.meta.url), "utf8");
describe("Migration 082 P15 controlled lab-report transition", () => {
  it("matches the exact UAT migration SHA-256", () => {
    expect(createHash("sha256").update(migration).digest("hex")).toBe("8f768a41acfcccbe8879a296dbf1a8530f6436660712f39fe8e0aa39f2819205");
  });
  it("requires Project quality-result permission and an approved checksum-verified same-Project lab report", () => {
    expect(migration).toContain("pke_has_project_permission(p_project_id,'quality.result.create')");
    expect(migration).toContain("status='approved' AND upload_verified_at IS NOT NULL");
    expect(migration).toContain("sha256_checksum ~ '^[0-9a-f]{64}$'");
    expect(migration).toContain("storage_bucket='pke-private-documents'");
  });
  it("allows only pending/submitted samples to transition and exposes the controlled API/UI action", () => {
    expect(migration).toContain("v_sample.status NOT IN ('pending','submitted')");
    expect(indexSource).toContain('/quality-samples/:sampleId/mark-tested');
    expect(uiSource).toContain("markSampleTested");
  });
});
