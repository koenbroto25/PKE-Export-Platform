export type P27SliceStatus="pass"|"partial"|"gap"|"blocked";
export const P27_VERTICAL_SLICES=[
{id:"pm-contract-project-portfolio",status:"pass" as const,evidence:"Migration 113/114 isolated UAT runtime exercised appointment-first creation, commercial-basis validation, portfolio, transfer, reactivation and isolation."},
{id:"field-capture-server-acceptance",status:"partial" as const,evidence:"Migration 115 UAT runtime passed assigned-task acceptance, actor/cancelled-task denial, PM isolation and constraints. Storage provider live upload, browser offline sync and review workflow still need E2E."},
{id:"production-packing-qc-inventory-hold-release",status:"partial" as const,evidence:"Offline lifecycle backtest covers operational transitions and held-lot controls; cross-module live UAT correlation is not proven."},
{id:"pks-warehouse-receipt-to-lot",status:"partial" as const,evidence:"Inventory receipt/allocation contract and synthetic fixtures exist; no live multi-role browser handoff has completed."},
{id:"port-vessel-loading-tally",status:"partial" as const,evidence:"Port/vessel/loading contracts and simulated reconciliation are present; licensed provider data, actual port/terminal confirmations and runtime slice remain external."},
{id:"customs-permit-document-trace",status:"partial" as const,evidence:"Regulatory source registry and evidence linkage exist; official applicability/issuer verification and live document chain require human review."},
{id:"quantity-cross-document-reconciliation",status:"partial" as const,evidence:"Offline scenarios exercise quantity/source mismatches; live end-to-end warehouse, tally, BL and settlement reconciliation is not yet accepted."},
{id:"finance-obligation-cash-plan-reporting",status:"partial" as const,evidence:"AP/AR, obligations, cash planning, FX and reporting contracts exist; external bank execution and live settlement are not integrated."},
{id:"task-correction-handoff-escalation",status:"partial" as const,evidence:"Work-item API, assignment checks, status controls and escalation semantics are tested; real multi-role correction/handoff UI E2E remains incomplete."},
{id:"multi-role-browser-e2e",status:"gap" as const,evidence:"No browser-driven multi-role Project workflow has been run against an isolated UAT server in CI."},
{id:"live-api-database-vertical-slice",status:"gap" as const,evidence:"Offline CI and isolated SQL tests do not replace full authenticated API-to-Neon-to-frontend acceptance for these slices."},
{id:"ais-provider-license",status:"blocked" as const,evidence:"Provider credentials, rights/license, freshness and commercial terms are not approved/verified."},
{id:"external-bank-execution",status:"blocked" as const,evidence:"Bank execution provider/credentials/mandate and maker-checker authority are external prerequisites; app remains reporting/planning only."},
] as const;
export function p27VerticalSliceSummary(){return{total:P27_VERTICAL_SLICES.length,pass:P27_VERTICAL_SLICES.filter(x=>x.status==="pass").length,partial:P27_VERTICAL_SLICES.filter(x=>x.status==="partial").length,gap:P27_VERTICAL_SLICES.filter(x=>x.status==="gap").length,blocked:P27_VERTICAL_SLICES.filter(x=>x.status==="blocked").length,allEvidencePresent:P27_VERTICAL_SLICES.every(x=>x.evidence.length>20)};}
