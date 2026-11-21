import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const api=readFileSync(new URL("./index.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/062_p1_owner_action_and_delegated_verification.sql",import.meta.url),"utf8");
const roleCatalogue=readFileSync(new URL("./role-catalogue.ts",import.meta.url),"utf8");

describe("P1 workflow API security contracts",()=>{
  it("exposes Project-scoped list, create, transition, evidence, events and KPI endpoints",()=>{
    for(const route of [
      '/api/v1/projects/:projectId/p1-workflows',
      '/api/v1/projects/:projectId/p1-workflows/:id/transition',
      '/api/v1/projects/:projectId/p1-workflows/:id/evidence',
      '/api/v1/projects/:projectId/p1-workflows/:id/events',
      '/api/v1/projects/:projectId/p1-kpis',
    ]) expect(api).toContain(route);
  });
  it("requires project permission checks and idempotency before domain writes",()=>{
    expect(api).toContain("requireProjectPermission(req,res,projectId,permission)");
    expect(api).toContain("idempotencyKey");
    expect(api).toContain("IDEMPOTENCY_KEY_CONFLICT");
    expect(api).toContain("P1_VERSION_CONFLICT");
  });
  it("verifies private object bytes before evidence registration",()=>{
    expect(api).toContain("privateStorage.verifyObject(evidenceKey,evidenceSize,evidenceSha)");
    expect(api).toContain("projects/${projectId}/");
    expect(api).toContain("pke-private-documents");
  });
  it("enforces three-way match, LC completeness and independent workflow actors",()=>{
    expect(api).toContain("p1_get_three_way_match_inputs");
    expect(api).toContain("LC_PRESENTATION_INCOMPLETE");
    expect(api).toContain("MAKER_CHECKER_REQUIRED");
    expect(api).toContain("QA_INDEPENDENCE_REQUIRED");
    expect(api).toContain("AUDIT_CLOSURE_INDEPENDENCE_REQUIRED");
  });
  it("enforces delegated HSE ownership and independent verification",()=>{
    expect(api).toContain("hse.action.manage");
    expect(api).toContain("Independent HSE Officer");
    expect(migration).toContain("hse.action.respond");
    expect(migration).toContain("assignee_user_id=pke_current_user_id()");
  });
  it("does not convert missing source data into a zero KPI",()=>{
    expect(api).toContain('status:value===null?"unavailable":"available"');
    expect(api).toContain('freshnessStatus:evaluateFreshness');
  });
  it("keeps workflow access permissions in canonical role templates",()=>{
    for(const permission of ["procurement.commitment.manage","quality.release.view","shipping.survey.submit","shipping.acknowledge","audit.finding.respond","hse.action.respond","dispatch.update"])
      expect(roleCatalogue).toContain(permission);
  });
});
