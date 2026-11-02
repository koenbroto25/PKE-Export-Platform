# PKE Export Platform v4.2.2 - Remediation Backlog

## Audit Metadata

| Field | Value |
|-------|-------|
| **Backlog Date** | 2026-11-02 |
| **Source** | Independent Technical Validation Audit |
| **Total Items** | 35 |
| **Estimated Total Effort** | 38-40 weeks |

---

## Categorization

| Category | Count | Description |
|----------|-------|-------------|
| Bugs | 8 | Defects in existing code (TypeScript errors, UUID BigInt, Math.random compliance) |
| Missing Features | 20 | Features not implemented (double-entry ledger, AP/AR, AI, UI, etc.) |
| Security Risks | 6 | Authentication gaps, RLS not enforced, no rate limiting, no session expiry |
| Incorrect Business Logic | 5 | Compliance uses random, country packs hardcoded, no business rule validation |
| External Integration Blockers | 7 | No provider adapters (FX, AIS, geocoding, customs, email, bank) |
| Configuration Requirements | 4 | Neon DB, API keys, secrets, CI/CD |

## Phase 1: Critical Bugs (Must Fix First - Weeks 1-2)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|
| C1 | Bug | Fix TypeScript compilation errors | 8 syntax errors in src/index.ts prevent application build | src/index.ts:120, 230, 386, 538 | 1-2 days | None |
| C2 | Security | Add authentication to all API endpoints | 16 of 26 endpoints lack requireAuth/requireAdmin | src/index.ts (all POST/GET routes) | 3-5 days | C1 |
| C3 | Bug | Fix UUID BigInt bug | BigInt(Number(id)) used for UUID lookups will fail at runtime | src/index.ts:176, 245 | 1 day | C1 |
| C4 | Bug | Replace Math.random() compliance logic | Compliance results are random, not rule-based | src/index.ts:504-513 | 1-2 weeks | C1, C2 |
| C5 | Bug | Replace hardcoded country packs | Country pack data has no legal source verification | src/index.ts:524-529 | 1-2 weeks | C1, C2 |
| C6 | Security | Set RLS context per-request | setRLSContext/clearRLSContext never called in middleware | src/auth.ts, src/index.ts | 3-5 days | C1, C2 |
| C7 | Security | Add RLS policies to operational tables | truck_trips, tracking_events, rab, fx_rates, fx_exposure lack RLS | migrations/003_rls_policies.sql | 1 week | C1, C6 |
| C8 | Security | Implement bcrypt password hashing | No password hashing in code | src/auth.ts | 3-5 days | C1 |

**Phase 1 Subtotal: ~3-4 weeks**
| Check | Status | Evidence |
|-------|--------|----------|
| Dashboard access | ⚠️ LIMITED | No buyer-specific UI; API endpoints accessible |
| Contract viewing | ✅ PASS | GET /api/v1/contract-programs (view own contracts) |

## Phase 2: Missing Features - Financial Accounting (Weeks 3-8)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|
| M1 | Missing Feature | Implement chart of accounts | No COA table or structure | New migration, new model | 1 week | C1, C2 |
| M2 | Missing Feature | Implement double-entry ledger | No journal_entries, journal_lines tables | New migration, new endpoints | 2 weeks | M1 |
| M3 | Missing Feature | Implement debit/credit balancing | No balance validation on journal posts | Ledger service | 1 week | M2 |
| M4 | Missing Feature | Implement accounts payable | No AP table, no AP workflow | New migration, new endpoints | 2 weeks | M2 |
| M5 | Missing Feature | Implement accounts receivable | No AR table, no AR workflow | New migration, new endpoints | 2 weeks | M2 |
| M6 | Missing Feature | Implement cash management | No cash tracking | New migration, new endpoints | 1 week | M2 |
| M7 | Missing Feature | Implement cash advances | No advance tracking | New migration, new endpoints | 1 week | M6 |
| M8 | Missing Feature | Implement payment request/instruction/evidence | No payment workflow | New migration, new endpoints | 2 weeks | M4, M5, M6 |
| M9 | Missing Feature | Implement payment verification | No verification/reconciliation logic | Payment service | 1 week | M8 |
| M10 | Missing Feature | Implement FX revaluation | No revaluation logic | FX service | 1 week | M2 |
| M11 | Missing Feature | Implement realized/unrealized FX gain/loss | No gain/loss calculation | FX service | 1 week | M10 |
| M12 | Missing Feature | Implement RAB versioning | No version_number or config_snapshot | rab table migration | 1 week | C1, C2 |
| M13 | Missing Feature | Implement budget vs actual tracking | No comparison mechanism | RAB service | 1 week | M2 |
| M14 | Missing Feature | Implement project settlement and closing | No settlement workflow | Project service | 2 weeks | M2, M4, M5 |

