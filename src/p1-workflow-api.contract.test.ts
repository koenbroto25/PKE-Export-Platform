import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { P1_RECORD_TYPES } from "./p1-workflow-engine.js";

const api=readFileSync(new URL("./index.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/062_p1_owner_action_and_delegated_verification.sql",import.meta.url),"utf8");
const roleCatalogue=readFileSync(new URL("./role-catalogue.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../frontend/src/P1WorkflowWorkbench.tsx",import.meta.url),"utf8");

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
    expect(api).toContain("SURVEY_CERTIFICATE_VERIFICATION_FAILED");
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
    expect(api).toContain("HSE_VERIFICATION_INDEPENDENCE_REQUIRED");
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
  it("uses RLS-safe active-role resolution instead of hidden Project role catalog joins",()=>{
    expect(api).toContain("p1_has_active_project_role_assignment");
    expect(api).toContain("P1_OWNER_ROLE_UNASSIGNED");
  });
  it("exposes evidence read access and permits Lab evidence without granting QA review",()=>{
    expect(api).toContain('/api/v1/projects/:projectId/p1-workflows/:id/evidence');
    expect(api).toContain('record.rows[0].record_type==="quality_result"');
    expect(api).toContain('"quality.result.create"');
  });
  it("scopes KPI templates by active roles and reads only the secure aggregate API",()=>{
    expect(api).toContain("p1KpiTemplatesByRole");
    expect(api).toContain("const p1Roles");
    expect(api).toContain("public.pke_current_user_id()");
    expect(api).toContain("initialP1Status(type)");
    expect(api).toContain("public.p1_get_kpi_metric($1::uuid,$2::text)");
  });
  it("seeds newly activated Project roles from the canonical permission allowlist",()=>{
    expect(api).toContain("pke_project_role_permission_allowlist a");
    expect(api).toContain("WHERE a.role_code=$4::text");
    expect(api).toContain("grantedRows.map");
  });
  it("allows role-scoped P1 KPI access without granting broad reports.view",()=>{
    expect(api).toContain("'p1.kpi.view'");
    expect(api).toContain("public.pke_has_project_permission($1::uuid,'reports.view')");
    expect(api).toContain("finance:[\"tpl-procurement\"]");
    expect(api).toContain("accounting:[\"tpl-procurement\"]");
  });
  it("reads KPI values through the role-gated aggregate function",()=>{
    const start=api.indexOf('app.get("/api/v1/projects/:projectId/p1-kpis"');
    const end=api.indexOf("return res.json({projectId,kpis,generatedAt",start);
    const route=api.slice(start,end);
    expect(route).toContain("public.p1_get_kpi_metric($1::uuid,$2::text)");
    expect(route).not.toContain("FROM public.p1_domain_records");
  });
  it("renders every P1 workflow type and role-scoped KPI panel in the workbench",()=>{
    for(const type of P1_RECORD_TYPES) expect(ui).toContain(`code:"${type}"`);
    expect(ui).toContain('hasProjectPermission("p1.kpi.view",activeUser)');
    expect(ui).toContain("canViewKpis");
    expect(ui).toContain("freshnessStatus");
  });
});
