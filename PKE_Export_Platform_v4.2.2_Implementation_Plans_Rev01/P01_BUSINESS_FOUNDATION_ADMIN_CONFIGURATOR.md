# P01 — Business Foundation & Admin Project Configurator

**Kategori:** Product/business configuration  
**Prioritas:** P0  
**Plan revision:** 1.1  
**Status:** Draft untuk review — keputusan pengguna 1 November 2026 telah dimasukkan

## 1. Tujuan

Membangun kerangka administrasi bisnis yang memungkinkan satu Admin Aplikasi menjadi satu-satunya otoritas untuk membuat, mengubah, mengonfigurasi, menyetujui, dan mengaktifkan Contract Program serta pengaturan proyek. Sistem mendukung kontrak jangka panjang yang menghasilkan Project Instance berulang berdasarkan unit pemenuhan dan settlement yang disepakati buyer.

Sistem harus mengurangi konfigurasi ulang setiap periode. Contract Program menyimpan template jangka panjang; setiap Project Instance mempunyai konfigurasi, angka, kurs, sumber pasokan, RAB, pembayaran, shipment, bukti, dan settlement sendiri.

## 2. Keputusan bisnis yang telah ditetapkan

1. Hanya satu akun/identitas Admin Aplikasi yang aktif sebagai pemegang otoritas tertinggi di aplikasi.
2. Hanya Admin Aplikasi yang boleh membuat dan menyetujui/mengaktifkan Contract Program serta konfigurasi otoritatifnya. PM, Finance, dan role lain tidak dapat menggantikan Admin.
3. Jika Admin tidak tersedia, proses yang membutuhkan persetujuan Admin harus menunggu. Tidak ada auto-approval atau fallback approval ke PM/Finance.
4. Recurring cycle dikonfigurasi oleh Admin sejak awal Contract Program dan dapat disesuaikan oleh Admin ketika proyek berjalan melalui pengaturan proyek/change control.
5. Project Instance merepresentasikan satu unit pemenuhan komersial yang harus diselesaikan dan di-settle, misalnya 10.000 MT yang dibayar buyer sebagai satu tranche. Project Instance bukan keseluruhan kontrak lima tahun.
6. Satu Project Instance dapat mempunyai beberapa shipment, voyage, PKS, gudang, pelabuhan, dan pembayaran parsial. Pembayaran parsial tidak otomatis membuat Project Instance baru; project tetap berjalan sampai kewajiban settlement yang disepakati terpenuhi.
7. Admin harus dapat memilih penanganan perubahan kontrak berdasarkan hasil negosiasi pihak buyer dan supplier. Aplikasi memberi opsi dan analisis dampak; aplikasi tidak mengambil keputusan komersial atas nama para pihak.
8. Readiness Gate untuk cycle pertama mensyaratkan seluruh plan yang masuk scope pilot telah diterapkan dan berjalan. Tidak boleh ada defect terbuka yang mengganggu alur bisnis inti, integritas data, keamanan, keuangan, atau kepatuhan.

## 3. Scope

### In scope
- Company profile dan pengaturan global single-company.
- Master buyer, importer, consignee, supplier, PKS, vendor dan partner contact.
- Buyer Contract dan Supplier/PKS Contract dengan version/amendment.
- Contract Program / Framework Contract dengan masa berlaku jangka panjang.
- Delivery Schedule dan settlement unit definition.
- Recurring cycle template, volume trigger, cadence, generation mode dan call-off.
- Project Instance per unit pemenuhan/settlement.
- Project configurator wizard dan immutable configuration snapshot.
- Admin-only feature catalog configuration, role/permission assignment, workflow selection, project team dan partner access.
- Payment milestones, cash obligation, RAB defaults, currency/FX policy dan project reporting profile.
- Change/amendment assessment serta opsi dampak ke Contract Program dan Project Instance.
- Project activation, suspension, close, reopen-by-authorized-change, dan archive policy.

