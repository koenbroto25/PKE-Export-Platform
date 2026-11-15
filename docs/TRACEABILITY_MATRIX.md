# Traceability Matrix P01–P13

| Requirement group | Plan owner | Key dependencies | Required evidence/test |
|---|---|---|---|
| Contract & recurring cycle | P01 | P02/P03/P07 | Contract Program, settlement-unit cycle, project settlement and next-cycle scenario |
| Single Admin authority | P01/P03/P10 | P02/P12 | Exactly one Admin principal; no alternate approval; Admin unavailable queue test |
| Neon DB and event model | P02 | P03/P12 | Migration/integrity/load test |
| Role, partner and RLS | P03 | P02/P10 | Cross-project/cross-partner test |
| API integration | P04 | P02/P03 | Provider failure/retry test |
| Neon Buckets/file security | P05 | P03/P04 | Signed URL and restore test |
| Truck checkpoint tracking | P06 | P03/P05/P10/P12 | Real field UAT |
| Full accounting/payment | P07 | P02/P03/P05/P06 | GL/AP/AR/payment reconciliation |
| Export compliance | P08 | P04/P05/P09 | Country pack legal verification |
| Gemini AI/RAG | P09 | P02/P03/P04/P05 | AI eval and data isolation |
| Stakeholder UX/routing | P10 | P03/P04 | Route and portal access test |
| Reports/BI | P11 | P03/P06/P07/P08/P09 | Metric reconciliation and publication test |
| Production readiness | P12 | All | Go-live checklist |

## Decision Register

| ID | Decision | Current decision / recommendation | Owner/status |
|---|---|---|---|
| D-001 | Backend | Neon Postgres paid production | User decided; confirm provisioning region |
| D-002 | Object storage | Neon private buckets | User decided; POC signed URL/backup |
| D-003 | Functional currency | IDR | User decided |
| D-004 | Commodity scope | PKE only through field maturity | User decided |
| D-005 | Markets | China and Pakistan initial country packs | User decided; legal verification open |
| D-006 | Accounting | Full double-entry/project accounting | Agreed direction; accountant policy sign-off open |
| D-007 | Payment execution | Manual payment instruction; no automatic bank transfer | User decided |
| D-008 | AI production | Gemini paid tier for real business data | User decided |
| D-009 | Truck tracking | Checker geotagged checkpoint, not mandatory vehicle GPS | Agreed direction; field UAT open |
| D-010 | Authentication | Neon Managed Auth POC, OIDC fallback | Open |
| D-011 | Frontend stack/hosting | Next.js/TypeScript/PWA recommendation | POC/open |
| D-012 | ORM/job queue | Drizzle and PostgreSQL-backed durable queue candidate | Open |
| D-013 | Accounting policy | COA, inventory valuation, FX accounting, tax | Accountant approval open |
| D-014 | External providers | AIS, FX, routing, notification and compliance source providers | Procurement/open |
| D-015 | Backup RPO/RTO | Define before production | Open |
| D-016 | Admin authority | Exactly one Admin Aplikasi principal; only Admin creates/approves/activates Contract Program and Admin-only settings. No fallback approver. If Admin unavailable, sensitive action queues. Shared credential weakens human attribution. | User decided; security controls in P03/P10 |
| D-017 | Recurring cycle policy | Admin defines recurrence in Contract Program and may adjust during project by versioned change. Recommended default `scheduled_draft`; Admin must review and activate. `admin_manual` and `quantity_triggered_draft` are configurable alternatives. | User decided; default mode recommended for approval |
| D-018 | Project Instance boundary | One instance represents one agreed fulfillment/settlement unit (e.g. each 10,000 MT tranche). Several shipments/partial receipts may belong to one instance. It closes only after the defined settlement and close checks are met. | User decided; exact basis is contract-specific |
| D-019 | First-cycle readiness | All in-scope plans P01–P13 implemented and running; measurable test/defect/security/UAT/backup gates specified in P12. | User decided; measurable criteria added |
| D-020 | Amendment handling | Admin chooses among amendment-only/future cycle, revise active project (new version/change order), successor project, split, supplemental scope, temporary variation or reviewed custom option. Decision requires negotiation evidence; AI may analyze but not decide. | User decided; P01 change engine |
| D-021 | Shared Admin credential attribution | Single Admin login is retained as requested. If physically shared, audit can identify principal/session, not prove which human used it. Prefer one controlled identity with MFA and recovery. | Risk disclosed; user acceptance required if shared |

