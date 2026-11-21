import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../migrations/078_p2a_facility_capability_quality_provenance.sql", import.meta.url), "utf8");

describe("Migration 078 P15 facility capability and quality provenance", () => {
  it("matches the exact migration SHA-256", () => {
    expect(createHash("sha256").update(migration).digest("hex")).toBe("757e4db6edcb995fa6bc7210dffecfa2446d82e80088c4967ee90925b4c46ac0");
  });
  it("extends master-data approval to evidence-backed capability, capacity and certification only", () => {
    expect(migration).toContain("facility_product','capacity_record','certification");
    expect(migration).toContain("Approved, checksum-verified same-Project evidence document is required");
    expect(migration).toContain("Facility must be active and verified before a product capability can be verified");
    expect(migration).toContain("Product classification must be verified before facility capability can be verified");
    expect(migration).toContain("facility_capacity_records");
    expect(migration).toContain("facility_certifications");
  });
  it("prevents identity and product classification verification without Admin-reviewed evidence", () => {
    expect(migration).toContain("pke_guard_p2a_identity_verification");
    expect(migration).toContain("pke_guard_p2a_product_classification");
    expect(migration).toContain("Identity evidence must be approved, checksum-verified and from the selected Project");
    expect(migration).toContain("Product classification evidence must be approved and checksum-verified in the same Project");
    expect(migration).toContain("Verification evidence is immutable while the canonical identity remains verified");
  });
  it("preserves provenance for capability, capacity, certification and quality records", () => {
    expect(migration).toContain("evidence_document_id");
    expect(migration).toContain("evidence_sha256");
    expect(migration).toContain("source_snapshot");
    expect(migration).toContain("lab_report_document_id");
    expect(migration).toContain("laboratory_accreditation_reference");
    expect(migration).toContain("chain_of_custody");
  });
  it("requires sample-linked lab evidence, units, basis, method and reviewer for accepted quality results", () => {
    expect(migration).toContain("pke_validate_p2a_quality_provenance");
    expect(migration).toContain("Quality result evidence must be the lab report linked to its sample");
    expect(migration).toContain("Accepted quality result requires sample-linked lab evidence, unit/basis/method and reviewer stamps");
  });
  it("does not add runtime delete access or fabricate capability fixtures", () => {
    expect(migration).not.toContain("GRANT DELETE");
    expect(migration).not.toContain("[TEST FIXTURE]");
  });
});