**Phase 2 Subtotal: ~6-8 weeks**

## Phase 3: Missing Features - Truck Tracking (Weeks 5-7)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|
| M15 | Missing Feature | Implement geofence validation | No tracking_geofences table, no validation | New migration, new endpoints | 1 week | C1, C2 |
| M16 | Missing Feature | Implement QR checkpoint | No tracking_qr_tokens table | New migration, new endpoints | 1 week | C1, C2 |
| M17 | Missing Feature | Implement weighbridge evidence | No weighbridge_transactions table | New migration, new endpoints | 1 week | C1, C2 |
| M18 | Missing Feature | Implement weight discrepancy calculation | No trip_reconciliations table | Reconciliation service | 1 week | M17 |
| M19 | Missing Feature | Implement trip reconciliation | No reconciliation workflow | Reconciliation service | 1 week | M18 |
| M20 | Missing Feature | Implement offline synchronization | No offline framework | New service, PWA changes | 2 weeks | C1, C2 |
| M21 | Missing Feature | Implement buyer last-verified-location | No buyer location API | New endpoint | 1 week | C1, C2 |

**Phase 3 Subtotal: ~3 weeks**

## Phase 4: Missing Features - Export Compliance (Weeks 4-6)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|

## Phase 6: Missing Features - Frontend UI (Weeks 7-14)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|
| M39 | Missing Feature | Implement Admin portal | No /admin/* UI | New frontend | 2 weeks | C2 |
| M40 | Missing Feature | Implement PM workspace | No /workspace/* UI | New frontend | 2 weeks | C2 |
| M41 | Missing Feature | Implement Field PWA | No /field/* UI | New frontend | 3 weeks | C2 |
| M42 | Missing Feature | Implement Buyer Command Center | No /buyer/* UI | New frontend | 2 weeks | C2 |
| M43 | Missing Feature | Implement Supplier/Vendor Portal | No /partner/* UI | New frontend | 2 weeks | C2 |
| M44 | Missing Feature | Implement role-based routing | No route guards | New frontend | 1 week | C2 |
| M45 | Missing Feature | Implement project switching | No project selector | New frontend | 1 week | C2 |

**Phase 6 Subtotal: ~6-8 weeks**

## Phase 7: Testing & QA (Weeks 10-13)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|
| M46 | Missing Feature | Set up Neon staging database | No DB for integration testing | Infrastructure | 1-2 weeks | C1 |
| M47 | Missing Feature | Implement RLS integration tests | No RLS tests | New test files | 1 week | M46 |
| M48 | Missing Feature | Implement API contract tests | No API tests | New test files | 2 weeks | C2 |
| M49 | Missing Feature | Implement security tests (IDOR, RLS bypass) | No security tests | New test files | 2 weeks | M46, C7 |
| M50 | Missing Feature | Implement accounting tests (double-entry balance) | No accounting tests | New test files | 2 weeks | M2 |
| M51 | Missing Feature | Conduct field UAT (geofence, photo, GPS) | No field testing | Test plan | 2 weeks | M15-M21 |
| M52 | Missing Feature | Implement CI/CD pipeline | No CI/CD | .github/workflows | 2 weeks | C1 |

**Phase 7 Subtotal: ~4-5 weeks**

## Phase 8: DevOps & Production Readiness (Weeks 12-15)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|
| M53 | Missing Feature | Implement monitoring and alerting | No monitoring | Infrastructure | 1 week | M46 |
| M54 | Missing Feature | Implement backup and restore | No backup tested | Infrastructure | 1 week | M46 |
| M55 | Missing Feature | Implement incident response plan | No plan | Documentation | 1 week | None |
| M56 | Missing Feature | Conduct performance/load testing | No load testing | Test plan | 2 weeks | M46 |
| M57 | Missing Feature | Complete UAT for all stakeholder roles | No UAT | Test plan | 2 weeks | M39-M45 |
| M58 | Missing Feature | Production readiness sign-off | No sign-off | Documentation | 1 week | All prior phases |

**Phase 8 Subtotal: ~3-4 weeks**

## Summary by Priority

| Priority | Count | Estimated Effort |
|----------|-------|-----------------|
| Critical (Must fix before any deployment) | 8 | ~3-4 weeks |
| High (Must fix before UAT) | 14 | ~20-24 weeks |
| Medium (Should fix before production) | 8 | ~8-10 weeks |
| Low (Nice to have) | 5 | ~2-3 weeks |

**Total Estimated Effort: 38-40 weeks**

## Dependency Order

1. Fix TypeScript errors (C1) - unblocks all development
2. Add authentication to all endpoints (C2) - unblocks security testing
3. Set up Neon staging database (M46) - unblocks integration/RLS testing
4. Implement double-entry ledger (M2) - foundation for all financial features
5. Implement financial accounting workflow (M4-M14) - core business requirement
6. Implement truck tracking field features (M15-M21) - operational requirement
7. Implement Gemini AI (M28-M38) - intelligence layer
8. Implement frontend UI (M39-M45) - stakeholder access
9. Implement testing and QA (M47-M52) - quality assurance
10. Implement DevOps and production readiness (M53-M58) - go-live

---

**Backlog generated:** 2026-11-02  
**Validator:** Independent Technical Validation  

## Phase 4: Missing Features - Export Compliance (Weeks 4-6)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|
| M22 | Missing Feature | Implement regulatory sources table | No legal source tracking | New migration, new endpoints | 1 week | C1, C2 |
| M23 | Missing Feature | Implement country pack legal verification | No source verification for China/Pakistan/Indonesia | Compliance service | 2 weeks | M22 |
| M24 | Missing Feature | Implement HS classification | No HS code classification | New migration, new endpoints | 1 week | C1, C2 |
| M25 | Missing Feature | Implement document lifecycle states | No required→received→verified workflow | document_registry enhancements | 1 week | C1, C2 |
| M26 | Missing Feature | Implement effective dates and superseded rules | No rule versioning | Regulatory rules table | 1 week | M22 |
| M27 | Missing Feature | Implement expiry alerts | No alert mechanism | Notification service | 1 week | C1, C2 |

**Phase 4 Subtotal: ~3 weeks**

## Phase 5: Missing Features - Gemini AI (Weeks 6-11)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|
| M28 | Missing Feature | Configure Gemini API key backend-only | No actual key configured | .env, secret management | 3 days | C1 |
| M29 | Missing Feature | Implement model registry | No model_registry table | New migration, new endpoints | 1 week | C1 |
| M30 | Missing Feature | Implement model routing | No routing logic | AI router service | 1 week | M29 |
| M31 | Missing Feature | Implement function calling | No function definitions | AI gateway | 2 weeks | M30 |
| M32 | Missing Feature | Implement structured output validation | No output schema validation | AI validator | 1 week | M31 |
| M33 | Missing Feature | Implement RAG retrieval | No vector store or embeddings | RAG service | 2 weeks | M29 |
| M34 | Missing Feature | Implement prompt injection resistance | No sanitization | AI security layer | 1 week | M30 |
| M35 | Missing Feature | Implement sensitive data filtering | No PII redaction | AI context builder | 1 week | M30 |
| M36 | Missing Feature | Implement AI scope restriction | No project-based filtering | AI context builder | 1 week | M30 |
| M37 | Missing Feature | Implement token usage tracking and budget limits | No tracking | AI monitoring | 1 week | M28 |
| M38 | Missing Feature | Implement rate limit handling and retry | No retry logic | AI client | 1 week | M28 |

**Phase 5 Subtotal: ~5-6 weeks**
**Next step:** Begin with C1 (fix TypeScript errors) and C2 (add authentication)


## Phase 6: Missing Features - Frontend UI (Weeks 7-14)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|
| M39 | Missing Feature | Implement Admin portal | No /admin/* UI | New frontend | 2 weeks | C2 |
| M40 | Missing Feature | Implement PM workspace | No /workspace/* UI | New frontend | 2 weeks | C2 |
| M41 | Missing Feature | Implement Field PWA | No /field/* UI | New frontend | 3 weeks | C2 |
| M42 | Missing Feature | Implement Buyer Command Center | No /buyer/* UI | New frontend | 2 weeks | C2 |
| M43 | Missing Feature | Implement Supplier/Vendor Portal | No /partner/* UI | New frontend | 2 weeks | C2 |
| M44 | Missing Feature | Implement role-based routing | No route guards | New frontend | 1 week | C2 |
| M45 | Missing Feature | Implement project switching | No project selector | New frontend | 1 week | C2 |

**Phase 6 Subtotal: ~6-8 weeks**

## Phase 7: Testing & QA (Weeks 10-13)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|
| M46 | Missing Feature | Set up Neon staging database | No DB for integration testing | Infrastructure | 1-2 weeks | C1 |
| M47 | Missing Feature | Implement RLS integration tests | No RLS tests | New test files | 1 week | M46 |
| M48 | Missing Feature | Implement API contract tests | No API tests | New test files | 2 weeks | C2 |
| M49 | Missing Feature | Implement security tests (IDOR, RLS bypass) | No security tests | New test files | 2 weeks | M46, C7 |
| M50 | Missing Feature | Implement accounting tests (double-entry balance) | No accounting tests | New test files | 2 weeks | M2 |
| M51 | Missing Feature | Conduct field UAT (geofence, photo, GPS) | No field testing | Test plan | 2 weeks | M15-M21 |
| M52 | Missing Feature | Implement CI/CD pipeline | No CI/CD | .github/workflows | 2 weeks | C1 |

**Phase 7 Subtotal: ~4-5 weeks**

## Phase 8: DevOps & Production Readiness (Weeks 12-15)

| ID | Category | Item | Description | Affected Files | Effort | Dependencies |
|----|----------|------|-------------|----------------|--------|--------------|
| M53 | Missing Feature | Implement monitoring and alerting | No monitoring | Infrastructure | 1 week | M46 |
| M54 | Missing Feature | Implement backup and restore | No backup tested | Infrastructure | 1 week | M46 |
| M55 | Missing Feature | Implement incident response plan | No plan | Documentation | 1 week | None |
| M56 | Missing Feature | Conduct performance/load testing | No load testing | Test plan | 2 weeks | M46 |
| M57 | Missing Feature | Complete UAT for all stakeholder roles | No UAT | Test plan | 2 weeks | M39-M45 |
| M58 | Missing Feature | Production readiness sign-off | No sign-off | Documentation | 1 week | All prior phases |

**Phase 8 Subtotal: ~3-4 weeks**

## Summary by Priority

| Priority | Count | Estimated Effort |
|----------|-------|-----------------|
| Critical (Must fix before any deployment) | 8 | ~3-4 weeks |
| High (Must fix before UAT) | 14 | ~20-24 weeks |
| Medium (Should fix before production) | 8 | ~8-10 weeks |
| Low (Nice to have) | 5 | ~2-3 weeks |

**Total Estimated Effort: 38-40 weeks**

## Dependency Order

1. Fix TypeScript errors (C1) - unblocks all development
2. Add authentication to all endpoints (C2) - unblocks security testing
3. Set up Neon staging database (M46) - unblocks integration/RLS testing
4. Implement double-entry ledger (M2) - foundation for all financial features
5. Implement financial accounting workflow (M4-M14) - core business requirement
6. Implement truck tracking field features (M15-M21) - operational requirement
7. Implement Gemini AI (M28-M38) - intelligence layer
8. Implement frontend UI (M39-M45) - stakeholder access
9. Implement testing and QA (M47-M52) - quality assurance
10. Implement DevOps and production readiness (M53-M58) - go-live

---

**Backlog generated:** 2026-11-02  
**Validator:** Independent Technical Validation  
**Next step:** Begin with C1 (fix TypeScript errors) and C2 (add authentication)