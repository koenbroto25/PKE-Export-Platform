# P02 — Backend, Database & Neon Platform

**Kategori:** Backend foundation  
**Prioritas:** P0  
**Plan revision:** 1.1  
**Status:** Draft untuk review — settlement-cycle and Admin governance entities added

## 1. Tujuan

Membangun backend terpusat dan database PostgreSQL pada Neon sebagai source of truth untuk single-company PKE Export Platform. Sistem harus mendukung project paralel, workflow fleksibel, financial integrity, RLS, event audit, dan integrasi tanpa mengikat domain bisnis langsung pada vendor tertentu.

## 2. Rekomendasi baseline

- Neon Postgres production project terpisah dari staging/development.
- Paid Neon Launch untuk pilot dengan scale-to-zero dinonaktifkan pada production. Uji kebutuhan upgrade ke Scale berdasarkan SLA, monitoring, history/PITR, private networking dan beban nyata.
- Region Singapore dipilih bila tersedia dan latency test dari Indonesia/China/Pakistan mendukung.
- Gunakan pooled connection untuk pola serverless/short request. Worker/transaksi yang memerlukan session atau lock khusus harus menggunakan koneksi dan desain yang sesuai.
- ORM/query layer yang disarankan: TypeScript + Drizzle atau query builder setara; keputusan final melalui POC migration, transaction, type inference dan RLS context.
- Semua database migration version-controlled; tidak ada perubahan schema manual tanpa migration.

## 3. Logical architecture

```text
Frontend / PWA
    ↓ HTTPS
Backend API / Application Services
    ├── Authentication & Authorization adapter
    ├── Domain services (contract, project, operation, finance, compliance)
    ├── Query services / read models
    ├── Integration adapters
    ├── Storage adapter
    ├── AI orchestrator adapter
    └── durable worker / scheduled jobs
          ↓
Neon PostgreSQL (transactional source of truth)
Neon Object Storage (binary files)
```

Business logic harus berada di application/domain service dan database constraints. Jangan menjadikan frontend sebagai pemilik rumus transaksi atau state machine final.

## 4. Domain boundaries

1. Identity/access/configuration.
2. Commercial contracts and recurring delivery.
3. Master data: buyer, PKS, PKE spec, vendor, warehouse, port, vessel, truck, driver.
4. Project/workflow/operations.
5. Procurement, lot genealogy, inventory, transport and loading.
6. Documents and compliance.
7. Finance/accounting/FX.
8. Reporting/notifications/AI/audit/integrations.

Setiap domain memiliki service, repository/query layer, validation rules dan events. Cross-domain write harus melalui application service yang mempunyai transaction boundary jelas.

## 5. Data design rules

- UUID primary keys; business code unik dan mudah dibaca.
- `NUMERIC` untuk nominal, kurs, quantity, percentage, unit price dan hasil konversi; hindari float untuk nilai finansial/kuantitas.
- Unit of measure dan currency wajib eksplisit.
- Simpan transaction currency amount, applied FX rate, rate type/source/timestamp, dan IDR functional amount.
- Semua timestamp disimpan UTC; local operational timezone dan source timestamp dicatat bila penting.
- Versioning untuk kontrak, project configuration, workflow, COA, regulatory rules dan dokumen.
- Foreign key, check constraint, unique constraint, idempotency key dan referential integrity di database.
- Transaksi penting tidak dihapus; gunakan reversal/correction/superseding records.
- Simpan source, actor, approved_by, timestamps, correlation ID dan audit references.

## 6. State changes and event integrity

Gunakan relational state tables untuk keadaan saat ini ditambah append-only domain event/audit ledger untuk perubahan penting. Tidak perlu menjadikan seluruh aplikasi full event-sourcing.

Contoh event:
`contract_program_approved`, `cycle_draft_created`, `project_activated`, `project_version_activated`, `project_settled`, `project_closed`, `workflow_step_started`, `truck_departed`, `checkpoint_verified`, `truck_arrived`, `goods_received`, `inventory_moved`, `packing_completed`, `loading_started`, `loading_completed`, `document_verified`, `payment_instruction_issued`, `payment_evidence_submitted`, `payment_reconciled`, `fx_alert_triggered`, `project_settled`.

Setiap business transaction yang memicu notifikasi, report, AI analysis atau webhook harus memakai transactional outbox pattern agar event tidak hilang saat proses eksternal gagal.

## 7. Database domains and proposed groups

### Core/config
`company_profile`, `company_settings`, `users` (atau referensi auth provider), `partner_accounts`, `partner_members`, `project_members`, `role_catalog`, `permissions`, `role_permissions`, `member_roles`, `record_access_scopes`, `feature_catalog`, `project_feature_flags`, `workflow_templates`, `workflow_versions`, `project_workflows`, `workflow_instances`.

