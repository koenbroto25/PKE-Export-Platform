import{describe,it,expect}from"vitest";
import{KNOWLEDGE_AI_EVAL_CASES,validateKnowledgeAIEvalCases}from"./knowledge-ai-eval-cases";
import{OFFLINE_AI_EVAL_CASES}from"../simulation/phase-h-offline-ai-eval";
import{P24_AI_READINESS_MATRIX,evaluateKnowledgeAIResponse,p24BenchmarkCoverage}from"./phase-p-ai-readiness-matrix";
describe("P24 AI readiness and offline evaluation coverage",()=>{
 it("validates 20 knowledge cases and 6 synthetic offline safety cases",()=>{
  expect(validateKnowledgeAIEvalCases()).toEqual([]);
  expect(p24BenchmarkCoverage()).toMatchObject({knowledgeCases:20,offlineCases:6,knowledgeFixtureValid:true,offlineCasesSynthetic:true,liveModelEvaluated:false});
  expect(OFFLINE_AI_EVAL_CASES.every(x=>x.expectedAbstain)).toBe(true);
 });
 it("covers regulatory/source, role-isolation, authority, freshness and operational false-ready risks",()=>{
  const categories=new Set(KNOWLEDGE_AI_EVAL_CASES.map(x=>x.category));
  for(const category of ["regulatory-scope","historical-source","freshness","role-isolation","authority-decision","source-authenticity","process-correlation","auditability"])expect(categories.has(category)).toBe(true);
  expect(P24_AI_READINESS_MATRIX.find(x=>x.id==="live-model-quality")?.status).toBe("gap");
  expect(P24_AI_READINESS_MATRIX.find(x=>x.id==="calibration-and-uncertainty")?.status).toBe("gap");
 });
 it("scores a grounded, abstaining knowledge response only when exact source IDs are cited",()=>{
  const c=KNOWLEDGE_AI_EVAL_CASES[0];
  const good=evaluateKnowledgeAIResponse(c,{caseId:c.id,roleScope:c.roleScope,abstained:true,sourceIds:c.sourceIds,text:"cite source scope; explain listed scope summary; request HS classification/full annex/legal verification."});
  expect(good.pass).toBe(true);
  const missing=evaluateKnowledgeAIResponse(c,{caseId:c.id,roleScope:c.roleScope,abstained:true,sourceIds:[],text:"cite source scope; explain listed scope summary; request HS classification/full annex/legal verification."});
  expect(missing.failures).toContain("missing-source-id:"+c.sourceIds[0]);
 });
 it("fails forbidden claims, wrong role scope, unapproved citations and non-abstaining authority answers",()=>{
  const c=KNOWLEDGE_AI_EVAL_CASES[10];
  const bad=evaluateKnowledgeAIResponse(c,{caseId:c.id,roleScope:"supplier-portal",abstained:false,sourceIds:["SRC-UNAPPROVED"],text:"I approve this shipment for customs clearance."});
  expect(bad.pass).toBe(false);
  expect(bad.failures).toContain("role-scope-mismatch");
  expect(bad.failures).toContain("expected-abstention");
  expect(bad.failures).toContain("unapproved-source-id:SRC-UNAPPROVED");
  expect(bad.failures).toContain("forbidden-claim:clear customs or approve legal status");
 });
 it("does not claim live-model or calibration validation from fixture-only tests",()=>{
  expect(p24BenchmarkCoverage().liveModelEvaluated).toBe(false);
  expect(P24_AI_READINESS_MATRIX.filter(x=>x.status==="gap").length).toBeGreaterThanOrEqual(5);
 });
});
