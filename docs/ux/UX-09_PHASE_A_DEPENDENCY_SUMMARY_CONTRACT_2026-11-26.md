# P20 continuation — Phase A checkpoint (26 November 2026)

## Status
**Contract implementation hardened and CI wired; CI verification pending. API route integration remains open.**

### Source changes
- `src/knowledge/dependency-summary-contract.ts`
- `src/knowledge/dependency-summary-contract.test.ts`
- Root `package.json` test script now includes the Phase A contract test.

### Contract
DTO fields: project/dependency IDs, lifecycle edge, status, freshness, missing evidence count, blocker category, source workspace/link, last-updated timestamp, safe next action, evidence labels and reasons.

### Authorization and fail-closed controls
- Authenticated identity + project scope + project membership + dependency allowlist + source workspace permission must all pass.
- Malformed access context and permission callback errors fail closed.
- Unauthorized summary returns `null`; no summary fields are emitted.
- A satisfied assessment is downgraded to stale/unknown when freshness is not verified.
- External, protocol-relative, script, control-character and encoded-control links are rejected; only internal relative app routes are retained.
- Status text distinguishes evidence completeness from business approval.
- Not-applicable is not represented as approval.

### Test coverage authored
- Anonymous denial.
- Project mismatch and dependency scope denial.
- Source-workspace permission denial.
- Malformed authorization context and callback exception fail closed.
- Scoped DTO with missing evidence.
- Stale/unknown freshness downgrade and blocker categories.
- Safe internal link allowlist; unsafe URL rejection.
- Business approval boundary and not-applicable behavior.

### Commit evidence
- `1a6257850d3efc1479c8291da0a137c6bca2c261` — hardened contract.
- `ccaa342cf986573b0434f215416da49faa8f4ef1` — expanded tests.
- `8c7cfb248d9a5623792ee8d03898a62bb9c3f141` — added test to root CI command.
- `41cdefab15369f44c0c6261c2325d617ee4707bd` — master plan checkpoint.

## Remaining Phase A
1. Confirm GitHub Actions CI result for the checkpoint and fix failures.
2. Review existing authentication, role and project-scope middleware before creating an endpoint.
3. Integrate into a backend route with server-side scope enforcement (not frontend-only).
4. Add HTTP route-level tests: anonymous, role denial, project isolation, edge scope, malformed request, source permission and fail-closed source adapter errors.
5. Keep fixtures synthetic; do not claim live data integration.

## Constraints
No Vercel deployment, Neon changes, migrations, live ingestion, LLM runtime, production data access, merge or rebase.