### Contract/project
`buyers`, `buyer_parties`, `importers`, `contracts`, `contract_versions`, `contract_amendments`, `contract_programs`, `contract_program_versions`, `delivery_schedule_templates`, `settlement_unit_definitions`, `recurring_cycle_policies`, `contract_cycles`, `cycle_generation_events`, `contract_calloffs`, `projects`, `project_versions`, `project_change_requests`, `project_change_impacts`, `project_config_snapshots`, `admin_action_queue`, `approval_events`, `shipments`, `voyages`.

### Master/operations
`commodities`, `products`, `product_spec_profiles`, `suppliers`, `pks_sites`, `pks_capacities`, `warehouses`, `ports`, `terminals`, `berths`, `vessels`, `containers`, `transporters`, `vehicles`, `drivers`, `routes`, `lots`, `inventory_movements`, `truck_trips`, `tracking_events`, `tracking_evidence`, `weighbridge_transactions`, `packing_batches`, `loading_operations`, `quality_inspections`, `claims`.

### Documents/finance/AI/reporting
Gunakan logical entity catalog dalam Architecture Review v4.2.2 §18.3 sebagai inventory awal. Plan khusus P05/P07/P08/P09/P11 mendefinisikan detail tiap kelompok.

## 8. Query and performance design

- Buyer portal memakai purpose-built read models/materialized views untuk ringkasan project, shipment, document publication dan vessel status.
- Gunakan pagination cursor/keyset untuk event list dan tabel besar.
- Tambahkan composite indexes berdasarkan `project_id`, status, created_at, entity FK, date bucket dan route.
- Hindari query N+1 dan full scan di portal.
- Cache hanya data yang aman dan dapat di-invalidasi; jangan cache hasil permission check tanpa key scope yang benar.
- External API, AI, file upload dan report berat tidak berjalan dalam request yang menahan transaksi database.
- Load test harus meliputi 2–3 project aktif, multi-user portal, event ingestion, file evidence dan dashboard query.

## 9. Background jobs and reliability

Buat durable job queue untuk notification, OCR/AI, report generation, integration polling, AIS updates, FX polling, storage scan dan reconciliation. Pilih runner setelah POC (mis. PostgreSQL-backed queue) dan jangan mengandalkan proses memory/timer pada serverless instance.

Semua job harus punya idempotency, retry with backoff, max attempts, dead-letter state, observability dan manual replay yang diaudit.

## 10. Neon operational setup

- Production paid; compute always-on untuk buyer-facing system.
- Development dan staging project terpisah dengan data sintetis.
- Pooled connection untuk web workloads.
- Autoscaling limits ditentukan melalui benchmark, bukan perkiraan.
- Monitoring CPU, RAM, connection saturation, query p95/p99, storage, transfer, compute cost dan error rate.
- Backup/PITR Neon tidak menggantikan export backup, object backup dan restore test.
- Neon Object Storage branch-aware: jangan membuat preview branch dari production yang mewarisi dokumen sensitif; dev/staging harus project terpisah dan seed anonim.

## 11. Acceptance criteria

- Migration dapat dijalankan ulang secara aman di staging dan rollback/forward-fix terdokumentasi.
- Satu company database dapat menampung 2–3 project aktif dengan isolasi project yang benar.
- Contract Program, delivery cycle dan project snapshots dapat ditelusuri.
- Settlement unit dan project instance relationship menjaga bahwa beberapa shipment dan partial buyer receipts dapat diselesaikan dalam satu instance tanpa membuat duplicate project.
- Hanya satu Admin principal dapat menulis/menyetujui status Contract Program; Admin unavailability menghasilkan pending queue tanpa fallback approver.
- Contract amendment/change decision menyimpan pilihan Admin, negotiation evidence, impact assessment, effective date dan project version; histori finansial/operasional tidak ditimpa.
- Financial amount dan tonnage tidak menggunakan floating-point.
- Transaction idempotency mencegah double submission.
- Event/outbox menjamin notification/report job dapat diproses ulang tanpa duplicate side effect.
- Performance test mencapai SLO yang disepakati dalam P12.
- Tidak ada domain service yang mengekspos database credentials ke client.

## 12. Dependensi

P01 business model; P03 RLS; P05 storage metadata; P06 operations; P07 finance; P12 CI/CD and quality gates.

## 13. Referensi teknis

- [Neon backend GA](https://neon.com/blog/neon-backend-is-ga)
- [Neon Object Storage GA](https://neon.com/blog/building-neon-object-storage)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon autoscaling guidance](https://neon.com/blog/neon-autoscaling-is-generally-available)