### Out of scope
- Mengubah SQL/RLS dari UI Admin.
- Membuat kode workflow arbitrer yang tidak tersedia di engine.
- Eksekusi pembayaran bank otomatis.
- Admin menggantikan buyer/supplier untuk menyepakati perubahan komersial.
- Aktivasi workflow komoditas selain PKE pada fase awal.

## 4. Hirarki komersial dan proyek

```text
Buyer
  └── Buyer Contract
       └── Contract Program / Framework Contract (mis. 5 tahun)
            ├── Delivery Schedule (mis. 10.000 MT per bulan)
            ├── Settlement Unit Definition (mis. 10.000 MT per unit pembayaran)
            ├── Default payment milestone template
            ├── Default workflow / document / quality profile
            ├── Default currency / FX policy
            ├── Default role / stakeholder / reporting profile
            └── Recurring Cycle (mis. November 2026)
                 └── Project Instance (satu unit pemenuhan dan settlement)
                      ├── one/many delivery orders and shipments
                      ├── one/many PKS and suppliers
                      ├── one/many transport legs and truck trips
                      ├── one/many warehouses, ports and voyages
                      ├── project-specific versions/change orders
                      └── settlement, reconciliation and close
```

### 4.1 Definisi Project Instance

Project Instance adalah container operasional dan keuangan untuk satu unit pemenuhan buyer yang mempunyai batas kuantitas/periode/termin dan kewajiban settlement yang jelas. Dasar pembentukannya dikonfigurasi Admin dalam Contract Program, misalnya:

- quantity tranche: setiap 10.000 MT;
- periodic delivery: satu bulan kalender dengan volume yang ditentukan;
- buyer call-off / purchase order;
- shipment atau kelompok shipment yang disepakati;
- milestone komersial khusus;
- kombinasi quantity + periode + settlement trigger.

Sistem wajib menyimpan `cycle_basis`, `target_quantity`, `period_start`, `period_end`, `buyer_payment_basis`, `settlement_rule`, dan `cycle_sequence`.

**Penting:** satu project dapat menerima beberapa pembayaran parsial. Project hanya dinyatakan settled apabila jumlah pembayaran yang diterima telah memenuhi kewajiban buyer untuk unit tersebut, dan proses penutupan lain yang ditentukan policy telah selesai. Jangan membuat project baru untuk setiap transfer parsial kecuali kontrak memang mendefinisikan setiap transfer sebagai unit pemenuhan terpisah.

## 5. Admin Aplikasi — single authority model

### 5.1 Hak eksklusif Admin

Hanya Admin Aplikasi yang dapat:
- membuat, mengubah, menyetujui, dan mengaktifkan Contract Program;
- membuat atau mengubah recurring cycle policy;
- membuat, mengubah konfigurasi, mengaktifkan, menangguhkan, dan menutup Project Instance;
- memilih opsi penanganan amandemen/change request;
- mengubah role catalogue assignments, project memberships, feature flags, workflow, approval rules, data publication, dan stakeholder visibility;
- menetapkan Project Manager dan tim yang sama atau berbeda untuk beberapa project;
- menyetujui snapshot konfigurasi dan readiness gate.

Role lain dapat mengusulkan perubahan, mengunggah dokumen, menambahkan catatan negosiasi, mengajukan change request, atau menyiapkan draft operasional sesuai izin. Mereka tidak dapat membuat Contract Program resmi atau mengaktifkannya.

### 5.2 Jika Admin tidak tersedia

- Permintaan yang memerlukan tindakan Admin masuk antrean `pending_admin_action`.
- Tidak ada delegasi approval otomatis ke PM, Finance, Owner, atau role lain.
- Siklus yang membutuhkan perubahan konfigurasi tidak boleh diaktifkan sampai Admin menyelesaikan persetujuan.
- Prosedur pemulihan akses Admin harus menggunakan recovery channel/credential vault dan audit keamanan, bukan membuat approver alternatif.

### 5.3 Keamanan akun tunggal

