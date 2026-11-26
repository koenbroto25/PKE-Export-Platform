import { describe, expect, it } from "vitest";
import { PKE_PROCESS_DEPENDENCIES, assessDependency, type DependencyStatus } from "./process-dependency-map.js";
import { DEPENDENCY_SCENARIO_MATRIX, summarizeDependencyScenarioCoverage } from "./dependency-scenario-matrix.js";

describe("Phase B deterministic dependency scenario matrix",()=>{
 it("contains at least 100 reproducible edge/fault combinations",()=>{
  const coverage=summarizeDependencyScenarioCoverage(DEPENDENCY_SCENARIO_MATRIX);
  expect(coverage.total).toBeGreaterThanOrEqual(100);
  expect(coverage.total).toBe(132);
  expect(Object.keys(coverage.byDependency)).toHaveLength(PKE_PROCESS_DEPENDENCIES.length);
  expect(Object.values(coverage.byDependency).every(count=>count===12)).toBe(true);
  expect(Object.values(coverage.byFault).every(count=>count===PKE_PROCESS_DEPENDENCIES.length)).toBe(true);
 });
 it("matches expected deterministic status for every scenario",()=>{
  for(const fixture of DEPENDENCY_SCENARIO_MATRIX){
   const dep=PKE_PROCESS_DEPENDENCIES.find(d=>d.id===fixture.dependencyId);
   expect(dep,fixture.id).toBeDefined();
   const result=assessDependency(dep!,fixture.providedEvidence,fixture.upstreamState,fixture.downstreamState);
   expect(result.status,fixture.id).toBe(fixture.expectedStatus);
  }
 });
 it("propagates an unresolved first-edge gap downstream and recovers after correction",()=>{
  let upstream:DependencyStatus="satisfied";
  const failedStates:string[]=[];
  for(const dep of PKE_PROCESS_DEPENDENCIES){
   const evidence=dep===PKE_PROCESS_DEPENDENCIES[0]?[]:dep.requiredEvidence;
   const result=assessDependency(dep,evidence,upstream);
   failedStates.push(result.status);
   upstream=result.status;
  }
  expect(failedStates[0]).toBe("gap");
  expect(failedStates.slice(1).every(state=>state==="blocked")).toBe(true);
  const recovered=PKE_PROCESS_DEPENDENCIES.map(dep=>assessDependency(dep,dep.requiredEvidence));
  expect(recovered.every(result=>result.status==="satisfied")).toBe(true);
 });
 it("does not let downstream blocked state erase a local evidence gap",()=>{
  for(const dep of PKE_PROCESS_DEPENDENCIES){
   const result=assessDependency(dep,[],undefined,"blocked");
   expect(result.status).toBe("gap");
   expect(result.missingEvidence.length).toBeGreaterThan(0);
  }
 });
});
