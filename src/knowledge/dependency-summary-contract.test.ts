import { describe, expect, it } from "vitest";
import { PKE_PROCESS_DEPENDENCIES, assessDependency } from "./process-dependency-map";
import { canReadDependencySummary, toDependencyEvidenceSummary } from "./dependency-summary-contract";
const dep=PKE_PROCESS_DEPENDENCIES[0];
const access={authenticated:true,projectId:"p1",memberProjectIds:["p1"],allowedDependencyIds:[dep.id],canReadSourceWorkspace:(w:string)=>w==="contracts + PKS sites"};
const summary=(freshness:"fresh"|"stale"|"unknown"="fresh", sourceLink?:string|null) =>
  toDependencyEvidenceSummary({projectId:"p1",dependency:dep,assessment:assessDependency(dep,dep.requiredEvidence),freshness,sourceLink},access);
describe("dependency summary API contract",()=>{
 it("denies anonymous, project mismatch, dependency scope mismatch and source permission",()=>{
  expect(canReadDependencySummary({...access,authenticated:false},"p1",dep.id,dep.sourceWorkspace)).toBe(false);
  expect(canReadDependencySummary(access,"p2",dep.id,dep.sourceWorkspace)).toBe(false);
  expect(canReadDependencySummary({...access,allowedDependencyIds:[]},"p1",dep.id,dep.sourceWorkspace)).toBe(false);
  expect(canReadDependencySummary({...access,canReadSourceWorkspace:()=>false},"p1",dep.id,dep.sourceWorkspace)).toBe(false);
 });
 it("fails closed for malformed access context and throwing permission callbacks",()=>{
  expect(canReadDependencySummary({} as any,"p1",dep.id,dep.sourceWorkspace)).toBe(false);
  expect(canReadDependencySummary({...access,canReadSourceWorkspace:()=>{throw new Error("policy failure");}},"p1",dep.id,dep.sourceWorkspace)).toBe(false);
 });
 it("returns scoped DTO with evidence gap and safe action",()=>{
  const assessment=assessDependency(dep,[]);
  const dto=toDependencyEvidenceSummary({projectId:"p1",dependency:dep,assessment,freshness:"fresh",lastUpdatedAt:"2026-11-26T00:00:00Z"},access);
  expect(dto).not.toBeNull();
  expect(dto?.status).toBe("gap");
  expect(dto?.missingEvidenceCount).toBe(dep.requiredEvidence.length);
  expect(dto?.safeNextAction).toContain("missing evidence");
  expect(dto?.sourceLink).toBeNull();
 });
 it("downgrades satisfied to stale/unknown when source freshness is not verified",()=>{
  const complete=assessDependency(dep,dep.requiredEvidence);
  const stale=toDependencyEvidenceSummary({projectId:"p1",dependency:dep,assessment:complete,freshness:"stale"},access);
  const unknown=toDependencyEvidenceSummary({projectId:"p1",dependency:dep,assessment:complete,freshness:"unknown"},access);
  expect(stale?.status).toBe("stale");
  expect(stale?.blockerCategory).toBe("stale-evidence");
  expect(unknown?.status).toBe("unknown");
  expect(unknown?.blockerCategory).toBe("unknown");
 });
 it("does not expose summary when source workspace permission fails",()=>{
  expect(toDependencyEvidenceSummary({projectId:"p1",dependency:dep,assessment:assessDependency(dep,[]),freshness:"unknown"}, {...access,canReadSourceWorkspace:()=>false})).toBeNull();
 });
 it("never equates satisfied evidence with business approval",()=>{
  const dto=toDependencyEvidenceSummary({projectId:"p1",dependency:dep,assessment:assessDependency(dep,dep.requiredEvidence),freshness:"fresh"},access);
  expect(dto?.safeNextAction).toContain("not business approval");
 });
 it("allows only same-origin internal source links",()=>{
  expect(summary("fresh","/projects/p1/contracts")).toHaveProperty("sourceLink","/projects/p1/contracts");
  expect(summary("fresh","https://evil.example/steal")?.sourceLink).toBeNull();
  expect(summary("fresh","//evil.example")?.sourceLink).toBeNull();
  expect(summary("fresh","javascript:alert(1)")?.sourceLink).toBeNull();
  expect(summary("fresh","/\\\\evil.example")?.sourceLink).toBeNull();
 });
 it("keeps not-applicable from implying business readiness",()=>{
  const assessment={dependencyId:dep.id,status:"not-applicable" as const,missingEvidence:[],reasons:["Scope reviewed"]};
  const dto=toDependencyEvidenceSummary({projectId:"p1",dependency:dep,assessment,freshness:"fresh"},access);
  expect(dto?.status).toBe("not-applicable");
  expect(dto?.blockerCategory).toBe("none");
  expect(dto?.safeNextAction).toContain("Confirm and document");
 });
});
