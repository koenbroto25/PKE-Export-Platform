import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const api=readFileSync(new URL("./index.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("./components/compliance/workspace.tsx",import.meta.url),"utf8");
describe("P18 regulatory core contracts",()=>{
 it("replaces the placeholder with a Project-scoped persisted assessment API",()=>{
  expect(api).toContain('/api/v1/projects/:projectId/regulatory-assessments');
  expect(api).toContain('requireProjectPermission(req,res,projectId,"compliance.assess")');
  expect(api).toContain('INSERT INTO public.regulatory_assessments');
  expect(api).toContain('INSERT INTO public.regulatory_assessment_results');
  expect(api).toContain('REGULATORY_PROJECT_SCOPE_REQUIRED');
  expect(api).not.toContain('In production, this would run compliance checks against regulatory knowledge base');
 });
 it("loads only effective rules backed by verified sources and active dates",()=>{
  expect(api).toContain("r.status='effective' AND v.status='effective'");
  expect(api).toContain("s.verification_status='verified'");
  expect(api).toContain("v.effective_from<=CURRENT_DATE");
  expect(api).toContain("v.effective_to IS NULL OR v.effective_to>=CURRENT_DATE");
 });
 it("limits evidence to verified private project documents",()=>{
  expect(api).toContain("status='approved' AND upload_verified_at IS NOT NULL");
  expect(api).toContain("storage_bucket='pke-private-documents' AND legal_hold=false");
 });
 it("does not advertise RAG, embeddings, or chatbot as part of this reduced scope",()=>{
  expect(ui).not.toContain("chatbot");
  expect(ui).not.toContain("embedding");
 });
});
