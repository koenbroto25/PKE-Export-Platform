# UX-10 — Phase C + D Review Queue and Synthetic AI Backtest

**Date:** 26 November 2026  
**Branch:** `p20/platform-continuation-20261123`  
**Scope:** GitHub source only. No Vercel deployment, Neon/database, migrations, production records, external integrations, or live AI calls.

## Phase C — Human Review Queue contract

Implemented `src/knowledge/knowledge-review-queue.ts` and tests:
- Typed findings: missing evidence, conflict, stale, scope mismatch, source changed, invalid correction, unknown, quantity mismatch.
- Review lifecycle: open → assigned → verified / rejected / deferred; terminal verify/reject cannot be silently overwritten.
- Explicit project-scoped human actor, read permission and separate decision permission.
- Assigned-reviewer-only transitions; explicit `knowledge.review.override` is the only override.
- Verify/reject/defer require a human decision note; timestamp is validated and cannot precede creation.
- AI suggestion is an informational field only; it does not perform or authorize a transition.
- Queue summary is scoped to the project and visible to eligible human reviewers.

### Phase C backtest assertions
10 deterministic test blocks cover item creation/validation, project isolation, non-human denial, separate decision permission, mandatory notes, assignment, verified decision, terminal lock, timestamp reversal, reviewer ownership/override and scoped queue summary.

**Limit:** This is a pure contract/state-transition module and test harness. No persistence, API route, React queue screen, audit-log storage, notification, or reviewer-directory integration is implemented yet. No real review data is loaded.

## Phase D — AI-enrichment scenario pack

Implemented `src/knowledge/phase-d-backtest-pack.ts`:
- 11 lifecycle dependency edges × 31 fault/recovery classes = **341 synthetic benchmark cases**.
- Cases include complete/missing, missing-one, contradiction, stale/expired, upstream/downstream block, unknown, scope mismatch, unverified/rejected, duplicate allocation, over-allocation, partial shipment, invalid/valid correction, cancellation-only, recovery, not-applicable, source-change, basis mismatch, out-of-order, unauthorized/cross-project, no source, future/malformed timestamps, reversal and multiple-fault scenarios.
- Each case includes dependency ID, fault label, expected assessment class, prompt, synthetic/offline labels, expected AI behaviors, and prohibited authority/privacy claims.
- Tests verify balanced matrix, count, unique IDs, synthetic-only designation, safety fields, recovery coverage and non-approval boundaries.

### AI safety/quality expectations
Benchmark prompts require source provenance/scope, uncertainty, missing evidence or human review, and project/role permission checks. Prohibited claims include shipment/customs approval, quality-hold release, supplier approval, payment authorization, invented facts and cross-project disclosure.

**Limit:** The 341 cases enrich a deterministic offline benchmark dataset. They do not train a model, invoke an LLM, measure model response quality, or prove live retrieval/AI behavior. Expected statuses are benchmark labels and require domain validation before becoming authoritative.

## Backtest coverage
- Phase C: human-review state/permission tests authored.
- Phase D: 341 scenario labels across 11 edges and 31 fault classes.
- Both test files wired into root `npm test`.
- Tests are **authored, not executed in this environment**. CI result will be reported only if a matching GitHub Actions run is observed and its logs confirm the new suites passed.

## Remaining acceptance gaps
1. Run targeted tests and full CI; resolve every failure.
2. Review scenario expectations against process owners; avoid treating synthetic expected labels as legal/operational truth.
3. Add persisted API-backed queue with immutable decision events, server-side authorization, optimistic concurrency/idempotency, and audit trail.
4. Build reviewer UI with keyboard/mobile/accessibility QA.
5. Add model-in-the-loop evaluation only in a controlled offline environment; measure citation precision, abstention, scope/permission leakage, contradiction handling and hallucination rate.
6. Live source adapters, AI, database, migrations, Vercel and production remain out of scope until separately approved.

## Source commits
- Review queue contract: `ccffac6ba4996e0663a69c840d9f608c4542a6eb`
- Review queue tests: `bf2736ac4989f18ae451485c10ed8f6341f479ed`
- Phase D pack: `5d9eb50caa725d418d3b7ddbd4fa6a145414bed8`
- Phase D tests: `78b8c075677f0e014500ad0918264bec8d5ec45f`
- Root test wiring: `362f1582b38365697415a49032a025598f8bb59b`
- Assigned reviewer hardening: `6f9e741da9f7004643182d6508b18560862adf44`
- Assigned reviewer regression test: `9ac9402b0e9df9625c6a3f75cd3c4cefc74316d8`