## Implementation Evidence (Sprint 00 Baseline 2026-11-09 — read-only Production inspection)

| Plan | Implemented | API routes (backend) | Schema tables (Production) | Frontend | Test evidence |
|---|---|---|---|---|---|
| P01 Business Foundation & Configurator | PARTIAL | Contract Program CRUD, cycle policies, project CRUD/activate/deactivate, buyer, contract | contract_programs, cycle_policies, projects, project_templates, buyers, contracts | ContractsPage, ProjectsPage | Build exit 0; tests 5/5 exit 0; Sprint 01: project routes use Production columns (quantity_tranche, export_country_code) |
| P02 Backend & Database | PARTIAL | All operational/finance/compliance routes; pooled RLS context | 87 tabel + 1 view (project_module_readiness); semua RLS aktif | All portal pages integrated /api/v1 | Build exit 0; verify:runtime PASS; verify:migrations 27/27 PASS; Sprint 01: schema contract gate PASS |
| P03 Identity/Authorization/RLS | PARTIAL | requireAuth/requireAdmin; requireAdminMfa tidak terpasang | users, role_catalog, permissions, role_permissions, project_members | AccessPage | Build exit 0; tests 5/5 exit 0; Sprint 01: RLS transaction context per request; MFA BLOCKED |
| P04 API & Integrations | PARTIAL | /api/v1 REST with bearer token; error handling hardened (beberapa handler masih kirim pesan mentah) | — | api.ts bearer token | Build exit 0; Sprint 01: duplicate unauthenticated routes removed; error handler generic messages |
| P05 Object Storage | MISSING | — | — | — | BLOCKED_EXTERNAL (storage adapter/credentials) |
| P06 Operations | PARTIAL | truck trips, tracking events, warehouse receipts, inventory lots/movements | truck_trips, tracking_events, warehouse_receipts, inventory_lots, inventory_movements | OperationsPage | Build exit 0; Sprint 01: route columns diselaraskan dengan Production (transport_leg_id, license_plate, received_quantity, unit, pks_site_id, dll.); frontend form + tabel terhubung |
| P07 Finance | PARTIAL | RAB (tabel `rab`, kode menyebut `rab_items`), FX rates/exposure, payments (tabel `payment_obligations`, kode menyebut `payments`), journal entries/lines | rab, fx_rates, fx_exposure, payment_obligations, journal_entries, journal_lines | FinancePage | Build exit 0 (kolom perlu diselaraskan) |
| P08 Export Compliance | PARTIAL | compliance rules (tabel `regulatory_sources`, kode menyebut `compliance_rules`), compliance documents (tabel `project_export_documents`, kode menyebut `compliance_documents`) | regulatory_sources, export_document_types, country_export_document_requirements, project_export_document_requirements, project_export_documents | CompliancePage | Build exit 0 (tabel perlu diselaraskan) |
| P09 Gemini AI | MISSING | — | — | — | BLOCKED_EXTERNAL (Gemini credentials; advisory-only policy) |
| P10 Frontend & Portals | PARTIAL | — | — | Dashboard, Projects, Contracts, Operations, Finance, Compliance, Reports, Notifications, Access | Build exit 0; typecheck exit 0; Sprint 01: OperationsPage form/tabel menggunakan kolom Production aktual |
| P11 Reporting/Notifications | PARTIAL | notifications (tabel `user_notifications`/`notification_deliveries`, kode menyebut `notifications`) | user_notifications, notification_deliveries | ReportsPage, NotificationsPage | Build exit 0 |
| P12 QA/UAT/Prod Readiness | PARTIAL | runtime-security tests | — | — | Tests 5/5 exit 0; Sprint 01: integration test BLOCKED (tidak ada PostgreSQL lokal, tidak ada identitas tes) |

