import type { DependencyAssessment, DependencyStatus, ProcessDependency } from "./process-dependency-map";

export type DependencyFreshness = "fresh" | "stale" | "unknown";
export type DependencyBlockerCategory = "missing-evidence" | "upstream-blocked" | "stale-evidence" | "permission-denied" | "unknown" | "none";
export type DependencyEvidenceSummary = {
  projectId: string;
  dependencyId: string;
  from: ProcessDependency["from"];
  to: ProcessDependency["to"];
  status: DependencyStatus;
  freshness: DependencyFreshness;
  missingEvidenceCount: number;
  blockerCategory: DependencyBlockerCategory;
  sourceWorkspace: string;
  sourceLink: string | null;
  lastUpdatedAt: string | null;
  safeNextAction: string;
  evidenceLabels: string[];
  reasons: string[];
};
export type DependencySummaryAccess = {
  authenticated: boolean;
  projectId: string;
  memberProjectIds: string[];
  allowedDependencyIds: string[];
  canReadSourceWorkspace: (workspace: string) => boolean;
};
export type DependencySummaryInput = {
  projectId: string;
  dependency: ProcessDependency;
  assessment: DependencyAssessment;
  freshness: DependencyFreshness;
  lastUpdatedAt?: string | null;
  sourceLink?: string | null;
};
const nextAction: Record<DependencyStatus,string> = {
  satisfied: "Cross-check source records; this is not business approval.",
  gap: "Complete or attach the missing evidence in the owning workspace.",
  blocked: "Resolve the upstream blocker before progressing.",
  stale: "Refresh the source evidence and repeat the cross-check.",
  unknown: "Verify source availability; readiness cannot be inferred.",
  "not-applicable": "Confirm and document why this dependency is not applicable."
};
function blocker(status: DependencyStatus, freshness: DependencyFreshness, missing: number): DependencyBlockerCategory {
  if(status==="blocked") return "upstream-blocked";
  if(status==="gap"||missing>0) return "missing-evidence";
  if(status==="stale"||freshness==="stale") return "stale-evidence";
  if(status==="unknown"||freshness==="unknown") return "unknown";
  return "none";
}
function safeInternalLink(link?: string | null): string | null {
  if(!link || typeof link !== "string") return null;
  // Only relative app routes are allowed; reject protocol-relative, control chars and encoded schemes.
  if(!link.startsWith("/") || link.startsWith("//") || /[\\u0000-\\u001f\\u007f]/.test(link) || /%0[0-9a-f]|%1[0-9a-f]/i.test(link)) return null;
  try {
    const parsed = new URL(link, "https://pke.invalid");
    if(parsed.origin !== "https://pke.invalid") return null;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}
export function canReadDependencySummary(access: DependencySummaryAccess, projectId: string, dependencyId: string, workspace: string): boolean {
  try {
    return Boolean(access?.authenticated && access.projectId===projectId &&
      Array.isArray(access.memberProjectIds) && access.memberProjectIds.includes(projectId) &&
      Array.isArray(access.allowedDependencyIds) && access.allowedDependencyIds.includes(dependencyId) &&
      typeof access.canReadSourceWorkspace==="function" && access.canReadSourceWorkspace(workspace));
  } catch {
    return false;
  }
}
export function toDependencyEvidenceSummary(input: DependencySummaryInput, access: DependencySummaryAccess): DependencyEvidenceSummary | null {
  const dep=input?.dependency, assessment=input?.assessment;
  if(!dep || !assessment || !canReadDependencySummary(access,input.projectId,dep.id,dep.sourceWorkspace)) return null;
  const status=assessment.status;
  const missing=Array.isArray(assessment.missingEvidence) ? assessment.missingEvidence : [];
  // Fail closed: unknown/stale evidence cannot be presented as operational readiness.
  const safeStatus: DependencyStatus = input.freshness==="stale" && status==="satisfied" ? "stale" : input.freshness==="unknown" && status==="satisfied" ? "unknown" : status;
  const safeBlocker=blocker(safeStatus,input.freshness,missing.length);
  return {
    projectId: input.projectId, dependencyId: dep.id, from:dep.from,to:dep.to,status:safeStatus,
    freshness:input.freshness,missingEvidenceCount:missing.length,blockerCategory:safeBlocker,
    sourceWorkspace:dep.sourceWorkspace,sourceLink:safeInternalLink(input.sourceLink),
    lastUpdatedAt:input.lastUpdatedAt??null,safeNextAction:nextAction[safeStatus],
    evidenceLabels:missing,reasons:Array.isArray(assessment.reasons)?assessment.reasons:[]
  };
}