Model satu akun Admin adalah keputusan bisnis pengguna. Karena satu akun yang dipakai bersama oleh beberapa manusia tidak dapat mengidentifikasi secara kriptografis siapa operator sebenarnya, rekomendasi keamanan adalah satu identitas Admin yang tidak dibagikan, MFA/passkey, re-authentication untuk approval sensitif, session revocation, IP/device/session alerts, dan credential recovery terkontrol. Jika organisasi tetap membagi kredensial, audit hanya dapat membuktikan tindakan dilakukan oleh akun Admin, bukan orang fisik tertentu; risiko ini harus diterima secara sadar.

## 6. Recurring cycle configuration

Admin menetapkan recurring policy di awal Contract Program. Policy dapat diubah melalui project setting, dengan versi dan tanggal efektif.

### 6.1 Pengaturan
- cadence: monthly, weekly, quarterly, date-based atau custom;
- cycle basis: quantity tranche, monthly delivery, buyer call-off, shipment group, payment/settlement unit, atau custom;
- target quantity dan satuan;
- date window dan cut-off;
- settlement trigger dan payment milestone template;
- generation mode:
  - `scheduled_draft`: sistem membuat draft cycle otomatis berdasarkan kalender/trigger, tetapi tidak pernah mengaktifkan otomatis;
  - `admin_manual`: Admin membuat draft cycle secara manual;
  - `quantity_triggered_draft`: sistem membuat draft ketika akumulasi order/kuantitas mencapai ambang yang ditetapkan;
- carry-forward atau treatment terhadap kekurangan/kelebihan kuantitas;
- apakah sisa volume dipindahkan ke cycle berikutnya atau dibuat change order;
- pewarisan default team, vendor, PKS candidates, workflow dan report profile;
- aturan FX baseline baru per cycle;
- aturan snapshot dan masa berlaku konfigurasi.

Rekomendasi default untuk pilot: `scheduled_draft`, karena mengurangi pekerjaan berulang tetapi tetap menahan aktivasi pada Admin. Admin dapat memilih `admin_manual` apabila jadwal belum pasti.

### 6.2 Perubahan cycle saat project berjalan

Admin dapat mengubah cadence, target volume, settlement unit, harga default, source candidates, currency policy, team, workflow atau fitur pada project setting. Setiap perubahan harus:
- membuat `project_change_request` atau `project_version` baru;
- menyimpan nilai sebelum/sesudah, alasan, sumber negosiasi, dokumen pendukung, tanggal efektif dan dampak;
- menyatakan apakah berlaku pada transaksi yang belum dimulai, pekerjaan aktif, atau hanya cycle berikutnya;
- melindungi transaksi, bukti, jurnal, pembayaran dan shipment historis dari perubahan retroaktif;
- memicu re-assessment RAB, cash obligation, compliance, FX, timeline, role dan buyer publication bila relevan.

## 7. Project Configurator Wizard

Tahapan:
1. Pilih atau buat Buyer Contract.
2. Buat Contract Program dan definisikan masa berlaku.
3. Tentukan settlement unit dan recurring policy.
4. Pilih cycle/call-off yang akan dibuat.
5. Tetapkan target MT, periode, harga dan payment milestones.
6. Pilih spesifikasi PKE dan buyer quality requirements.
7. Pilih negara tujuan, importer, consignee, intended use dan Incoterms.
8. Alokasikan PKS/supplier dan estimasi produksi/stok.
9. Definisikan transport legs, truck usage, warehouse, port, packing/bulk mode, container/vessel/voyage.
10. Pilih workflow template dan aktif/nonaktifkan modul yang didukung.
11. Jalankan draft compliance assessment.
12. Masukkan RAB, quotations, cash obligations, funding, project/reporting currency dan FX baseline.
13. Tetapkan tim, role, task owners, external partner access dan buyer/supplier visibility.
14. Review warnings, readiness gate dan impact analysis.
15. Admin menyetujui dan mengaktifkan project snapshot.

Field yang belum diketahui harus diberi `unconfirmed`, `needs_confirmation` atau `planning_assumption`; tidak boleh diberi nilai rekaan seolah-olah fakta.

## 8. Contract amendment & project change decision engine

