import {describe,it,expect} from "vitest";
import {PKE_KNOWLEDGE_OBSERVATIONS} from "./pke-observation-registry";
import {assessObservation,detectObservationConflicts,summarizeObservationSafety,type KnowledgeObservation} from "./observation-schema";
const policy={now:"2026-11-26T12:00:00Z",maxAgeMsByEvidenceType:{official:30*86400000,industry:365*86400000,commercial:180*86400000,historical:Infinity,company:30*86400000,field:7*86400000,transaction:7*86400000}};
const sample=(patch:Partial<KnowledgeObservation>={}):KnowledgeObservation=>({...PKE_KNOWLEDGE_OBSERVATIONS[0],observationId:"TEST-1",entityType:"test",entityId:"entity-1",claimType:"claim",claimValue:"A",conflictGroupId:"group-1",...patch});
describe("knowledge observation provenance registry",()=>{
 it("requires source metadata, explicit limitations and safe AI-use boundaries on all seeds",()=>{
  expect(PKE_KNOWLEDGE_OBSERVATIONS.length).toBeGreaterThanOrEqual(8);
  expect(new Set(PKE_KNOWLEDGE_OBSERVATIONS.map(o=>o.observationId)).size).toBe(PKE_KNOWLEDGE_OBSERVATIONS.length);
  for(const o of PKE_KNOWLEDGE_OBSERVATIONS){expect(o.sourceId).toMatch(/^SRC-/);expect(o.sourceUrl).toMatch(/^https?:/);expect(o.publisher.trim()).not.toBe("");expect(o.retrievedAt).toBeTruthy();expect(o.scopeLimitations.length).toBeGreaterThan(0);expect(o.safetyBoundary).toContain("Research observation");expect(o.confidence).toBeGreaterThanOrEqual(0);expect(o.confidence).toBeLessThanOrEqual(1);}
 });
 it("keeps historical/commercial observations explicitly limited and unverified",()=>{
  const historical=PKE_KNOWLEDGE_OBSERVATIONS.find(o=>o.evidenceType==="historical")!;
  const commercial=PKE_KNOWLEDGE_OBSERVATIONS.find(o=>o.evidenceType==="commercial")!;
  expect(historical.verificationStatus).toBe("unverified");
  expect(historical.scopeLimitations.some(x=>/historical/i.test(x))).toBe(true);
  expect(commercial.verificationStatus).toBe("unverified");
  expect(commercial.scopeLimitations.some(x=>/contract|acceptance/i.test(x))).toBe(true);
 });
});
describe("freshness and scope assessment",()=>{
 it("detects fresh observations and age-expired observations using configurable policy",()=>{
  expect(assessObservation(sample(),policy).status).toBe("fresh");
  const stale=sample({retrievedAt:"2026-01-01T00:00:00Z"});
  expect(assessObservation(stale,policy).status).toBe("stale");
 });
 it("handles expired, future-dated, invalid timestamps and not-yet-valid records",()=>{
  expect(assessObservation(sample({validTo:"2026-11-01T00:00:00Z"}),policy).status).toBe("expired");
  expect(assessObservation(sample({retrievedAt:"2027-01-01T00:00:00Z"}),policy).status).toBe("future-dated");
  expect(assessObservation(sample({retrievedAt:"invalid"}),policy).status).toBe("invalid-date");
  expect(assessObservation(sample({validFrom:"2027-01-01T00:00:00Z"}),policy).status).toBe("stale");
 });
 it("flags geography/product/destination scope mismatches without silently broadening claims",()=>{
  expect(assessObservation(sample({destination:"New Zealand"}),policy,{destination:"China"}).status).toBe("scope-mismatch");
  expect(assessObservation(sample({product:"PKE"}),policy,{product:"PKM"}).status).toBe("scope-mismatch");
  expect(assessObservation(sample({geography:"Indonesia"}),policy,{geography:"Malaysia"}).status).toBe("scope-mismatch");
 });
});
describe("claim conflict and comparability",()=>{
 it("preserves contradictory observations in a conflict group",()=>{
  const a=sample({observationId:"A",claimValue:10,unit:"MT",measurementBasis:"net"});
  const b=sample({observationId:"B",claimValue:12,unit:"MT",measurementBasis:"net"});
  const c=sample({observationId:"C",claimValue:12,unit:"MT",measurementBasis:"net"});
  const conflicts=detectObservationConflicts([a,b,c]);
  expect(conflicts).toHaveLength(1);expect(conflicts[0].status).toBe("conflict");expect(conflicts[0].observationIds).toEqual(["A","B","C"]);
 });
 it("does not compare claims with mismatched units or measurement basis",()=>{
  const a=sample({observationId:"A",claimValue:10,unit:"MT",measurementBasis:"net"});
  const b=sample({observationId:"B",claimValue:10000,unit:"KG",measurementBasis:"net"});
  expect(detectObservationConflicts([a,b])[0].status).toBe("uncomparable");
  const c=sample({observationId:"C",claimValue:10,unit:"MT",measurementBasis:"gross"});
  expect(detectObservationConflicts([a,c])[0].status).toBe("uncomparable");
 });
 it("does not invent a conflict for identical values on comparable basis",()=>{
  expect(detectObservationConflicts([sample({claimValue:"same"}),sample({observationId:"B",claimValue:"same"})])).toHaveLength(0);
 });
});
describe("AI safety metadata",()=>{
 it("warns on unverified/conflicting/low-confidence observations and missing limitations",()=>{
  const issues=summarizeObservationSafety(sample({verificationStatus:"unverified",confidence:0.3,scopeLimitations:[],aiAllowedUse:["prohibited-decision"]}));
  expect(issues).toContain("Verification status is unverified");
  expect(issues).toContain("Low confidence; do not present as established fact");
  expect(issues).toContain("AI use is prohibited for consequential decisions");
  expect(issues).toContain("No scope limitation documented");
 });
});
