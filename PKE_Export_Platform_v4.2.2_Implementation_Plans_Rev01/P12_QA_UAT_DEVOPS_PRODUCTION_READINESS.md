# P12 — QA, UAT, DevOps & Production Readiness

**Kategori:** Quality and release management  
**Prioritas:** P0 from project start; final go-live gate  
**Plan revision:** 1.1  
**Status:** Draft untuk review — first-cycle readiness definition added

## 1. Tujuan

Memastikan setiap fitur benar secara bisnis, aman, dapat dipulihkan, dapat dioperasikan oleh petugas lapangan, dan menghasilkan angka keuangan yang dapat direkonsiliasi. Tidak ada go-live hanya berdasarkan UI demo atau AI response.

## 2. First-cycle readiness gate — mandatory per user decision

Cycle pertama tidak boleh diaktifkan sebagai live production cycle sampai seluruh plan yang termasuk scope release PKE awal (P01–P13) telah diterapkan dan dinyatakan running. Readiness berarti seluruh kemampuan yang dijanjikan dalam scope pilot tersedia, terintegrasi, diuji dan dapat digunakan oleh role terkait — bukan sekadar halaman/UI sudah selesai.

### 2.1 Kriteria terukur

- Semua P01–P13 mempunyai implementation evidence, owner, acceptance test dan status sign-off.
- Seluruh end-to-end flows wajib lulus pada staging/UAT dan diuji pada konfigurasi production-like.
- Tidak boleh ada defect terbuka yang diketahui pada seluruh acceptance criteria P01–P13 yang masuk scope rilis/cycle pertama. Ini mencakup defect Severity 1–4, termasuk defect kosmetik apabila tercatat sebagai bug pada fitur yang dinyatakan selesai.
- Seluruh jalur utama harus lulus tanpa defect: Contract Program approval, cycle creation, project activation, PKS procurement, truck departure/arrival, inventory/quantity reconciliation, RAB/payment instruction, accounting posting, compliance document gate, buyer/supplier access, project settlement dan close.
- Defect yang ditemukan harus diperbaiki dan regression test dijalankan sebelum gate disetujui. Fitur yang belum selesai tidak boleh dinyatakan selesai; fitur tersebut harus dikeluarkan secara eksplisit dari scope pilot oleh change control dan tidak boleh dibutuhkan oleh alur pilot.
- “Tanpa bugs” berarti tidak ada defect yang diketahui pada scope dan versi yang diuji; bukan jaminan matematis bahwa tidak akan pernah muncul defect baru pada kondisi yang belum pernah diuji.
- Admin-only approval flow dan single Admin recovery procedure diuji.
- Backup/restore Neon DB dan Neon Buckets, observability, incident response, notification, provider fallback serta manual operation fallback diuji.
- Buyer, supplier, checker, Finance, PM dan Admin menyelesaikan UAT sesuai hak aksesnya.
- Performance test memenuhi SLO yang ditetapkan dari target buyer experience dan 2–3 project aktif.

### 2.2 Readiness decision

P12 menghasilkan signed `production_readiness_assessment` yang merangkum seluruh plan, defect, test evidence, exceptions dan keputusan go/no-go. Tidak ada model AI yang dapat menyatakan readiness secara otomatis. Persetujuan aktivasi Contract Program/cycle tetap dilakukan oleh Admin Aplikasi.

## 3. Test layers

- Unit: calculation, validation, state transition, FX, quantity, cost allocation.
- Integration: Neon Postgres transactions, RLS, storage, providers, outbox, notifications.
- API contract: schema, auth, idempotency, status/error, rate limits.
- Security: role escape, RLS bypass, IDOR, signed URL leakage, secret exposure, prompt injection.
- UI: route guards, responsive layout, offline capture, accessibility, error states.
- AI eval: extraction accuracy, citation, grounding, leakage and cost.
- Accounting: double-entry balance, AP/AR, cash advance, FX and close.
- Field UAT: real mobile devices, geofence, photo, GPS accuracy, weighing and network outages.
- Performance/load: 2–3 concurrent projects initially, expected user peaks, buyer read traffic and file uploads.
- Recovery: DB restore, object restore, job replay and provider outage drills.

## 4. Mandatory end-to-end business scenarios

