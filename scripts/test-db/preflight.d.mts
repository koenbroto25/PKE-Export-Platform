export interface SingleBranchPreflightProblem { code: string; message: string; }
export interface SingleBranchPreflightResult {
  ok: boolean;
  problems: SingleBranchPreflightProblem[];
}
export function validateSingleBranchDatabaseUrl(
  rawUrl: string,
  env?: Record<string, string | undefined>,
  nowMs?: number
): SingleBranchPreflightResult;
