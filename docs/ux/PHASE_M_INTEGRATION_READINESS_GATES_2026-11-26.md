# Phase M — Production Integration Readiness Gates

Date: 2026-11-26
Branch: `p20/platform-continuation-20261123`

## Purpose
Prepare the next real integration stage without violating the current guardrails. This phase is a readiness/acceptance specification; it does not claim production API, database, storage, or browser E2E integration is complete.

## Verified source-only baseline
- Phase E-I synthetic contracts and traceability.
- Phase J Manual Trial Mode HTTP tests using real Express route registration and in-memory state.
- Phase K frontend role/page access helper matrix and canonical role-dashboard metadata coverage.
- Phase L role-dashboard data-source coverage and truthful readiness labels.
- GitHub Actions run `45819675866` SUCCESS on code commit `6491903d`: 79 test files / 745 tests passed; P19 assurance 20/20; migration/release checks and dry-run passed; backend build/typecheck and frontend typecheck/build passed.
- Latest documentation commit `8387f85ee6db9a65bb8744bab57472b640303178` also has GitHub Actions SUCCESS.

## Strict environment boundary
**Do not run integration against Production or original UAT.** The current repository test-db policy is single-target, read-only, and owner-governed. It does not provide an approved isolated write-test target. No local/Docker/alternate DB, branch creation, migration, Vercel deployment, or live AI call is permitted by this continuation.

## Required prerequisites before actual persisted integration tests
1. Owner explicitly approves a disposable isolated QA database/branch and its lifecycle/deletion policy.
2. Project owner updates test-db policy and preflight to identify that approved target; this must not weaken production/original-UAT guards or accept arbitrary URLs.
3. Test-only credentials/role are provisioned with minimum privileges; secrets are provided through CI secret storage, never source.
4. Known migration/schema version and fixture reset method are agreed; migrations must be separately reviewed and hash-verified before application.
5. Private object storage test bucket/credentials are separate from production and include cleanup/retention controls.
6. Test identities represent each canonical role and project; no real personal/business data.
7. Browser E2E runner and isolated frontend auth provider/config are approved and added; currently no Playwright/Cypress runner is configured.
8. Live AI evaluation requires a separate approval, synthetic prompts, no sensitive data, cost/rate limits, and immutable source references.

## Integration test sequence once prerequisites are approved
- M0: environment identity/preflight negative tests (wrong host, production, expired target, wrong role, forbidden variables must fail before connecting).
- M1: schema and migration version read-only proof.
- M2: auth/session and role/project permission tests.
- M3: project→contract→PKS→lot/QC→warehouse→allocation→transport→port/loading→documents→shipment→finance transaction flow.
- M4: persisted cross-module cascades and idempotency/replay.
- M5: maker-checker, independent reviewer, immutable audit, rejection/correction/reversal.
- M6: private storage upload/download, authorization, checksum, expiry and cleanup.
- M7: browser role flows, mobile viewport, keyboard/accessibility, offline field capture/sync.
- M8: live-model groundedness/scope/provenance/abstention benchmark.
- M9: final traceability and go/no-go review; every critical blocker has owner, evidence and disposition.

## Go/no-go criteria
- No production/original-UAT writes and no cross-project data leakage.
- Every API and UI mutation respects server authorization; UI gating is not treated as security.
- No false-ready state on missing/stale/conflicting evidence or upstream change.
- All changes are audited and replay-safe where required.
- Storage object access is project-scoped and verified.
- All required roles have working task queues, detail, action, feedback and handoff flows.
- CI is green with repeatable fixture reset and full logs retained.
- Any live AI decision remains advisory and source-grounded; approval stays human.

## Current disposition
**BLOCKED BY ENVIRONMENT APPROVAL, NOT BY SOURCE WORK.** The repository contains no approved isolated persisted integration environment and the current policy forbids creating/selecting a test database from this continuation. Browser E2E and live AI remain separately unconfigured. Continue only with additional source-only contracts or wait for the owner-approved environment prerequisites.