Aplikasi tidak boleh memaksakan satu akibat untuk semua amandemen. Setelah Admin memasukkan amendment request dan melampirkan bukti negosiasi buyer/supplier, aplikasi menampilkan pilihan:

| Opsi | Penggunaan | Sistem melakukan |
|---|---|---|
| A. Amendment record only | Perubahan kontrak dicatat dan hanya berlaku untuk cycle mendatang | Simpan amendment/version; project aktif tidak berubah |
| B. Revise current project | Perubahan harus berlaku pada project yang sedang berjalan | Buat project version/change order dengan effective date; transaksi historis tidak ditimpa |
| C. New successor project | Ruang lingkup atau settlement unit berubah signifikan | Buat project baru yang tertaut ke project asal |
| D. Split project | Satu scope perlu dipisah ke dua atau lebih unit pemenuhan/settlement | Buat child/successor instances dan alokasi quantity/cost/payment yang terkontrol |
| E. Supplemental project/work package | Ada tambahan pekerjaan/volume di luar scope awal | Buat project tambahan atau work package sesuai konfigurasi |
| F. Future-cycle template change | Perubahan hanya untuk seluruh cycle berikutnya | Update Contract Program version dengan effective cycle |
| G. Temporary variation | Perubahan sementara karena kendala operasional | Override terbatas waktu, scope, approver Admin, dan expiry |
| H. Custom reviewed option | Kasus tidak cocok dengan opsi standar | Change request untuk analisis dan persetujuan Admin sebelum development/configuration |

Aplikasi harus menampilkan impact assessment untuk setiap opsi: volume, harga/revenue, RAB, commitment, AP/AR, cashflow, FX baseline/exposure, dokumen/regulasi, shipment, timeline, team/role, buyer/supplier reporting, accounting period dan project close.

AI boleh merangkum opsi dan dampaknya, tetapi tidak memilih atau menerapkan opsi. Admin hanya menerapkan opsi setelah bukti negosiasi atau persetujuan komersial dari pihak berkontrak tersedia. Admin mengesahkan konfigurasi sistem; Admin bukan pengganti buyer/supplier dalam menyepakati harga atau kontrak.

## 9. Hierarki konfigurasi dan snapshot

1. **Company defaults:** functional currency IDR, COA, global catalog, notification, security.
2. **Contract Program version:** buyer, product specification, country pack, Incoterms, payment terms, recurring policy, default workflow, roles and report audiences.
3. **Cycle draft:** target, dates, agreed price, PKS allocations, routes, RAB, cash obligations, FX baseline, compliance, team.
4. **Project activation snapshot:** immutable snapshot yang menjadi dasar transaksi.
5. **Runtime changes:** melalui change request/version; tidak menimpa histori.
6. **Project close:** settlement dan close criteria dipenuhi; project menjadi read-only kecuali koreksi melalui controlled adjustment/reopen flow yang disetujui Admin dan Finance sesuai jenis perubahan.

## 10. Admin settings yang harus tersedia

| Kategori | Setting |
|---|---|
| Users | Single Admin principal, invitation, suspend/deactivate partner users, session controls |
| Roles | Role catalogue, permissions, project scope, record scope |
| Features | Project feature flags dan module availability |
| Workflow | Stage templates, transitions, required fields, evidence, approvals, SLA |
| Contract programs | Contract term, delivery schedule, settlement unit, recurring policy, generation mode |
| Amendments | Allowed change options, evidence requirements, impact checklist, effective date |
| Checkpoints | Departure/arrival/waypoint, geofence, required images, tolerance, QR requirement |
| Finance | COA, cost code, RAB template, cash obligation, payment milestone, payment instruction |
| Compliance | Country packs, rule versions, document requirements and reviewers |
| Currency | Functional IDR, project reporting currency, baseline method, FX thresholds |
| Reports | Template, audience, frequency, publication controls |
| Notifications | Channel, trigger, recipient, escalation and quiet hours |
| AI | Enabled use cases, model routing, usage budget, protected data classes |

Admin hanya memilih dan mengonfigurasi kemampuan yang disediakan. Perubahan executable business logic tetap melalui software release.

