# P13 — Change Control, Requirements Traceability & Decision Register

**Kategori:** Governance  
**Prioritas:** P0  
**Plan revision:** 1.1  
**Status:** Draft untuk review — user decisions recorded

## 1. Tujuan

Mencegah keputusan arsitektur hilang atau saling bertentangan ketika paket plan dikembangkan. Setiap requirement dari Architecture Review v4.2.2 harus memiliki lokasi plan, implementasi, test dan status approval.

## 2. Change request

Setiap perubahan yang memengaruhi scope, data, workflow, permission, accounting, compliance, storage, model AI, API provider atau UX harus mencatat:
- ID dan judul perubahan;
- alasan bisnis;
- requirement/source discussion;
- plan yang terdampak;
- data migration impact;
- permission/security impact;
- accounting/compliance impact;
- API/UI/report impact;
- test cases;
- rollback/compatibility;
- approver dan effective version.

## 3. Traceability matrix starter

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

## 4. Decision register

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

## 5. Change-option impact review

Each amendment/change request must capture source negotiation, counterparty evidence, current and proposed terms, effective date, cycle range, and Admin-selected implementation option. The platform must calculate or list impact on quantity, contract value, RAB, commitments, AP/AR, FX, inventory/lot allocation, compliance documents, shipment, roles, reports, accounting periods and settlement. No historical posted journal, accepted quantity, payment evidence or closed project record is rewritten.

## 6. Versioning

Setiap plan menggunakan version number sendiri. Perubahan plan dicatat pada revision log. Plan yang sudah disetujui tidak diedit diam-diam; issue change request, buat versi baru, dan perbarui master index.