1. One PKS → truck → warehouse → bulk loading → vessel.
2. Multiple PKS → multiple trucks → one warehouse → bagging → container stuffing → vessel.
3. Direct bulk dispatch without intermediate warehouse.
4. Multi-port, multi-vessel, split shipments.
5. Recurring contract: Admin configures cycle policy; scheduled/manual draft is reviewed and activated only by Admin; one agreed settlement unit creates a Project Instance; several shipments and partial receipts/payments remain in that instance; full settlement and close checks close the instance; next cycle receives a new configuration snapshot and FX baseline.
6. Cash PKS payment, truck payment, daily labor and loading expenses with manual instructions and reconciliation.
7. Buyer payment milestones: partial payment, on-board trigger, document trigger, overdue and dispute.
8. Currency exposure: IDR functional currency, USD receivable and payable, baseline vs reference vs actual rate.
9. China and Pakistan document assessment with verified rules and missing requirement escalation.
10. Truck checkpoint: departure, optional waypoint, arrival, geofence mismatch, GPS unavailable, offline sync and variance.
11. Buyer, supplier and vendor portals prove no cross-party data leakage.
12. Gemini assistant reads scoped data and cannot approve/execute payments or alter ledger.

## 5. Truck checkpoint UAT

Test Android devices and supported browsers at PKS, public road, warehouse and port. Validate permission denied, poor accuracy, stale GPS, photo upload retry, offline capture, duplicate images, QR challenge expiry, wrong plate, wrong trip, server/client timestamp distinction, geofence boundary and manual review. Confirm the displayed buyer location is last verified checkpoint only.

## 6. Financial control UAT

- RAB versions and approved budget ceiling.
- Commitment created from PO/contract.
- Goods/service accepted creates accrual or payable as policy.
- Payment request approved and manual instruction issued.
- Executor uploads proof; Finance reconciles.
- Advance settlement and return cash.
- AP/AR aging and partial payment.
- Journal balance and reversal.
- FX revaluation/realized difference per approved policy.
- Project close blocks on unreconciled balances unless formally waived.

## 7. Security tests

- Buyer changes URL/project ID to access other buyer.
- Supplier reads another PKS's trip/price.
- PM accesses unassigned project.
- Revoked user uses old session.
- Pooled DB connection leaks previous user/project context.
- Application DB role bypasses RLS.
- User guesses private file object key.
- Signed URL is logged or shared across audience.
- Gemini prompt injection in uploaded invoice/regulation asks model to reveal data or call tools.
- User asks AI to perform payment approval or reveal hidden finance fields.

## 8. Deployment environments

- Development: local + Neon dev project, synthetic data, safe secrets.
- Staging/UAT: separate Neon project and storage, synthetic or masked test data; controlled pilot evidence only with explicit approval.
- Production: Neon paid project, always-on compute, restricted operations credentials, private bucket, monitoring, backup, incident plan.

Migrations go through CI: lint → migration test → unit/integration → RLS test → staging deploy → UAT sign-off → backup/restore checkpoint → production deploy. Use expand/contract migrations for zero/low-downtime schema changes.

## 9. Observability

- Structured logs with request/correlation IDs.
- Metrics: API p50/p95/p99, DB query latency, connection saturation, job backlog, error rate, storage error, external provider freshness, AI latency/token/cost, notification delivery.
- Traces across API → DB → job → provider.
- Alerting for database availability, compute, query latency, RLS denied anomalies, bucket errors, backlog, FX/operational alert failure and backup failure.
- Avoid PII/secret content in logs.

## 10. Backup and disaster recovery

Define RPO/RTO with business owner. Keep database backup/PITR and object storage backup separate. Maintain encrypted off-provider copy for critical documents. Test restore database and representative document evidence. Document incident owner, access revocation, credential rotation, manual workflow fallback and buyer communication.

## 11. Pilot exit criteria

- At least one full PKE shipment completes using the application from contract/project setup through buyer receipt/payment and project settlement, or documented partial pilot with outstanding risks.
- All critical financial balances reconcile with external evidence.
- All required documents are verified by authorized person.
- All truck movements have departure/arrival evidence and exception resolution.
- Buyer and supplier user tests pass.
- No critical RLS/privacy/security defect remains.
- All in-scope plans P01–P13 are implemented and running before first live cycle.
- No open S1/S2 defect or unresolved defect in a core business flow remains.
- Contract Program and recurring cycle cannot be activated by any principal other than the single Admin Aplikasi account.
- Backup and restore tested.
- Operational users trained and SOP approved.
- Support/incident ownership identified.
- Performance targets are measured and signed off.

## 12. Go-live decision

Go-live must have sign-off from business owner, project operations, finance/accounting, export/compliance, security/technical owner and pilot partner representatives as appropriate. Unresolved critical risk blocks production or requires documented executive acceptance.