## Sprint 01 Traceability — Requirement → Table → API → Frontend → Test

| Requirement | Table (Production) | API Route | Frontend Page | Test Evidence |
|---|---|---|---|---|
| Buat project | projects | POST /api/v1/projects | ProjectsPage | Build exit 0; tes 5/5; integrasi BLOCKED (tidak ada PostgreSQL lokal) |
| Lihat project | projects | GET /api/v1/projects, GET /api/v1/projects/:id | ProjectsPage | Build exit 0; integrasi BLOCKED |
| Buat truck trip | truck_trips | POST /api/v1/truck-trips | OperationsPage | Build exit 0; integrasi BLOCKED |
| Lihat truck trip | truck_trips | GET /api/v1/truck-trips, GET /api/v1/truck-trips/:id | OperationsPage | Build exit 0; integrasi BLOCKED |
| Catat tracking event | tracking_events | POST /api/v1/tracking-events, GET /api/v1/tracking-events/trip/:tripId | OperationsPage | Build exit 0; integrasi BLOCKED |
| Buat warehouse receipt | warehouse_receipts | POST /api/v1/warehouse-receipts | OperationsPage | Build exit 0; integrasi BLOCKED |
| Lihat warehouse receipt | warehouse_receipts | GET /api/v1/warehouse-receipts | OperationsPage | Build exit 0; integrasi BLOCKED |
| Buat inventory lot | inventory_lots | POST /api/v1/inventory-lots | OperationsPage | Build exit 0; integrasi BLOCKED |
| Lihat inventory lot | inventory_lots | GET /api/v1/inventory-lots | OperationsPage | Build exit 0; integrasi BLOCKED |
| List transport legs | transport_legs | GET /api/v1/transport-legs | OperationsPage | Build exit 0; integrasi BLOCKED |
| Autorisasi server-side | users, role_catalog, permissions | requireAuth middleware | Semua halaman | Tes 5/5 exit 0; integrasi BLOCKED |
| RLS context per request | Semua 88 relasi | set_config app.current_user_id/role | Semua halaman | RLS aktif (read-only Sprint 00); positif test BLOCKED |

## Sprint 01.1 Traceability — Additional Evidence

| Requirement | Table (Production) | API Route | Frontend Page | Test Evidence |
|---|---|---|---|---|
| List transport legs (project-scoped) | transport_legs | GET /api/v1/transport-legs?projectId= | OperationsPage dropdown | Build exit 0; integrasi BLOCKED |
| Transport leg FK validation | transport_legs → truck_trips | POST /api/v1/truck-trips (validasi transport_leg_id) | OperationsPage | Schema verified read-only; integrasi BLOCKED |
| Migration manifest 28/28 | migration_manifest_001_027.json | verify:migrations | N/A | 28/28 PASS, exit 0 |


| P13 Traceability | PARTIAL | — | — | — | This matrix |

---

## Sprint 01.3/01.4 Traceability — Gate A-F Evidence (2026-11-09/10)

