export type P25SecurityStatus="pass"|"partial"|"gap"|"blocked";
export const P25_SECURITY_READINESS=[
{id:"pm-project-rls-isolation",status:"pass" as const,evidence:"Neon UAT runtime tests for Migration 113/114 passed: appointment lifecycle, current-owned restoration, cross-PM isolation, transfer, revoked access and direct RLS write denial."},
{id:"api-role-permission-parity",status:"partial" as const,evidence:"P20 API boundary/role contract tests pass, but not every API route has a full actor × permission × project runtime test."},
{id:"auth-session-lifecycle",status:"partial" as const,evidence:"Authentication middleware and auth contracts exist; full Neon Auth session/refresh/revocation integration and browser sessions need end-to-end validation."},
{id:"maker-checker-audit",status:"partial" as const,evidence:"PM appointment/transfer/reactivation history and 113/114 audit runtime tests pass; broader transaction maker-checker matrix needs P25 backtest."},
{id:"private-object-storage",status:"partial" as const,evidence:"Private storage/security contract tests pass; browser CORS, field-capture evidence and orphan cleanup remain unverified."},
{id:"field-capture-rls",status:"partial" as const,evidence:"Migration 115 prepared and CI contract passed; UAT application/runtime RLS test is blocked by Neon branch capacity and awaits approval."},
{id:"backup-restore-recovery",status:"gap" as const,evidence:"No current-turn verified restore rehearsal/runbook evidence is available."},
{id:"browser-role-isolation-e2e",status:"gap" as const,evidence:"No real browser multi-role Project isolation, session handoff, offline capture and correction E2E has run in CI."},
{id:"external-provider-rights",status:"blocked" as const,evidence:"AIS/official cross-check provider license, data rights, credentials and freshness guarantees are not approved/verified."},
{id:"production-release",status:"blocked" as const,evidence:"Production migrations and Vercel deployment are explicitly not authorized in this maraton."},
] as const;
export function p25SecuritySummary(){return{total:P25_SECURITY_READINESS.length,pass:P25_SECURITY_READINESS.filter(x=>x.status==="pass").length,partial:P25_SECURITY_READINESS.filter(x=>x.status==="partial").length,gap:P25_SECURITY_READINESS.filter(x=>x.status==="gap").length,blocked:P25_SECURITY_READINESS.filter(x=>x.status==="blocked").length,allHaveEvidence:P25_SECURITY_READINESS.every(x=>x.evidence.length>20)};}