## 11. Logical data entities

`buyers`, `buyer_parties`, `importers`, `suppliers`, `pks_sites`, `service_vendors`, `contracts`, `contract_versions`, `contract_amendments`, `contract_programs`, `contract_program_versions`, `delivery_schedule_templates`, `settlement_unit_definitions`, `recurring_cycle_policies`, `contract_cycles`, `cycle_generation_events`, `project_templates`, `project_template_versions`, `projects`, `project_versions`, `project_change_requests`, `project_change_impacts`, `project_config_snapshots`, `project_members`, `project_feature_flags`, `project_reporting_profiles`, `project_recurring_links`, `approval_events`, `admin_action_queue`, `workflow_templates`.

## 12. Acceptance criteria

- Hanya satu Admin principal aktif; hanya Admin dapat membuat, menyetujui dan mengaktifkan Contract Program.
- PM/Finance/vendor tidak dapat menggantikan persetujuan Admin ketika Admin unavailable.
- Admin dapat membuat Contract Program lima tahun, delivery schedule 10.000 MT per bulan, dan settlement unit 10.000 MT per cycle.
- Cycle generation mode dapat dikonfigurasi; rekomendasi default membuat draft otomatis, bukan aktivasi otomatis.
- Project Instance menampung beberapa shipment dan pembayaran parsial tetapi baru close saat settlement unit terpenuhi.
- Contract Program dapat menghasilkan banyak Project Instance tanpa input ulang semua konfigurasi.
- Admin dapat mengubah recurring rule selama contract/project berjalan dengan version, effective date, audit dan impact analysis.
- Admin diberi pilihan amendment record, revise current project, successor project, split, supplemental scope atau future-cycle change.
- Perubahan tidak mengubah transaksi historis, bukti, jurnal atau payment record yang sudah tercatat.
- Bukti negosiasi buyer/supplier dapat dilampirkan sebelum perubahan komersial diterapkan.
- Satu PM dapat ditugaskan ke 2–3 project atau tiap project memakai PM berbeda.
- Admin dapat mengaktifkan/mematikan fitur tanpa mengubah schema atau RLS SQL.
- Project tidak aktif jika readiness gates belum dipenuhi atau waiver yang diizinkan belum disetujui.

## 13. Dependencies

P02 domain model; P03 Admin principal/authorization; P06 workflow and operational catalog; P07 settlement/accounting; P08 compliance; P10 Admin UX; P11 reports/notifications; P12 readiness gate.

## 14. Resolved decisions

| ID | Keputusan | Status |
|---|---|---|
| D-P01-01 | Admin Aplikasi adalah satu-satunya authority dan approver Contract Program | Diputuskan pengguna |
| D-P01-02 | Recurring policy diset di awal dan dapat diubah Admin saat project berjalan | Diputuskan pengguna |
| D-P01-03 | Project Instance berbasis unit pemenuhan/settlement buyer | Diputuskan pengguna; detail contract-specific dikonfigurasi |
| D-P01-04 | First-cycle readiness mensyaratkan seluruh plan pilot diterapkan dan berjalan tanpa defect yang mengganggu alur inti | Diputuskan pengguna; kriteria terukur pada P12 |
| D-P01-05 | Amendment handling harus menyediakan beberapa opsi; Admin memilih tindakan sistem setelah bukti negosiasi tersedia | Diputuskan pengguna |

## 15. Catatan review yang masih perlu diputuskan

- Pilihan generation mode default per Contract Program (`scheduled_draft` direkomendasikan) harus disetujui saat konfigurasi awal.
- Definisi settlement unit pada tiap kontrak harus mengikuti wording kontrak dan tidak boleh diasumsikan selalu sama dengan invoice atau setiap transfer bank.
- Jika satu akun Admin dipakai bersama oleh beberapa orang, organisasi harus menerima keterbatasan atribusi identitas manusia pada audit.
- Chart of accounts dan kebijakan akuntansi/close ditandatangani akuntan perusahaan; aturan settlement komersial ditentukan dari kontrak buyer.
