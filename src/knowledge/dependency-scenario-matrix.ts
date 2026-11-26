import { PKE_PROCESS_DEPENDENCIES, assessDependency, type DependencyStatus, type ProcessDependency } from "./process-dependency-map.js";

export type DependencyFaultKind =
  | "complete"
  | "missing-all"
  | "missing-one"
  | "upstream-blocked"
  | "upstream-gap"
  | "upstream-stale"
  | "upstream-unknown"
  | "downstream-unknown"
  | "downstream-blocked-complete"
  | "downstream-blocked-missing"
  | "stale-recovery"
  | "evidence-recovery";

export type DependencyScenario = {
  id: string;
  dependencyId: string;
  fault: DependencyFaultKind;
  providedEvidence: string[];
  upstreamState?: DependencyStatus;
  downstreamState?: DependencyStatus;
  expectedStatus: DependencyStatus;
  rationale: string;
};

function scenario(dependency: ProcessDependency, fault: DependencyFaultKind): DependencyScenario {
  const all = dependency.requiredEvidence;
  const oneMissing = all.slice(1);
  const definitions: Record<DependencyFaultKind, Omit<DependencyScenario,"id"|"dependencyId"|"fault">> = {
    complete:{providedEvidence:all,expectedStatus:"satisfied",rationale:"Required evidence complete; no upstream/downstream fault."},
    "missing-all":{providedEvidence:[],expectedStatus:"gap",rationale:"All required evidence missing."},
    "missing-one":{providedEvidence:oneMissing,expectedStatus:"gap",rationale:"One required evidence item is missing."},
    "upstream-blocked":{providedEvidence:all,upstreamState:"blocked",expectedStatus:"blocked",rationale:"Upstream blocker propagates."},
    "upstream-gap":{providedEvidence:all,upstreamState:"gap",expectedStatus:"blocked",rationale:"Upstream gap prevents downstream progression."},
    "upstream-stale":{providedEvidence:all,upstreamState:"stale",expectedStatus:"stale",rationale:"Upstream freshness is stale."},
    "upstream-unknown":{providedEvidence:all,upstreamState:"unknown",expectedStatus:"unknown",rationale:"Upstream evidence state is unverified."},
    "downstream-unknown":{providedEvidence:all,downstreamState:"unknown",expectedStatus:"unknown",rationale:"Downstream evidence state is unverified."},
    "downstream-blocked-complete":{providedEvidence:all,downstreamState:"blocked",expectedStatus:"blocked",rationale:"Downstream blocker is surfaced despite local evidence completeness."},
    "downstream-blocked-missing":{providedEvidence:[],downstreamState:"blocked",expectedStatus:"gap",rationale:"Local missing-evidence gap takes precedence in current assessor; the downstream block remains a separate observation."},
    "stale-recovery":{providedEvidence:all,upstreamState:undefined,expectedStatus:"satisfied",rationale:"After stale source is refreshed, evidence is re-evaluated and satisfied."},
    "evidence-recovery":{providedEvidence:all,expectedStatus:"satisfied",rationale:"After the missing evidence is added, the dependency returns to satisfied."},
  };
  return {id:`${dependency.id}:${fault}`,dependencyId:dependency.id,fault,...definitions[fault]};
}

export const DEPENDENCY_SCENARIO_MATRIX: DependencyScenario[] = PKE_PROCESS_DEPENDENCIES.flatMap(dependency =>
  (Object.keys({
    complete:1,"missing-all":1,"missing-one":1,"upstream-blocked":1,"upstream-gap":1,"upstream-stale":1,
    "upstream-unknown":1,"downstream-unknown":1,"downstream-blocked-complete":1,"downstream-blocked-missing":1,
    "stale-recovery":1,"evidence-recovery":1,
  }) as DependencyFaultKind[]).map(fault=>scenario(dependency,fault))
);

export function summarizeDependencyScenarioCoverage(scenarios: DependencyScenario[]) {
  const byDependency: Record<string,number> = {};
  const byFault: Record<string,number> = {};
  for(const item of scenarios) {
    byDependency[item.dependencyId]=(byDependency[item.dependencyId]||0)+1;
    byFault[item.fault]=(byFault[item.fault]||0)+1;
  }
  return {total:scenarios.length,byDependency,byFault};
}
