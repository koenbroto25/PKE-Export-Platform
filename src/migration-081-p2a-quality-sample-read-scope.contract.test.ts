import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const migration = readFileSync(new URL("../migrations/081_p2a_quality_sample_read_scope.sql", import.meta.url), "utf8");
describe("Migration 081 P15 quality sample read scope", () => {
  it("matches the exact UAT migration SHA-256", () => {
    expect(createHash("sha256").update(migration).digest("hex")).toBe("HASH_TO_FILL");
  });
  it("allows Project sample viewers and creators to read only their Project samples and results", () => {
    expect(migration).toContain("pke_quality_samples_project_view");
    expect(migration).toContain("pke_quality_results_sample_view");
    expect(migration).toContain("quality.sample.view");
    expect(migration).toContain("quality.sample.create");
    expect(migration).not.toContain("GRANT DELETE");
  });
});
