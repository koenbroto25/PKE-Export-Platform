# Phase B — Dependency/evidence scenario matrix (26 November 2026)

## Status
**132 deterministic fixtures and tests authored; execution verification pending.**

## Coverage design
11 lifecycle edges × 12 fault classes = **132 scenario combinations**.

Fault classes:
1. complete evidence;
2. missing all evidence;
3. missing one evidence item;
4. upstream blocked;
5. upstream gap;
6. upstream stale;
7. upstream unknown;
8. downstream unknown;
9. downstream blocked with local evidence complete;
10. downstream blocked with local evidence missing (tests assessor precedence);
11. stale recovery;
12. evidence recovery.

## Files
- `src/knowledge/dependency-scenario-matrix.ts` — deterministic fixture builder and coverage summary.
- `src/knowledge/dependency-scenario-matrix.test.ts` — matrix count/balance, expected statuses, blocker propagation and recovery.
- Root `package.json` test script includes the matrix test.

## Assertions authored
- Exactly 132 fixture combinations, at least 100.
- 12 scenarios for each of 11 dependency IDs.
- Each fault class has 11 cases.
- Expected status is checked for every fixture.
- An unresolved first-edge gap propagates as blocked downstream.
- Completing evidence after correction restores satisfied states.
- Local evidence gaps are not hidden by downstream blocked state.

## Boundaries / known gaps
The existing assessor input is intentionally limited. This matrix does not claim to evaluate contradictory evidence, multiple competing sources, quantity/unit reconciliation, date/freshness computation, partial quantities, cancellation/reversal or not-applicable logic. Those require expanded domain inputs and separate acceptance tests. No evidence is authoritative; fixtures are synthetic.

## Verification
No test run has been executed in this environment. GitHub Actions run lookup has not surfaced a run for the current branch commits. Vercel status is a daily build-rate-limit failure and is explicitly ignored per owner instruction. No Vercel deploy, Neon change, migration or production data action occurred.
