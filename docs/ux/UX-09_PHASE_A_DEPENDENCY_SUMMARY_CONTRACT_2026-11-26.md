# P20 continuation — Phase A checkpoint (26 November 2026)

## Status
**Implemented source contract; CI/runtime verification pending.**

Commits:
- `36ce92e2c032d88aa062f73ee840627d90c94ba0` — dependency summary DTO and scoped access contract.
- `1707ee0bc5c4fc3633dc6d54be8072ea2483bd5` — contract tests.

## Added
- `src/knowledge/dependency-summary-contract.ts`
- `src/knowledge/dependency-summary-contract.test.ts`

## Contract fields
Project/dependency IDs, lifecycle edge, state, freshness, missing evidence count, blocker category, source workspace/link, last updated, safe next action, evidence labels and reasons.

## Fail-closed controls
- Authenticated + project membership + edge scope + source-workspace permission must all pass.
- Unauthorized summary returns `null`; no source evidence details are exposed.
- A satisfied assessment is downgraded to `stale` or `unknown` when freshness is not verified.
- DTO wording explicitly distinguishes evidence completeness from business approval.
- No live evidence adapter, endpoint, DB persistence, or source links are claimed; this is a reusable contract layer only.

## Tests authored
Anonymous denial, project isolation, dependency-scope denial, source permission denial, scoped DTO, gap handling, stale/unknown downgrade, and business-approval boundary.

## Remaining Phase A
1. Verify CI for the commit and fix failures.
2. Wire the contract to a real backend route only after reviewing existing auth/role middleware and project-scoped API conventions.
3. Add route-level tests for HTTP anonymous/role/project/edge scope and malformed payloads.
4. Synthetic fixtures only.

## Safety constraints
No Vercel deployment, Neon changes, migrations, live ingestion, LLM runtime, or production data access.