| Gate | Requirement | Evidence File | Test Command | Exit | Status |
|------|-------------|---------------|--------------|------|--------|
| A | Node 20 preflight CLI | `scripts/test-db/preflight.mjs` | `node scripts/test-db/preflight.mjs` | 0 (valid) / 1 (blocked) | ✅ PASS |
| A | Strict URL policy | `scripts/test-db/preflight.mjs` | `npx vitest run src/test-db/preflight.test.ts` | 0 (10/10) | ✅ PASS |
| A | Docker loopback proof | `BASELINE/docker_inspect_ports.json`, `netstat_54331.json` | `docker inspect`, `Get-NetTCPConnection` | 0 | ✅ PASS |
| A | DB identity/privilege proof | `GATE_A/preflight_cli_valid.txt` | Preflight CLI | 0 | ✅ PASS |
| A | Test startup fail-closed | `src/index.ts` | `npm run test:integration` preflight | 0 | ✅ PASS |
| A | Destructive script guards | `scripts/test-db/*.mjs` | `assertLocalResetAllowed` | 1 (blocked w/o env) | ✅ PASS |
| B | Schema parity assessment | `GATE_B_LOCAL_SCHEMA_PROVENANCE_AND_PARITY.md` | Manual assessment | N/A | PARTIAL |
| B | Identity resolver added | `public.resolve_pke_user_by_neon_auth_user_id` | Local DB `pke_test` | N/A | ✅ PASS |
| C | Real DB resolver in auth | `src/auth.ts` | Integration tests G1-c, G1-d | 0 | ✅ PASS |
| C | No hardcoded test roles | `src/auth.ts` | Integration tests | 0 | ✅ PASS |
| C | Unknown identity → 403 | `src/auth.ts` | Integration test G1-e | 1 (401*) | PARTIAL |
| D | Source integration tests | `src/integration/integration.test.ts` | `npm run test:integration` | 1 (19/28) | PARTIAL |
| D | Failure propagation | Controlled failing test | `npm run test:integration` | 1 | ✅ PASS |
| D | Test runner config | `vitest.config.integration.ts` | `test:integration` discovery | 0 | ✅ PASS |
| E | Route contract fixes | `src/index.ts` | Integration tests G3-a..G3-g | 1 (9/28 fail) | PARTIAL |
| E | Actor/checker from req.user | `src/index.ts` | Tracking/receipt/movement tests | 0 (some) | ✅ PASS |
| E | Cross-project validation | `src/index.ts` | G2-a, G2-b, G2-c, G2-d | 0/1 mixed | PARTIAL |
| E | NOT NULL timestamps | `src/index.ts` | Tracking/receipt create | 0 | ✅ PASS |
| E | Error redaction | `src/index.ts` | G6-a | 0 | ✅ PASS |
| F | All 17 validations | `VALIDATION/*.txt` | All commands listed in Gate F | 0/1 per spec | ✅ PASS |

### Sprint 01.3/01.4 Files Changed (Traceability)

| File | Gate | Change |
|------|------|--------|
| `scripts/test-db/preflight.mjs` | A | Complete rewrite: validator + CLI, strict URL, Docker/DB proofs |
| `src/test-db/preflight.test.ts` | A | 10 tests covering all validator branches |
| `src/index.ts` | A, E | Test startup fail-closed; route contract fixes (PATCH, actor, cross-project, timestamps, debug removal) |
| `src/auth.ts` | C | Test mode uses real DB resolver; JWT issuer 127.0.0.1 |
| `src/integration/integration.test.ts` | D | 28 tracked TS source tests (19 passing) |
| `vitest.config.ts/.integration.ts/.js` | D | Fixed test discovery (include src/integration, exclude test-db) |
| `scripts/test-db/debug-rls3.mjs` | A | Added reset guard |
| `scripts/test-db/debug-simple.mjs` | A | Added reset guard |
| `scripts/test-db/init-check.mjs` | A | Added operation guard |
| `scripts/test-db/init-final.mjs` | A | Added operation guard |
| `scripts/test-db/fix-role.mjs` | A | Added operation guard |
| `.env.test.local` | A | Added LOCAL_TEST_MAINTENANCE_DATABASE_URL |
| `migrations/001-028` | B, F | SHA-256 verified unchanged (28/28) |

### Key Constraints Verified

| Constraint | Evidence |
|------------|----------|
| Neon Production READ-ONLY | `PRODUCTION_READ_ONLY_CONFIRMATION.md`, no mutations in logs |
| Migration 001-028 immutable | `verify:migrations` 28/28 PASS, SHA-256 match |
| No non-local Neon branch | Preflight guard rejects `.neon.tech` and Production branch IDs |
| Test mode fail-closed | `src/index.ts` validates before Pool, no `.env` fallback |
| Docker loopback only | `BASELINE/docker_inspect_ports.json`, `netstat_54331.json` |
| DB role: app_runtime_secure, NOBYPASSRLS | `GATE_A/preflight_cli_valid.txt`, `verify:runtime` PASS |
| No credentials in logs | All URLs redacted in preflight/validation output |
| Dirty tree preserved | `GIT_STATE_BEFORE_AFTER.md`, no commits |
| P03 NOT READY, MFA BLOCKED | `mfaVerified: false` hardcoded, no simulation |

---