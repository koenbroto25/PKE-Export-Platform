import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const api=readFileSync(new URL("./index.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../migrations/111_p18_regulatory_core_governance.sql",import.meta.url),"utf8");
const lifecycleMigration=readFileSync(new URL("../migrations/112_p18_regulatory_rule_lifecycle_compatibility.sql",import.meta.url),"utf8");
const roles=readFileSync(new URL("./role-catalogue.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../frontend/src/RegulatoryCoreWorkspace.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../frontend/src/App.tsx",import.meta.url),"utf8");
describe("P18 regulatory core contracts",()=>{
 it("replaces the legacy placeholder with persisted Project-scoped assessment and review APIs",()=>{
  for(const route of ['/api/v1/projects/:projectId/regulatory-assessments','/api/v1/projects/:projectId/regulatory-assessments/:assessmentId/review','/api/v1/projects/:projectId/regulatory-assessments/:assessmentId'])
   expect(api).toContain(route);
  expect(api).toContain('requireProjectPermission(req,res,projectId,"compliance.assess")');
  expect(api).toContain('INSERT INTO public.regulatory_assessments');
  expect(api).toContain('INSERT INTO public.regulatory_assessment_results');
  expect(api).toContain('REGULATORY_PROJECT_SCOPE_REQUIRED');
  expect(api).not.toContain('In production, this would run compliance checks against regulatory knowledge base');
 });
 it("derives assessment facts from a Project-owned shipment and verified destination port",()=>{
  expect(api).toContain('WHERE s.id=$1::uuid AND s.project_id=$2::uuid');
  expect(api).toContain('destination_port_verification_status!=="verified"');
  expect(api).toContain('REGULATORY_DESTINATION_UNRESOLVED');
  expect(api).toContain('r.jurisdiction IN ($1,\'GLOBAL\')');
 });
 it("loads only effective rules backed by verified sources and active dates",()=>{
  expect(api).toContain("r.status='effective' AND v.status='effective'");
  expect(api).toContain("s.verification_status='verified'");
  expect(api).toContain("v.effective_from<=CURRENT_DATE");
  expect(api).toContain("v.effective_to IS NULL OR v.effective_to>=CURRENT_DATE");
 });
 it("limits evidence to approved, verified private Project documents and snapshots checksums",()=>{
  expect(api).toContain("status='approved' AND upload_verified_at IS NOT NULL");
  expect(api).toContain("storage_bucket='pke-private-documents' AND legal_hold=false");
  expect(api).toContain("sha256:d.sha256_checksum");
  expect(api).toContain("reason_code");
  expect(api).toContain("PRODUCT_HS_CLASSIFICATION_REQUIRED");
 });
 it("exposes governed source, rule, document and country requirement lifecycle APIs",()=>{
  for(const route of ['/api/v1/regulatory-sources','/api/v1/regulatory-rules','/api/v1/regulatory-rule-versions/:versionId/approve','/api/v1/regulatory-rule-versions/:versionId/activate','/api/v1/country-document-requirements','/api/v1/export-document-types'])
   expect(api).toContain(route);
  expect(api).toContain('REGULATORY_MAKER_CHECKER_REQUIRED');
  expect(migration).toContain('p18_guard_regulatory_rule_version_lifecycle');
 });
 it("makes migration 111 self-contained for the officer role and runtime permission helper",()=>{
  const roleSeed=migration.indexOf("INSERT INTO public.pke_project_role_policy(role_code,canonical_role_code,template_version)");
  const allowlist=migration.indexOf("INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)");
  expect(roleSeed).toBeGreaterThanOrEqual(0);
  expect(allowlist).toBeGreaterThan(roleSeed);
  expect(migration).toContain("VALUES ('regulatory_compliance_officer','regulatory_compliance_officer',1)");
  expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.p18_has_regulatory_permission(text) TO app_runtime_secure;");
  expect(migration).toContain("has_function_privilege('app_runtime_secure','public.p18_has_regulatory_permission(text)','EXECUTE')");
  expect(migration).toContain("regulatory compliance officer role seed missing");
  expect(migration).toContain("runtime helper EXECUTE grant missing");
  expect(migration).toContain("AS $p18$");
  expect(migration).toContain("$p18$;");
 });
 it("defines runtime RLS write policies and immutable review guards in migration 111",()=>{
  for(const token of ['reason_code text','p18_regulatory_assessment_review_guard','p18_regulatory_assessment_result_review_guard','p18_regulatory_sources_insert','p18_regulatory_rules_insert','p18_regulatory_rule_versions_insert','p18_export_document_types_insert','p18_country_document_requirements_insert','p18_country_requirement_verification_guard','p18_regulatory_rule_version_lifecycle_guard'])
   expect(migration).toContain(token);
 });
 it("keeps legacy rule lifecycle triggers compatible with the governed P18 permission and maker-checker model",()=>{
  expect(lifecycleMigration).toContain("pke_regulatory_rule_guard");
  expect(lifecycleMigration).toContain("pke_regulatory_rule_version_guard");
  expect(lifecycleMigration).toContain("p18_has_regulatory_permission('regulatory.rule.manage')");
  expect(lifecycleMigration).toContain("OLD.status='under_review' AND NEW.status='rejected'");
  expect(lifecycleMigration).toContain("OLD.status='under_review' AND NEW.status IN ('approved','draft')");
  expect(lifecycleMigration).toContain("NEW.approved_by IS NOT DISTINCT FROM OLD.created_by");
  expect(lifecycleMigration).toContain("src.official_url !~* '^https://'");
  expect(lifecycleMigration).toContain("COALESCE(src.source_hash,'') !~* '^[0-9a-f]{64}
  expect(roles).toContain('regulatory_compliance_officer');
  for(const permission of ['regulatory.source.manage','regulatory.rule.manage','regulatory.rule.version.create','regulatory.document.manage','compliance.assess'])
   expect(roles).toContain(permission);
 });
 it("mounts a permission-aware Regulatory Core workspace with source, rules, catalog and human review",()=>{
  expect(app).toContain('RegulatoryCoreWorkspace');
  for(const token of ['Regulatory Source Registry','Regulatory Rules & Version Lifecycle','Export Document Catalog & Country Requirements','Detail / review'])
   expect(ui).toContain(token);
 });
 it("keeps RAG ingestion, embeddings and chatbot outside the active UI",()=>{
  expect(ui).toContain('RAG dan chatbot tidak termasuk');
  expect(ui).not.toContain('Gemini chat');
 });
});
");
 });
 it("sets the selected approved version pointer before promoting a parent rule",()=>{
  expect(api).toContain("active_version_id=CASE WHEN EXISTS(SELECT 1 FROM public.regulatory_rule_versions av WHERE av.id=active_version_id AND av.status='effective') THEN active_version_id ELSE $2::uuid END");
  expect(api).toContain("[req.user?.id??null,rows[0].id,rows[0].rule_id]");
 });
 it("maps the Regulatory Compliance Officer role to least-privilege permissions",()=>{
  expect(roles).toContain('regulatory_compliance_officer');
  for(const permission of ['regulatory.source.manage','regulatory.rule.manage','regulatory.rule.version.create','regulatory.document.manage','compliance.assess'])
   expect(roles).toContain(permission);
 });
 it("mounts a permission-aware Regulatory Core workspace with source, rules, catalog and human review",()=>{
  expect(app).toContain('RegulatoryCoreWorkspace');
  for(const token of ['Regulatory Source Registry','Regulatory Rules & Version Lifecycle','Export Document Catalog & Country Requirements','Detail / review'])
   expect(ui).toContain(token);
 });
 it("keeps RAG ingestion, embeddings and chatbot outside the active UI",()=>{
  expect(ui).toContain('RAG dan chatbot tidak termasuk');
  expect(ui).not.toContain('Gemini chat');
 });
});
