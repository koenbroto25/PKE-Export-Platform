# PKE Export Intelligence & Project Control Platform
## Master System Architecture & Business Requirements — v4.2

**Status:** Draft final untuk review dan persetujuan sebelum implementasi  
**Tanggal dokumen:** 1 November 2026  
**Bahasa:** Indonesia  
**Jenis aplikasi:** Platform internal satu perusahaan eksportir, dengan portal eksternal untuk buyer, supplier, dan vendor  
**Cakupan komoditas:** Multi-komoditas; PKE menjadi komoditas pilot  
**Keuangan:** Full project accounting dan financial control  
**Intelligence:** Advanced rules, analytics, forecasting, dan Gemini AI pada paid tier  

> **Tujuan dokumen:** Menyatukan hasil diskusi dan rancangan terdahulu menjadi satu acuan bisnis, fungsional, data, keamanan, integrasi, AI, UX, dan implementasi. Dokumen ini adalah spesifikasi untuk direview. Dokumen ini belum merupakan persetujuan final atas setiap detail regulasi, skema akuntansi, kontrak API, atau SQL migration.

---

## Daftar isi

1. Ringkasan eksekutif
2. Keputusan produk yang sudah disepakati
3. Prinsip desain dan batas ruang lingkup
4. Kondisi rancangan v4.1 dan baseline implementasi
5. Model bisnis: buyer contract, project, shipment, voyage
6. Variasi skenario operasional
7. Workflow dan event-based operations
8. Modul fungsional platform
9. Master database dan corporate knowledge base
10. Finance, accounting, cash obligation, dan funder
11. Multi-currency dan FX Risk Intelligence
12. Export Compliance & Document Intelligence
13. Role, permission, RLS, dan segregation of duties
14. Portal buyer, supplier, vendor, dan field operations
15. Project reporting, dashboard, dan business intelligence
16. Gemini AI architecture dan use case
17. API eksternal dan integrasi
18. Arsitektur teknis dan logical data model
19. Security, privacy, audit, dan governance
20. Non-functional requirements
21. Tahapan implementasi
22. Acceptance criteria dan skenario uji
23. Keputusan yang masih perlu dikunci
24. Glosarium
25. Referensi

---

# 1. Ringkasan eksekutif

PKE Export Platform v4.2 dirancang sebagai **Export Intelligence & Project Control Platform** untuk mengendalikan pemenuhan kontrak ekspor dari persiapan pengadaan sampai penyelesaian dokumen, keberangkatan kapal, pembayaran, dan penutupan keuangan proyek.

Aplikasi tidak boleh mengasumsikan satu jalur operasional tetap. Proyek dapat melibatkan satu atau banyak PKS, beberapa supplier, beberapa rute truk, gudang atau tanpa gudang, packing atau curah, satu atau beberapa pelabuhan, kontainer atau kapal curah, dan beberapa shipment/voyage. Modul yang aktif, tahapan, tugas, approval, cash obligation, dokumen, dan hak akses ditentukan berdasarkan konfigurasi proyek.

Platform menggabungkan lima kemampuan utama:

1. **Operational Control** — mengetahui barang berasal dari mana, berada di mana, dipindahkan oleh siapa, sudah diterima/dikemas/dimuat berapa, dan bukti apa yang mendukung setiap pergerakan.
2. **Financial Control** — merencanakan RAB, cash requirement, cash obligation, komitmen biaya, AP/AR, pendanaan, cashflow, kurs, laba/rugi, dan settlement.
3. **Export Compliance** — mengidentifikasi persyaratan Indonesia, negara tujuan, negara transit, HS code, perizinan, dokumen, masa berlaku, serta kewajiban kontraktual.
4. **Stakeholder Transparency** — memberikan buyer, PKS, transporter, gudang, vendor, funder, dan pegawai lapangan laporan yang sesuai dengan tanggung jawab dan hak akses masing-masing.
5. **Advanced Intelligence** — menggabungkan deterministic rule engine, analytics, forecasting, external APIs, dan Gemini AI untuk mengekstrak dokumen, menilai risiko, memberikan rekomendasi, dan menjelaskan kondisi proyek.

**Prinsip kendali:** sistem transaksi, rumus keuangan, perhitungan kuantitas, status yang disetujui, regulasi tervalidasi, dan kontrol akses adalah sumber kebenaran. Gemini membantu memahami dan menganalisis data tersebut, tetapi tidak menggantikan mesin transaksi atau persetujuan manusia.

## 1.1 Hasil akhir yang diharapkan

- Admin dapat membuat project dengan alur yang disesuaikan dengan kontrak dan realitas lapangan.
- Aplikasi dapat merekomendasikan konfigurasi awal project, sumber pasokan, kebutuhan dokumen, kebutuhan cash, dan risiko utama.
- Seluruh barang dapat ditelusuri berdasarkan lot/batch dari sumber sampai shipment/voyage.
- Setiap transaksi biaya dan pembayaran dapat dilacak ke aktivitas, pihak penerima, bukti, approval, dan anggaran.
- Proyek multi-currency dapat memantau kurs dasar, kurs referensi, kurs transaksi aktual, eksposur, dan dampak perubahan kurs.
- Buyer melihat progress dan dokumen yang memang dipublikasikan kepadanya, bukan data internal perusahaan.
- Supplier/vendor menerima tugas dan laporan yang menjadi tanggung jawabnya, tanpa melihat informasi pihak lain.
- Management mendapatkan analisis lintas proyek dan lintas komoditas setelah data historis cukup.

---

# 2. Keputusan produk yang sudah disepakati

Keputusan berikut dianggap sebagai arahan produk dari pengguna dan menjadi asumsi kerja dokumen ini.

| Area | Keputusan |
|---|---|
| Cakupan komoditas | **Multi-komoditas**; PKE sebagai komoditas awal/pilot, arsitektur tidak mengunci hanya PKE |
| Pengguna perusahaan | **Single company**; satu perusahaan eksportir/operator platform, bukan SaaS multi-tenant pada fase ini |
| Buyer dan supplier | Banyak buyer, kontrak, PKS, supplier, vendor, shipment, dan project |
| Project | Project-based, dapat berulang berdasarkan kontrak jangka panjang |
| Keuangan | **Full financial management/accounting**, bukan hanya kas dan RAB |
| Mata uang | Multi-currency per perusahaan, kontrak, project, dan transaksi |
| FX | Kurs baseline project dikunci saat kesepakatan; kurs referensi dipantau; kurs aktual dicatat per transaksi |
| Intelligence | **Advanced**: rule engine, optimization, forecasting, BI, dan AI-assisted recommendations |
| AI provider | Google Gemini API **paid tier** untuk produksi |
| AI architecture | Backend AI Orchestrator; model routing; RAG; function calling; structured output; human approval |
| Role | Role diaktifkan per project; satu user dapat memegang beberapa role |
| Admin | Admin perusahaan mengonfigurasi project, user, role, workflow, fitur, dokumen, dan kebijakan akses |
| Buyer portal | Read-only terhadap data yang dipublikasikan dan diizinkan |
| Supplier/vendor portal | Laporan serta data sesuai scope kontrak/penugasan |
| Mobile field | Mobile-first, dukungan offline queue untuk area dengan koneksi buruk |

## 2.1 Keputusan teknis yang belum dikunci

Rancangan PKE v4.1 menggunakan React, Vite, TypeScript, Neon PostgreSQL, Neon Auth, Neon Object Storage, Neon Functions, dan Vercel. Dalam diskusi sebelumnya, Supabase juga sempat disebut. Pengguna belum menetapkan keputusan migrasi PKE dari Neon ke Supabase.

**Rekomendasi:** gunakan stack v4.1 yang sudah ada sebagai baseline dan evaluasi kelanjutannya sebelum coding besar. Jangan mencampur Neon Auth/RLS dengan Supabase Auth/RLS atau menggunakan dua sistem storage tanpa kebutuhan arsitektural yang jelas. Pilihan provider database, Auth, Storage, dan backend harus diputuskan sebagai satu kesatuan pada technical gate.

---

# 3. Prinsip desain dan batas ruang lingkup

## 3.1 Prinsip wajib

1. **Project-configurable, not hard-coded.** Tahapan tidak dibuat sebagai kolom/status tetap untuk semua project. Tahapan disusun dari workflow template dan konfigurasi project.
2. **Event-based and traceable.** Pergerakan barang, status pekerjaan, approval, dokumen, dan transaksi menghasilkan event/audit trail.
3. **One source of truth.** Satu data transaksi disimpan sekali dan dipakai oleh dashboard, laporan, finance, dan portal stakeholder melalui view/service yang sesuai.
4. **Segregation of duties.** Pengajuan, approval, pencairan, dan rekonsiliasi pembayaran dibedakan sejauh sumber daya memungkinkan.
5. **Data minimization.** Setiap stakeholder hanya menerima informasi yang dibutuhkan untuk tugas dan hak kontraktualnya.
6. **Human verification for critical facts.** Klasifikasi HS, kewajiban hukum, penerimaan kualitas, jumlah final, payment approval, dan dokumen final harus mempunyai jalur verifikasi manusia.
7. **Versioned rules and configurations.** Perubahan workflow, tarif, kurs dasar, spesifikasi, regulasi, dan permission tidak boleh mengubah fakta historis secara retroaktif.
8. **AI is advisory, not authoritative.** AI tidak menjadi sumber kebenaran untuk ledger, timbangan, regulasi, atau otorisasi.
9. **Multi-commodity data model.** Spesifikasi, satuan, HS, proses, dokumen, dan aturan dibentuk dengan master data yang dapat dikembangkan.
10. **Offline-aware operations.** Input lapangan dapat disimpan sementara, memiliki idempotency key, dan disinkronkan tanpa membuat transaksi ganda.

## 3.2 Batas ruang lingkup fase awal

- Fase awal berfokus pada satu perusahaan dengan komoditas pilot PKE.
- Dukungan multi-komoditas disiapkan di model data dan master data, lalu diuji bertahap.
- Platform tidak menggantikan CEISA/INSW/INATRADE, bank, sistem pelabuhan, AIS provider, atau sistem regulator. Integrasi hanya melalui API/akses resmi bila tersedia.
- Platform bukan pengganti keputusan legal, customs broker, importir, surveyor, laboratorium, atau penasihat pajak.
- Platform bukan otomatis sistem ERP penuh tingkat korporasi. Ruang lingkup akuntansi penuh yang dibutuhkan project harus disepakati melalui chart of accounts, jurnal, laporan, dan kebijakan akuntansi.

---

# 4. Kondisi rancangan v4.1 dan baseline implementasi

## 4.1 Fondasi yang dipertahankan

Rancangan v4.1 sudah menyediakan fondasi konseptual yang berguna:

- buyer, contract, project, project members, workflow template;
- master PKS dan riwayat hasil laboratorium;
- warehouse dan known vehicles;
- shipment, sumber PKS per shipment, truck entry;
- warehouse receipt, packing log, stuffing log, loading log;
- quantity loss, document checklist, document photos;
- shipment messages, problem reports;
- report groups, report logs, audit logs;
- Buyer Portal dan dashboard per role;
- prinsip mobile-first, offline queue, foto bukti, dan notifikasi.

Dokumen verifikasi alur tanggal 8 Oktober 2026 menekankan proses dari truk masuk, validasi manager lapangan, stuffing, foto dokumen, review PM, sampai kapal berangkat. Prinsip kemudahan checker, pelaporan bukti, dan tanggung jawab supervisor tetap dipertahankan, tetapi alurnya diperluas dari gudang/container-centric menjadi workflow ekspor dinamis.

## 4.2 Status implementasi v4.1 yang harus dibaca secara hati-hati

Snapshot v4.1 bertanggal 28 Oktober 2026 menyebut database aktif mempunyai sembilan tabel inti: `buyers`, `contracts`, `pks`, `project_members`, `projects`, `shipments`, `truck_entries`, `users`, dan `workflow_templates`. RLS aktif di tabel yang diaudit, tetapi `FORCE ROW LEVEL SECURITY` belum aktif; uji end-to-end dengan JWT nyata belum lengkap; project_members saat snapshot belum berisi penugasan; beberapa UI Buyer/Contract/Project masih menggunakan `localStorage`; dan tabel keuangan/invoice/pembayaran serta modul gudang/packing/loading/dokumen/loss/audit yang direncanakan belum semuanya terlihat di database aktif.

Karena itu, **jangan menganggap daftar tabel pada schema v4.1 sebagai daftar tabel yang sudah terimplementasi**. Audit ulang repository, branch database, migrations, Auth, RLS, Storage, dan frontend harus dilakukan sebelum menentukan apa yang dipertahankan, dimigrasikan, atau dibangun ulang.

## 4.3 Perubahan desain utama dari v4.1 ke v4.2

| Area | Pola lama/risiko | Arah v4.2 |
|---|---|---|
| Shipment | Satu warehouse, satu loading port, vessel name sebagai teks | Multi-location, route legs, terminal/port call, vessel/voyage, shipment allocation |
| Process status | Kolom tahap dan urutan tetap | Workflow graph, stages, events, dependencies, exceptions |
| Source | PKS menjadi sumber dominan | Multi-supplier dan multi-source per commodity |
| Finance | Belum menjadi sistem inti | RAB, cash obligations, AP/AR, treasury, accounting, funder, settlement |
| Currency | Satu currency pada kontrak | Company functional, contract/project, transaction, presentation currencies dan FX baseline |
| Export docs | Checklist statis per template | Regulation/document rule engine per origin, destination, HS, intended use, transport, effective date |
| Roles | Role string per project | Role catalog + granular permissions + record scope + RLS |
| Buyer visibility | Sebagian data dipisah dalam portal | Explicit publication/share model dengan field/document scope |
| AI | Belum ada AI layer formal | Gemini AI Orchestrator + RAG + tools + AI governance |
| Reporting | Summary/report email | Report center, stakeholder portals, scheduled/dynamic reports, accountability |
| Product scope | Pilihan product type terbatas | Commodity master generik dengan attribute/spec profiles |

---

# 5. Model bisnis: buyer contract, project, shipment, voyage

## 5.1 Hierarki komersial dan operasional

```text
EXPORTING COMPANY
│
├── BUYER / CONTRACTUAL CUSTOMER
│   ├── BUYER CONTRACT (berlaku beberapa shipment/periode)
│   │   ├── PROJECT 01 (mis. pemenuhan November 2026)
│   │   │   ├── Procurement / Supplier Contracts / PKS Allocations
│   │   │   ├── Operational Work Packages & Workflow Instances
│   │   │   ├── Lots / Batches / Inventory Movements
│   │   │   ├── Shipment A ── Container(s) / Loading Operation(s)
│   │   │   ├── Shipment B ── Vessel Voyage(s) / Port Call(s)
│   │   │   └── Project Settlement & Closeout
│   │   ├── PROJECT 02 (periode berikutnya)
│   │   └── PROJECT 03 ...
│   └── Other Contracts
│
├── MASTER SUPPLIERS / PKS / VENDORS / LOGISTICS PROVIDERS
└── MASTER PORTS / TERMINALS / WAREHOUSES / VESSELS / LABS
```

## 5.2 Definisi objek

- **Buyer:** pihak komersial yang membeli barang berdasarkan perjanjian.
- **Contract:** dasar komersial; berisi produk, volume, harga, kualitas, Incoterms, payment terms, dokumen kontraktual, dan masa berlaku.
- **Project:** satu paket eksekusi pemenuhan kontrak atau sebagian alokasi kontrak dalam periode tertentu. Satu kontrak dapat menghasilkan project berulang.
- **Procurement/Supplier Contract:** kesepakatan pembelian barang dari PKS/supplier.
- **Shipment:** unit pengiriman komersial/fisik yang memiliki kuantitas target, rencana, dokumen, dan alokasi barang.
- **Lot/Batch:** identitas material berdasarkan asal, batch/produksi/penerimaan, kualitas, dan perpindahan stok.
- **Inventory Movement:** pencatatan perpindahan lot antar lokasi atau perubahan status kepemilikan/penanganan.
- **Loading Operation:** operasi pemuatan ke kontainer atau kapal, memiliki lokasi, metode, peralatan, waktu, shift, kuantitas, dan bukti.
- **Container:** unit pengangkutan dengan nomor, ukuran, seal, berat, status inspeksi, dan event gate-in/on-board.
- **Vessel:** master kapal (IMO/MMSI dan karakteristik).
- **Voyage:** perjalanan kapal tertentu; sebuah vessel dapat memiliki banyak voyage.
- **Port Call:** kunjungan kapal ke pelabuhan/terminal tertentu, termasuk ETA/ATA/ETB/ATB/ETD/ATD jika tersedia.
- **Settlement:** penyelesaian komersial dan keuangan setelah milestones, invoice, pembayaran, claim, dan biaya direkonsiliasi.

## 5.3 Relasi dan batas

- Satu buyer dapat memiliki banyak contract.
- Satu contract dapat dipenuhi oleh banyak project.
- Satu project umumnya ditautkan ke satu contract buyer utama, tetapi dapat memiliki banyak supplier/PKS, gudang, route leg, pelabuhan, shipment, container, loading operation, dan voyage.
- Satu lot dapat dipecah ke beberapa pengiriman atau beberapa lot dapat digabungkan ke shipment, dengan traceability asal dipertahankan.
- Satu shipment bisa memiliki satu atau banyak container, atau satu operasi bulk/breakbulk ke vessel; tipe pengiriman menentukan child entities yang aktif.
- Satu vessel bisa digunakan pada banyak voyage dan port call.
- Vendor dan supplier dapat melayani beberapa project; transaksi tetap harus terikat ke project yang relevan.

---

# 6. Variasi skenario operasional

Sistem wajib mendukung variasi berikut tanpa perlu membuat modul aplikasi yang terpisah.

| Skenario | Contoh alur | Kapabilitas wajib |
|---|---|---|
| A. Bulk direct dari PKS ke kapal | PKS → truk → area pelabuhan/stockpile → conveyor/alat berat → palka | Truck dispatch, weighbridge, port receipt, loading rate, hold, downtime, survey, stockpile reconciliation |
| B. Bulk melalui gudang | PKS → truk → gudang → pelabuhan → kapal | Warehouse receipt, bin/area stock, inventory movement, storage cost, outbound handling, loading |
| C. Bulk ke container | PKS → gudang/area stuffing → bulk liner/container → weighing → seal → terminal → kapal | Container master, stuffing, container inspection, VGM/verified weight bila berlaku, seal, gate-in, on-board |
| D. Bagged ke container | PKS → gudang → bagging → stuffing → terminal → kapal | Bag size/count, bag batch, pallet jika digunakan, container, seal, stuffing evidence |
| E. Bagged ke palka | PKS → gudang → packing → dermaga → palka | Packing batch, jumlah karung, tally, hatch/hold, stevedore shift, loading performance |
| F. Multi-PKS/multi-warehouse/multi-port | Banyak sumber dan rute menuju satu/beberapa shipment/voyage | Allocation, route leg, inventory transfer, cost allocation, shipment split, multi-port/voyage traceability |
| G. Direct container from PKS | PKS → truk → stuffing di PKS → terminal → kapal | Origin stuffing, container/seal inspection, transfer custody, terminal event |
| H. Partial / split shipment | Satu project dikirim dalam beberapa tanggal/kapal | Partial fulfillment, remainder, multi-invoice/payment milestone, shipment reconciliation |

Setiap skenario harus dapat dikonfigurasi, termasuk pilihan tahapan yang dilewati, pengulangan tahap, parallel tasks, conditional branches, dan exception path.

---

# 7. Workflow dan event-based operations

## 7.1 Workflow Builder

Admin memilih template awal (misalnya bulk vessel, bulk container, bagged container, bagged breakbulk, direct port loading) lalu menyesuaikan langkahnya.

Setiap workflow node minimal memiliki:

- kode dan nama tahap;
- tipe aktivitas dan lokasi (PKS, transit, gudang, stuffing yard, terminal, kapal, dokumen, keuangan);
- dependency/prasyarat;
- apakah wajib, opsional, conditional, atau berulang;
- target start/end dan SLA;
- responsible role/user/vendor;
- expected quantity/unit;
- bukti wajib;
- validation/business rules;
- approval rule;
- payment/cash trigger bila ada;
- notifikasi/escalation;
- visibility scope untuk buyer/supplier/internal;
- version dan effective date.

## 7.2 Workflow states

Status generik: `not_started`, `ready`, `in_progress`, `on_hold`, `blocked`, `completed_pending_verification`, `verified`, `rejected`, `cancelled`, `waived_with_approval`.

Pengecualian harus memiliki reason code, penanggung jawab, waktu, bukti, dan tindakan tindak lanjut.

## 7.3 Event ledger

Simpan event seperti:

- truck dispatched, arrived, weighed, validated, departed;
- cargo received, stock transferred, stock reserved, stock released;
- packing started/completed, bag count confirmed;
- container inspected, stuffed, sealed, gate-in, loaded on board;
- loading started/paused/resumed/completed;
- vessel arrived/berthed/NOR accepted/sailing/left port;
- document issued/submitted/accepted/rejected/expired;
- payment requested/approved/disbursed/reconciled;
- buyer milestone triggered/paid/overdue.

Event bersifat append-only atau memiliki correction event; hindari menghapus fakta historis secara langsung. Current status diturunkan dari event yang sah dan status verifikasi.

## 7.4 Durasi dan produktivitas

Sistem menghitung:

- waktu kalender dari start sampai finish;
- waktu kerja aktif;
- waktu hold/downtime;
- durasi antrean dan perpindahan;
- MT/hour atau unit per shift;
- planned vs actual start/finish;
- penyebab downtime.

`Loading Rate = verified loaded quantity / active loading hours`.

Jangan menyamakan durasi kalender dengan jam kerja efektif. Hujan, kapal menunggu, kerusakan alat, antrean, dokumen tertunda, dan instruksi penghentian harus dibedakan.

## 7.5 Approval safety

Approval untuk uang, dokumen hukum final, hasil kualitas, quantity final, perubahan harga, dan penutupan accounting tidak boleh otomatis disetujui hanya karena tenggat waktu habis atau approver tidak tersedia. Gunakan escalation/fallback approver dan exception dengan jejak audit. Untuk project one-person-operation, admin dapat mengonfigurasi kontrol alternatif dan disclosure risiko; sistem tetap mencatat siapa menginput dan siapa yang menyatakan verifikasi.

---

# 8. Modul fungsional platform

## 8.1 Organization, users, authentication, and access

- Satu company profile/perusahaan operator.
- Admin-only provisioning; tidak ada self-registration untuk role internal maupun portal eksternal kecuali kebijakan baru disetujui.
- Satu user dapat memiliki beberapa role pada satu atau beberapa project.
- Buyer, supplier, transporter, warehouse operator, surveyor, PPJK, dan agent dapat diberi akun portal terbatas bila dibutuhkan.
- Invite, deactivate, suspend, reset, MFA/strong auth sesuai provider, session management, audit login.

## 8.2 Contract management

- Buyer profile dan pihak terkait.
- Contract number, product/grade, HS candidate dan verified code, volume, price, currency, tolerance, quality specs, origin/destination, Incoterms version/rule/place, payment terms/milestones, delivery windows, claims, document clauses, signatures, amendments, validity dates.
- Versioning kontrak dan amendment; catat mana ketentuan yang telah disepakati, belum disepakati, atau memerlukan verifikasi.
- Contract allocation ke project; total project allocations tidak melebihi volume kontrak tanpa approval.

## 8.3 Project Configurator

Wizard yang mencakup:
1. Informasi buyer contract dan product.
2. Target volume, quality spec, delivery window, destination.
3. Source PKS/supplier dan procurement terms.
4. Routes, kendaraan, warehouses, port/terminal, shipment/vessel.
5. Commodity handling, packing, container/bulk/breakbulk.
6. Workflow stages, dependencies, approvals, task assignments.
7. Export regulatory assessment dan document checklist.
8. RAB, category costs, cash obligations, cash schedule.
9. Currency setup, baseline FX, exposure policy.
10. Funder/capital plan bila digunakan.
11. User/role/permission/record scope.
12. Buyer/supplier report visibility.
13. Review, validation, version snapshot, activation.

AI boleh membuat draft hasil pembacaan kontrak dan rekomendasi. Admin harus mengonfirmasi sebelum status project menjadi active.

## 8.4 Procurement & supplier sourcing

- Supplier contract, purchase order/call-off, PKS allocation, target delivery, price, currency, cash/credit terms, quality specs, stock availability, supplier capacity, advance/payment schedule.
- Multi-PKS purchase dan blending/allocation berdasarkan kualitas dan kebutuhan.
- Supplier performance score berbasis data aktual, bukan opini AI.
- Komitmen volume agar kapasitas yang sama tidak dialokasikan berulang ke project berbeda.

## 8.5 Transport management

- Transporter, fleet, truck, driver, capacity, route, assigned trip, dispatch, trip stages, weighbridge tickets, delivery proof, cost rate, waiting time, issue reports.
- Tarif dapat berupa per trip, MT, km, ton-km, shift, atau lump sum.
- Driver personal data hanya untuk fungsi yang memerlukan.
- GPS/position boleh digunakan sesuai consent/kebijakan dan hanya dipublikasikan sesuai izin.

## 8.6 Warehouse & inventory

- Goods receipt, weigh-in/out, condition, lot/batch, storage area/bin, inventory ledger, reservation, transfer, issue, stock count, adjustment, contamination/damage, storage aging, handling charges.
- Multi-warehouse dan direct-to-port tanpa warehouse.
- FIFO/FEFO atau metode alokasi lain sesuai kebijakan barang/kontrak; metode yang digunakan harus tercatat.
- Barang dari beberapa PKS tidak kehilangan traceability setelah blending/combining.

## 8.7 Packing, container, and stuffing

- Packing type: bulk, PP bag, jumbo bag, bulk liner, container direct, dan format lain yang ditambahkan lewat master.
- Bag size/count, packaging material, batch, machine/line, shift, net/gross, rejected bags, rework, packaging consumption.
- Container type/size/no, tare, payload limits, condition, survey/inspection, stuffing, seal, VGM/verified weight bila berlaku, gate-in, shipping line booking, on-board confirmation.
- Stuffing di PKS, gudang, atau pelabuhan.

## 8.8 Port, vessel, voyage, and loading

- Port, terminal, berth, access restrictions, draft/depth, facilities, working hours, stockpile, conveyor/crane/loader, loading capacity, fees, port-call history.
- Vessel master: IMO, MMSI, flag, type, dimensions, draft, DWT, hold count/capacity where sourced/verified.
- Voyage and port-call schedule: ETA/ATA/ETB/ATB/NOR/commencement/completion/ETD/ATD/ETA destination.
- Loading method: conveyor, grab/crane, loader, bagged breakbulk, container lift, other.
- Hold allocation, tally, shift, equipment usage, active time, downtime, stoppage reason, ton/hour.
- Draft survey and surveyor report, ship-shore discrepancy, Statement of Facts, laytime/demurrage/despatch where applicable by actual contract/charter terms.
- AIS is informational tracking; port and vessel milestones require confirmation from authoritative agent/port records.

## 8.9 Export documentation and compliance

- Document registry, document checklist per shipment/project, issue/expiry date, owner, authority, jurisdiction, product, HS scope, validation status, file, original/copy, version.
- PEB/NPE and customs process tracking; quarantine/SPS, inspection, fumigation, COO/SKA, COA, invoice, packing list, B/L, insurance and other documents based on actual requirements.
- Separate statutory requirements, conditional requirements, buyer-contract requirements, and recommended supporting records.
- Document handover and controlled publication to buyer/importer.

## 8.10 Quality control, claims, and loss

- Commodity-specific quality attributes; sampling plan, sample ID, method, lab, result, unit, test date, COA, validity/lot relationship.
- Compare actual spec with buyer contract and applicable regulatory limits.
- Quality deviations, rejection, hold/release, re-test, blending approval.
- Quantity measurement points: origin, transport, warehouse, packing/stuffing, terminal/ship loading, draft survey/B/L.
- Quantity differences classified: weighbridge variance, moisture change, handling loss, spillage, damage, contamination, sampling difference, draft-survey difference, clerical correction.
- Tolerances are contract- and method-specific. The 0.5% in v4.1 must not be treated as universal industry tolerance.
- Claim workflow: notice, evidence, investigation, responsibility, financial impact, settlement, closeout.

## 8.11 Finance and accounting

Full detail pada Bab 10.

## 8.12 FX Risk Intelligence

Full detail pada Bab 11.

## 8.13 Reporting, notifications, and task accountability

- Configurable report templates, audience, frequency, language, data scope, delivery channel, owner, sign-off, and publication status.
- In-app alerts and email; optional future messaging integration after security and consent review.
- Task assignment, deliverables, due time, escalation, evidence, verification, and activity log.
- Reports can be generated from event and transaction data; AI creates narrative only after the dataset and recipient scope are determined.

## 8.14 Business Intelligence

- Cost per MT, revenue per MT, gross margin, net project margin, cost variance, cash conversion cycle, FX sensitivity, supply reliability, supplier quality, port productivity, truck utilization, loss ratios, buyer payment behavior, destination/commodity contribution.
- Cross-project comparisons must use normalized units/currencies, consistent definitions, and historical snapshots.

---

# 9. Master database dan corporate knowledge base

Master data dipisahkan dari transaksi. Contoh: `PKS` adalah master; pembelian 500 MT dari PKS pada project tertentu adalah transaksi procurement. `Vessel` adalah master; voyage dan port call adalah transaksi operasional. `Buyer` adalah master; sales contract adalah transaksi komersial.

## 9.1 Master data wajib

| Master | Data pokok |
|---|---|
| Commodity | commodity code, name, category, grade, form, units, handling types |
| Product specification profiles | attribute, unit, method, min/max, tolerance, required/optional, source standard |
| HS/tariff catalogue | HS version, code, description, national extension, effective dates, verified status |
| Buyer & importer parties | legal name, jurisdiction, PIC, importer of record, consignee, notify party, end user, credit/payment profile |
| Suppliers | legal entity, group, location, contact, supply type, contract/payment history |
| PKS / production facility | site identity, coordinates, products, production capacity, actual output, available stock, committed volume, quality history, permits/certificates |
| Warehouse | owner/operator, capacity, areas/bins, handling/packing capabilities, weighbridge, fees, operating hours, condition controls |
| Ports/terminals/berths | location, coordinates, draft/depth, berth limits, access, working hours, equipment, capacity, costs, restrictions |
| Vessel | IMO/MMSI, flag, type, dimensions, draft, DWT, hold and equipment data, verified source |
| Container | number, type, size, tare, max gross/payload, inspection, seal history/status |
| Transporter/fleet/truck | provider, plate, type, capacity, vehicle documents, availability, cost rates, maintenance status |
| Driver | name, employer, approved contact/identity data, licence class/expiry where applicable, assigned trips, operational records |
| Service vendors | labor, stevedore, fumigator, surveyor, lab, PPJK, ship agent, insurance, equipment rental, customs broker |
| Laboratories | identity, methods, accreditation/scope, location, valid accreditation, turnaround and price |
| Equipment | conveyor, loader, crane, weighbridge, bagging line, capacity, maintenance, rental/cost |
| Employees/contractors | role, employment/vendor relationship, skills, assignment, attendance/task scope; privacy controls |
| Currency & FX providers | ISO currency, provider, source type, rate timestamp, rate type, retrieval policy |
| Regulations & authorities | source authority, jurisdiction, subject, version, effective date, status, URL, official file |
| Documents/certificates | document type, issuer, holder, issue/expiry, product/site/country scope, verification |
| Routes & locations | route legs, distance source, estimated duration, restrictions, toll/ferry/cost reference |
| Cost catalog/rate cards | activity, unit, rate, currency, effective dates, vendor/port/project applicability |
| Banks/funders/accounts | institution, facility, instrument, currency, terms, access class (sensitive) |
| Reference catalogs | units, package types, Incoterms versions, payment trigger types, issue codes, country/port codes |

## 9.2 PKS capacity and availability

Bedakan kapasitas desain, kapasitas operasional aktual, estimasi produksi, stok tersedia, stok terikat pada kontrak lain, dan volume yang dapat dialokasikan.

```text
Available Supply Forecast
= Forecast Production
+ Verified Available Stock
- Existing Commitments
- Safety/Operational Reserve
```

Kapasitas yang tercatat pada master tidak boleh otomatis dianggap sebagai stok tersedia. Forecast wajib memperhitungkan downtime, seasonality, maintenance, quality yield, dan komitmen lain jika datanya tersedia.

## 9.3 Product specification profiles

Tidak boleh hard-code hanya parameter PKE. Gunakan attribute catalogue agar produk lain dapat memiliki atribut berbeda.

Contoh parameter PKE (bukan standar universal): crude protein, moisture, crude fibre, crude fat, ash, sand/silica, aflatoxin, profat, urease activity, dan parameter lain sesuai kontrak/regulasi. Setiap parameter perlu satuan, metode uji, basis (as received/dry matter jika relevan), min/max, toleransi, lab, dan tanggal pengujian.

## 9.4 Document & Certificate Registry

Setiap dokumen/sertifikat master menyimpan:

- document type dan nomor;
- pemilik/holder (perusahaan, PKS, gudang, produk, kendaraan, personel, vendor);
- penerbit dan jurisdiction;
- tanggal terbit dan tanggal berlaku/berakhir;
- scope produk, fasilitas, negara, atau kegiatan;
- status verifikasi dan siapa yang memverifikasi;
- file asli/salinan, checksum, version;
- reminder 90/60/30/14/7 hari sesuai kebijakan;
- proyek/shipment yang menggunakan dokumen;
- superseded/revoked status.

## 9.5 Historical and source integrity

Setiap master yang bisa berubah (kapasitas, harga, status sertifikat, spesifikasi, rate card, port data) harus memiliki history/version/effective date. Laporan lama harus mengacu ke snapshot yang berlaku saat transaksi, bukan nilai master terbaru.

---

# 10. Finance, accounting, cash obligation, dan funder

Modul keuangan adalah inti platform, terhubung ke procurement, transport, gudang, packing, loading, dokumen, dan settlement.

## 10.1 Project Budget / RAB

- RAB draft, reviewed, approved, revised; seluruh versi tersimpan.
- Cost breakdown structure: procurement, transport, warehouse, handling, packing, container, port, loading, vessel, docs, customs/levies/taxes, inspection, insurance, financing, labor, overhead, contingency, claim/other.
- Cost basis: per MT, per trip, km, per bag, per container, per shift, hour, day, fixed fee, percentage, or formula.
- Planned quantity/rate/currency, tax, exchange baseline, target/actual unit cost.
- Budget owner, approval threshold, budget transfer, change reason.

## 10.2 Cash Obligation & Payment Planning Engine

Setiap biaya mempunyai aturan pembayaran yang dapat dikonfigurasi pada master rate/contract dan di-override pada project:

- penerima/vendor/party;
- jenis biaya dan project/work package;
- cara bayar yang diperbolehkan: cash, transfer, bank instrument, credit/tempo, advance, milestone, other;
- kategori operasional: **Cash Critical**, **Cash Operational**, **Deferred/Credit**, atau **Other**;
- wajib dibayar sebelum apa: sebelum barang keluar PKS, sebelum truk berangkat, setelah truk tiba, setelah bongkar, per shift, selesai packing, sebelum loading, saat dokumen terbit, atau sesuai invoice/termin;
- basis rate: MT/trip/km/bag/shift/hour/fixed/percentage;
- due date/time dan grace period;
- apakah pembayaran parsial diperbolehkan;
- requester, approver, cashier/treasurer, verifier, reconciler;
- bukti tagihan, bukti penerimaan jasa/barang, bukti pembayaran;
- advance, settlement, refund, unused cash return;
- approval thresholds dan exception policy.

**Penting:** sistem tidak menganggap PKS, sopir, buruh, PPJK, atau vendor tertentu selalu wajib dibayar cash. Cara dan waktu bayar berasal dari kontrak/rate agreement aktual. AI boleh merekomendasikan klasifikasi; Admin/Finance mengonfirmasi.

### Cash Readiness Gate

Sebelum aktivitas yang memiliki cash-critical prerequisite dijalankan, sistem memeriksa:

1. nilai kewajiban yang jatuh tempo;
2. dana tersedia menurut currency/account;
3. dana sudah di-assign untuk kewajiban lain atau belum;
4. payment approval dan bukti sebelumnya;
5. potensi shortfall;
6. siapa yang berwenang memberi exception.

Jika dana belum tersedia, sistem memberi warning/block sesuai policy. Bypass memerlukan alasan, approver, dan audit event; Gemini tidak boleh melakukan bypass.

### Cash forecast

Forecast harian/mingguan harus mengelompokkan arus berdasarkan tanggal pemicu dan mata uang: saldo awal + expected inflows - committed outflows - forecast expenses = projected balance. Tampilkan gap per currency dan tanggal, bukan hanya total IDR.

## 10.3 Accounts Payable (AP)

- vendor invoice/bill, invoice matching, purchase/contract/receipt/service evidence;
- due date, terms, partial payment, retention/withholding if applicable;
- approval workflow;
- payment execution reference and bank/cash record;
- reconciliation, dispute, credit note, reversal/correction;
- ageing and forecast.

## 10.4 Accounts Receivable (AR)

- buyer invoice, contract milestone, invoice currency, taxable/tax treatment per policy;
- payment trigger and supporting evidence;
- due date, partial payment, short payment, bank charges, exchange conversion;
- ageing, collections, dispute/claim, settlement.

Payment terms harus dibuat sebagai **Payment Milestone Builder**, bukan teks bebas saja. Setiap milestone mempunyai event trigger, percentage/fixed amount, calculation basis, required documents, due date rule, and approval. Istilah seperti `5:4:1` tidak boleh diberi arti otomatis; definisi dan persentase/pemicu harus dimasukkan dari kontrak buyer dan dikonfirmasi.

**Incoterms berbeda dari payment terms.** Incoterms menentukan kewajiban pengiriman, biaya, dan risiko; bukan metode atau waktu pembayaran. Simpan versi Incoterms (mis. Incoterms 2020), rule, dan named place/port.

## 10.5 Treasury, cash, bank, and petty cash

- cash/bank accounts per currency;
- cash advance per recipient/task;
- disbursement, receipt, transfer, bank fee, reconciliation;
- petty cash and cash count;
- statement import/reconciliation where possible;
- cash custody and limits;
- dual approval for sensitive transactions.

## 10.6 Full accounting scope

Sebelum implementasi, Finance harus menyetujui chart of accounts dan accounting policy. Minimum:

- double-entry general ledger;
- journal entries and posting periods;
- AP/AR subledgers;
- cash/bank ledger;
- project cost centers and cost allocations;
- revenue recognition policy per contract/milestone;
- inventory valuation and goods-in-transit treatment;
- advances and prepayments;
- accruals and provisions;
- taxes/withholding handling as applicable;
- realized/unrealized FX gains/losses;
- trial balance, general ledger, income statement, balance sheet, cashflow statement, AP/AR ageing;
- project P&L and margin analysis;
- reversals/corrections with audit trail.

If the company requires full statutory accounting beyond project accounting, tax reporting, consolidated financial statements, or integration with a licensed accounting/ERP platform, scope and acceptance need separate confirmation. Do not claim regulatory accounting compliance until reviewed by the company's accountant/tax adviser.

## 10.7 Funder and financing

Optional module:

- funding source/party;
- instrument: loan, working-capital advance, shareholder capital, revenue/profit share, revolving fund, other;
- principal, currency, disbursement, interest/fee, profit-share calculation basis, maturity, instalments, collateral/conditions if applicable;
- use-of-funds allocations;
- repayment and settlement;
- funder reporting scope;
- reconciliation to project ledger.

Funder access is contractual and scoped. Funder is not automatically a project manager or owner of all operational data.

## 10.8 Cost, profitability, and settlement

Dashboard metrics:

- approved budget;
- committed costs;
- actual accrued costs;
- cash paid;
- unpaid AP;
- advances outstanding;
- projected cost at completion;
- revenue contracted and recognized;
- AR collected/outstanding;
- quantity and quality claims;
- FX gain/loss;
- financing costs;
- project gross/net margin and contribution per MT.

Closing a project requires reconciliation of delivered quantity, inventory balance, shipment/document milestones, AP/AR, cash advances, funding, exchange difference, claims, and accounting entries.

---

# 11. Multi-currency dan FX Risk Intelligence

## 11.1 Currency model

Sistem membedakan:

1. **Company functional/accounting currency** — mata uang dasar pembukuan perusahaan (ditetapkan perusahaan, kemungkinan IDR).
2. **Contract currency** — mata uang harga dan kewajiban kontrak buyer.
3. **Project reporting currency** — mata uang yang dipilih untuk dashboard proyek (dapat USD atau IDR).
4. **Transaction currency** — mata uang asli setiap AP, AR, payment, receipt, funding, dan expense.
5. **Presentation currency** — mata uang tampilan laporan jika berbeda dari functional/project currency.

Project dapat menggunakan USD untuk kontrak buyer, IDR untuk pembelian PKS/transport/buruh, dan mata uang lain untuk kapal, jasa, bank, atau pemasok tertentu.

## 11.2 Three FX rates that must not be mixed

| Rate | Arti | Penggunaan |
|---|---|---|
| Contract/Budget Baseline | Kurs dasar yang disepakati atau dipilih saat project approval | RAB, budget comparison, FX alert baseline |
| Market Reference | Kurs pasar/benchmark dari sumber dan timestamp tertentu | Monitoring, revaluation scenario, risk alert |
| Actual Execution Rate | Kurs transaksi riil bank/authorized FX provider | Posting transaksi dan realized FX result |

Contoh: baseline project Rp18.000/USD. Nilai tersebut dikunci saat approval dan tidak berubah otomatis. Ketika market reference menjadi Rp18.500/USD, sistem menghitung sensitivitas; actual transaction rate tetap berasal dari konversi yang benar-benar dilakukan.

Baseline bukan automatically a hedged rate or guaranteed bank rate. Jika ada kurs fixed/forward contract, catat sebagai hedging contract terpisah.

## 11.3 FX source and update schedule

- Bank Indonesia JISDOR dapat dipakai sebagai USD/IDR benchmark harian.
- BI menerbitkan JISDOR pada 15.15 WIB berdasarkan cut-off 15.00 WIB; bukan real-time intraday quote.
- Non-USD/IDR benchmark/reference pairs tersedia untuk sejumlah mata uang.
- Actual bank execution rates berasal dari bukti transaksi atau API bank yang authorized.
- Intraday monitoring, bila dibutuhkan, memakai licensed/approved market-data provider dan harus mencantumkan rate type, timestamp, bid/ask/mid, dan stale status.
- Bila provider down atau data stale, sistem tidak boleh menyajikan angka terakhir seolah-olah live.

## 11.4 Net FX exposure

Exposure dihitung per mata uang dan maturity/date bucket:

```text
Net Exposure(currency, due bucket)
= Expected Receivables
- Expected Payables
- Eligible Hedge Position
```

Analisis harus mempertimbangkan:
- jumlah mata uang yang akan diterima;
- kewajiban yang harus dibayar;
- tanggal jatuh tempo dan expected settlement;
- probability/quality of receipt (contracted vs forecast);
- payment fees and bank spreads;
- actual and budgeted cash balances;
- hedge position if any.

USD receivable dapat mengimbangi USD payable. Kenaikan kurs tidak selalu buruk; arah dampaknya ditentukan oleh net exposure. Dashboard wajib membedakan gross exposure, net exposure, due date, dan liquidity gap.

## 11.5 FX impact and alert rules

Admin/Finance mengatur dua lapis threshold:

**Rate-movement thresholds:** persentase perubahan dari baseline/reference (contoh konfigurasi 1%, 2%, 3%, 5%; bukan standar universal).

**Financial-impact thresholds:**
- budget FX contingency consumed;
- projected cash shortfall per currency/date;
- project margin below target/floor;
- estimated loss above approval threshold;
- unhedged net exposure above policy limit;
- rate source stale or data provider failed.

Sistem menghitung deterministic sensitivity scenarios (mis. +/-1%, 3%, 5%, 10%) dan stress scenarios per currency. AI menjelaskan dampak dan rekomendasi; formula dan angka berasal dari FX/finance engine.

## 11.6 FX accounting

- Store source currency amount, functional currency value, rate, rate source, rate date/time, conversion direction, actual/budget flag.
- Realized FX difference recorded on settlement according to approved accounting policy.
- Unrealized revaluation recorded at period-end according to accounting policy.
- Baseline rate is for budget comparison; it must not replace actual rate in transaction journal.
- Hedge contracts, if used, are recorded as distinct financial instruments and require accounting review.

## 11.7 FX dashboard and policy

- baseline vs market vs actual rate;
- rate graph and last update;
- total and net exposure per currency;
- incoming/outgoing cashflow by due date;
- projected gain/loss and margin sensitivity;
- cash available/shortfall per currency;
- risk level, alert, recommended action, responsible owner;
- exchange rate source and freshness.

---

# 12. Export Compliance & Document Intelligence

## 12.1 Compliance assessment inputs

Document/rule checklist cannot be selected from destination country alone. Inputs must include:

- origin country and exporter legal entity;
- destination and transit countries;
- commodity/product description and verified HS code/version;
- product use (e.g. animal feed, industrial input, other);
- origin/manufacturing site and supplier status;
- product form (bulk, bag, jumbo bag, container, breakbulk);
- transport mode, ports, and shipment route;
- Incoterms and named place;
- buyer/importer of record/consignee;
- shipment date and regulation effective dates;
- quality/specification and risk factors;
- buyer contract document clauses.

## 12.2 Categories of document requirements

Each checklist item must be classified:

1. **Statutory mandatory** — expressly required by applicable law/regulation.
2. **Conditional statutory** — required only if defined condition is met.
3. **Contractual mandatory** — required by buyer, supplier, lender, or commercial contract.
4. **Operational evidence** — evidence required to prove movement/receipt/handling.
5. **Recommended supporting document** — helps reduce risk but is not universally mandatory.

Never label a document as universally mandatory for all PKE exports unless the applicable rule supports it.

## 12.3 Document catalogue examples

Potential document types (actual applicability must be assessed per transaction):

- company legal/registration/exporter details;
- purchase/sales contract, purchase order;
- commercial invoice;
- packing list/weight list;
- PEB and NPE/customs responses;
- export approval/license or other LARTAS document if applicable;
- COA/laboratory report/inspection certificate;
- phytosanitary or other quarantine certificate if required;
- fumigation/treatment certificate if required;
- Certificate of Origin/SKA if requested or needed for tariff preference;
- shipping instruction, booking, shipping order;
- Bill of Lading/Master B/L;
- stowage plan, statement of facts, draft survey, tally sheet;
- insurance document when required by contract/Incoterms;
- container inspection, stuffing report, VGM, seal information where applicable;
- buyer/importer permits and destination-side certificates when provided/required.

## 12.4 Regulatory knowledge base and rule engine

Each regulation record should hold:

- jurisdiction, authority, regulation identifier/title;
- publication and effective dates;
- status (draft/current/superseded/repealed/under review);
- official source URL and stored source snapshot/hash;
- article/annex/page references;
- commodities/HS/product descriptions covered;
- country/import destination, usage, and mode conditions;
- specific obligation, document, timeframe, responsible party;
- verified-by and verified-at metadata;
- rule version and superseding reference.

Rules are evaluated by deterministic rule engine. Gemini can search/summarize/compare and propose candidate rules, but a compliance officer must approve any rule used to block or release a shipment.

## 12.5 Initial Indonesia references requiring validation in every project

- PMK 155/PMK.04/2022 concerning customs provisions in export, including PEB processes and provisions for bulk export scenarios. Specific application must be verified against shipment facts and subsequent amendments/implementing guidance.
- Bea Cukai's mandatory upload guidance implemented from 3 August 2026: invoice and packing list at initial PEB submission; B/L/master B/L or specified transport document through PEB amendment under the published conditions and timeline. The exact current process must be checked before implementation/use.
- Permendag 16 Tahun 2026 on export policy/regulation for strategic palm-oil natural-resource commodities, effective 1 June 2026 and repealing Permendag 26/2024 (as recorded by official JDIH/BPK). The annex and exact product/HS scope must be read; do not infer that every product in a neighboring HS family is subject to the same rule.
- JDIH Kementerian Keuangan's summary for PMK 9 Tahun 2026 lists a US$30/MT tariff line for Palm Kernel Expeller/Meal under ex 2306.60.10 and ex 2306.60.90 in Group I. Because the regulation title concerns BLU BPDP service tariffs, the application must not automatically label this as a universal export duty. Finance/compliance must verify exact product description, HS extension, responsible party, calculation base, exemptions, effective dates, invoicing/collection mechanism, and applicability before it becomes a project cost rule.
- Destination-side import, feed, SPS, labeling, contaminant, registration, and importer requirements must be sourced from the current competent authority/importer/customs broker, not assumed from a generic country checklist.

This chapter is an architectural design and starting research register, not legal advice or a final transaction-specific compliance opinion.

## 12.6 HS code and tariff decision

- Commodity master may store candidate HS codes and past classifications.
- Project cannot move to approved compliance state until the selected HS code, product description, national tariff line, and effective date are reviewed by authorized compliance/customs staff.
- Do not infer tariff/levy/export approval requirements using substring/prefix matching alone.
- Store HS tariff nomenclature version and evidence for the selected code.
- If a new regulation or official ruling changes applicability, create a new rule version and assess impacted active projects.

## 12.7 Compliance dashboard

Show per project/shipment:
- requirement name and category;
- source regulation and precise article/annex;
- responsible party (exporter/importer/buyer/PPJK/lab/surveyor/other);
- required-by date/event;
- file/status/review result;
- issue/expiry date;
- pending human verification;
- source freshness and rule version;
- blockers and recommended next action.

---

# 13. Role, permission, RLS, and segregation of duties

## 13.1 Role architecture

Role is assigned per project and can be combined for a user. Catalog roles include:

- Platform/Admin Company Administrator;
- Executive/Management Viewer;
- Project Manager;
- Field/Operations Manager;
- Procurement/PKS Manager;
- PKS Checker;
- Transport Manager;
- Truck Checker/Dispatcher;
- Warehouse Manager/Checker;
- Packing Supervisor;
- Loading/Vessel Operations Manager/Checker;
- Export Documentation/Compliance Officer;
- QC/Quality Officer;
- Finance Controller;
- AP/AR Officer;
- Cashier/Treasurer;
- Accountant;
- Funder/Financing Viewer;
- Buyer Portal User;
- Supplier/PKS Portal User;
- Transporter/Vendor Portal User;
- External service user (PPJK, surveyor, fumigator, agent, lab) scoped to assignment.

Admin may activate/deactivate role templates per project, combine roles, and assign specific users. Role name does not by itself authorize every record: record scope is required.

## 13.2 Permissions catalog

Permissions should be granular, e.g.:

`view`, `create`, `edit`, `submit`, `verify`, `approve`, `reject`, `assign`, `upload`, `publish_to_buyer`, `view_cost`, `view_supplier_price`, `view_cash`, `view_profit`, `request_payment`, `approve_payment`, `execute_payment`, `reconcile`, `close_period`, `export_data`, `manage_members`, `manage_workflow`, `manage_master_data`.

Permissions are scoped by module, project, record, partner, location, or assignment. A transporter should only see its own trip and invoice records; PKS A should not see PKS B; a buyer only sees their own contracts and explicitly shared information.

## 13.3 Baseline visibility matrix

| Data | Admin | PM | Field manager | Checker | Finance | Funder | Buyer | Supplier/vendor |
|---|---|---|---|---|---|---|---|---|
| Project progress | All company | Assigned projects | Assigned scope | Own tasks | Summary | Contractual summary | Published only | Own deliveries/tasks |
| PKS/supplier identity | Yes | If assigned | Operational need | Own assigned | If needed | Summary | Contract-dependent | Own identity/contract |
| PKS purchase price | Yes | By permission | No default | No | Yes | Contractual summary | No default | Own quote/contract only |
| Truck/driver detail | Yes | If needed | Assigned operations | Own entries | No default | No default | No default | Own fleet/trips |
| Warehouse inventory | Yes | Assigned projects | Assigned facility | Own assigned tasks | Value summary | If agreed | Published quantity only | Own warehouse scope |
| Export documents | Yes | Assigned project | Assigned tasks | Upload only | Finance documents | Agreed subset | Approved shared docs | Own issued/required docs |
| Cash/AP/AR | Yes | By permission | Request status only | Own request | Yes | Funding scope | Payment milestones only | Own invoices/payments |
| RAB/profit | Yes | By permission | No default | No | Yes | Agreement-specific | No | No default |
| FX exposure | Yes | By permission | No | No | Yes | Funding scope | No default | No |
| Claims/loss/issues | Yes | Assigned | Operational scope | Report own | Financial impact | If relevant | Approved summary only | Own claim/task only |
| Buyer-published shipment | Yes | Manage | Cannot publish unless permitted | No | View summary | If agreed | Yes | No default |

This matrix is a baseline. Admin configures access within fixed platform security boundaries; Admin cannot create a data path that bypasses RLS.

## 13.4 RLS and server authorization

- Enforce access in database RLS plus backend authorization; do not rely on frontend menu hiding.
- Every query/mutation resolves authenticated user, active account, role, project membership, partner scope, record ownership, and permission.
- Use least privilege; no client-side database owner/service secret.
- No public bucket by default. Documents use short-lived signed URLs and publication records.
- Tenant model is single company, but partner identity and project scopes remain isolated.
- Validate positive and negative access using real authenticated JWT sessions.
- Consider FORCE ROW LEVEL SECURITY after verifying owner/admin/migration paths and application requirements.
- Audit every role change, permission change, export, publication, approval, and sensitive read where required.

## 13.5 Segregation of duties

- Requester should not approve own high-value payment.
- Cashier executes only approved payments and does not independently reconcile.
- Accountant reconciles and posts under authority; high-risk journal adjustments require approval.
- Document preparer and document reviewer can be separated.
- Buyer publication requires authorized role and approved data status.
- Emergency override is allowed only under written policy with reason and audit trail.

---

# 14. Portal buyer, supplier, vendor, dan field operations

## 14.1 Buyer Command Center

Buyer portal is read-only by default. It shows:

- contract and project summary;
- target, procured/received quantity if published, packed/stuffed quantity, loaded/on-board quantity, remaining balance;
- verified operational milestones and timestamp;
- shipment/vessel/ETA/ATD and AIS last update;
- status of documents agreed for sharing;
- claim/issue updates explicitly approved for buyer;
- payment milestone status only to the extent relevant to buyer;
- downloadable approved shared documents;
- report history and communication channel.

Buyer must not see internal purchase price, supplier commercial terms, truck driver personal data, internal cash requests, overhead, funder details, internal loss investigation, margin/profit, or unverified notes by default. Any exception requires explicit contract/policy publication.

## 14.2 Supplier/PKS portal

PKS sees only its own:
- contract/call-off and supply target;
- schedule and quantity allocation;
- dispatch/receipts relevant to its goods;
- own COA/quality deviations;
- weighbridge/purchase quantity evidence shared with it;
- claims/acceptance and payment status;
- outstanding obligations and report requests.

PKS does not see other supplier identity, other PKS prices/quantities, exporter buyer price, total project costs or margin.

## 14.3 Transporter/vendor portal

Transporter sees fleet/trips assigned to it, trip instructions, proof of delivery, verified tonnage, invoice/rate agreement, rejected entries requiring correction, and payment status for its own invoices.

Warehouse, packing, loading, labor, fumigation, surveyor, PPJK, and ship agent users see their assigned work packages, schedules, requested documents, performance evidence, and settlement status within their contract scope.

## 14.4 Field Operations mobile UX

Preserve v4.1 strengths:
- one main action on landing screen per field role;
- quick truck/receipt/loading/packing entry;
- camera-first photo capture with deferred classification if useful;
- auto-fill from master vehicle/vendor data;
- QR/lot/container/job scanning;
- offline IndexedDB queue and idempotent sync;
- input validation, unit conversion and visible error messages;
- show original event time and later sync time separately;
- GPS only where necessary, with clear access and retention rules.

Mobile must work with slow networks and must not require AI calls for each operational event. The basic transaction flow remains usable when Gemini or external APIs are unavailable.

---

# 15. Reporting, dashboards, and Business Intelligence

## 15.1 Reporting audiences

| Report | Audience | Frequency/trigger |
|---|---|---|
| Buyer shipment progress | Buyer | On-demand/daily/milestone |
| Contract fulfillment | Buyer, PM, management | Daily/weekly |
| PKS delivery | PKS/procurement/PM | Per dispatch/daily |
| Truck movement | Transport manager/transporter | Per trip/daily |
| Warehouse stock | Warehouse/PM/finance | Per shift/daily |
| Packing production | Supervisor/vendor/PM | Per shift |
| Vessel loading/laytime | PM/loading manager/buyer when shared | Per shift/milestone |
| Export document status | Document officer/PM/buyer by share policy | Event-driven |
| Cash position & obligation | Finance/PM/funder subset | Daily |
| RAB vs actual & cost forecast | Finance/PM/management | Weekly/event-driven |
| FX risk report | Finance/management | Rate movement/daily |
| Supplier performance | Procurement/management | Per project/monthly |
| Project P&L/settlement | Finance/management/funder subset | Period-end/closeout |
| Loss/claim report | PM/quality/management | Each incident |

## 15.2 Dashboard families

**Admin Control Tower:** active contracts/projects, project health, all-company critical alerts, user/role assignments, workflow template versions, configuration changes, report delivery status, audit review.

**Project Manager Dashboard:** project schedule, quantity balance, tasks/approvals, source/route status, cash readiness, budget variance, compliance status, FX risk, loading/vessel schedule, unresolved issues.

**Finance Dashboard:** currency balances, cash forecast, AP/AR ageing, cash obligations by date, committed vs actual costs, funder utilization, FX exposures, projected final cost and margin.

**Compliance Dashboard:** rule/source version, required docs, open verification, expiry alerts, PEB status and destination conditions.

**Operations Dashboard:** trips, tonnage, inventory, packing, loading rates, downtime, task completeness, exceptions.

**Buyer Dashboard:** contract progress and approved shipment/document/vessel data.

**Supplier/Vendor Dashboard:** assigned deliveries/tasks, own performance, evidences and payment status.

## 15.3 Reporting and visualization rules

- All KPI values link to underlying verified records.
- Distinguish plan, forecast, actual, approved, and estimated values.
- Display unit, currency, source timestamp, and freshness.
- Buyer dashboard uses a separate publication model/view, not direct select from internal operational tables.
- Scheduled reports render a snapshot with report version and generation time.
- AI may write executive narrative, but it cannot invent/mutate chart values or hide anomalies.

## 15.4 Business Intelligence

Cross-project metrics after data normalization:

- cost, revenue, margin and working capital per MT;
- sourcing mix and PKS quality consistency;
- supplier reliability and rejection rate;
- route and port productivity;
- truck productivity and waiting time;
- warehouse dwell time and stock aging;
- packing conversion and packaging loss;
- loading rate and downtime;
- FX sensitivity and realized/unrealized FX;
- buyer payment behavior and collection cycle;
- commodity/country/Incoterms profitability;
- claim, loss and dispute frequency.

Comparisons must account for product grade, currency/date, volume, delivery method, port, contract terms, and measurement methodology. Do not rank PKS or vendors from incomparable projects without normalization.

---

# 16. Gemini AI architecture and use cases

## 16.1 Decision: paid tier for production

Gemini paid tier is selected for production AI processing. Development/testing may use a separate project and synthetic/non-confidential data. Production key belongs only in backend secret storage.

Google's published Gemini API paid-service terms state that prompts/files/responses in Paid Services are not used to improve Google products; they may be logged for a limited period for abuse/security and legal obligations. Paid tier is therefore preferable for commercial contract and financial data, but it must not be described as zero-retention or as a substitute for an internal privacy/security assessment. Review Google's Data Processing Addendum, applicable region/data transfer, retention and organizational policy before launch.

## 16.2 Model routing baseline (verify at deployment)

Model availability changes. Based on official model catalogue checked on 1 November 2026, candidate stable models are:

| Model ID | Recommended workload | Notes |
|---|---|---|
| `gemini-4-argon` | Highest-complexity analysis, cross-document reasoning, project scenario review | Use selectively; high-value reasoning only |
| `gemini-3.8-flash` | Main operational assistant, report reasoning, multi-step summaries, tool-using workflows | Default general-purpose AI candidate |
| `gemini-3.5-flash-lite` | High-volume classification, simple extraction, routine summaries | Use after extraction/quality benchmark |
| `gemini-embedding-2` | Multimodal semantic search/RAG over text, PDF, images and other supported modalities | Embedding model, not a chat model; vector dimensions and index version must be fixed per embedding space |

The exact IDs are configuration, not hard-coded throughout the app. Model selection must be tested against a PKE benchmark set covering Indonesian/English/Chinese business documents, tables, scanned PDFs, numeric extraction, instruction following, latency, token cost, and error rate.

## 16.3 Model routing policy

- Lite: simple category detection, metadata extraction, duplicate candidate detection, standard report labeling.
- Flash: operational report drafting, COA/invoice extraction after quality checks, project Q&A with RAG, explanation of rule-engine findings, supplier/customer report narration.
- Argon: complex multi-document contract analysis, multi-source procurement optimization explanation, financial risk synthesis, complex compliance cross-check, management deep-dive.
- Embedding 2: knowledge retrieval and similarity, not direct decision-making.

Use prompt versioning, schema validation, retry policy, token budget, max output, timeout, and fallback model per task. Never rely on model display names; use exact model IDs from the official catalogue at deployment and pin stable releases.

## 16.4 Gemini-enhanced modules

| Module | AI capability | Deterministic source of truth | Human checkpoint |
|---|---|---|---|
| Project Configurator | Extract contract clauses, draft workflow/RAB/doc checklist | Contract fields, templates, rule engine, calculation engine | Admin reviews and activates |
| Cash Obligation | Suggest cash/credit classification from vendor terms; explain cash gap | Vendor agreement, trigger rules, treasury forecast | Finance confirms policy |
| Finance | Explain budget variance, P&L changes, root cause hypotheses | Double-entry ledger, cost engine, AP/AR | Finance/controller review |
| FX | Explain exposure and scenario sensitivity | FX observation, actual transaction rate, net exposure formulas | Finance approves response |
| Compliance | Find/summarize regulations; compare effective dates and clauses | Approved official sources/rules | Compliance officer verifies |
| Document Intelligence | Classify, extract, compare invoice/PL/COA/B/L/certificates | Original file, metadata, deterministic cross-field validation | Officer verifies critical data |
| PKS sourcing | Explain recommended source mix | Capacity commitments, stock, quality results, optimization constraints | Procurement/PM selects |
| QC | Compare COA to contract/regulatory attributes | Spec comparison formula and verified lab result | QC/quality officer releases/holds |
| Transport | Summarize delays and route exceptions | Dispatch/trip timestamps and route records | Operations confirms |
| Warehouse | Identify inventory mismatch patterns | Inventory ledger and stock counts | Warehouse manager investigates |
| Loading | Explain low throughput/downtime | Loading event times, quantity, equipment logs | Loading manager validates |
| Loss/claim | Cluster causes and summarize evidence | Measurement records, approved tolerances, claims ledger | PM/quality/finance decide |
| Buyer portal | Answer shipment questions with approved data only | Buyer-publication views | No authority to publish hidden data |
| Supplier portal | Explain own deliveries, tasks, and payment status | Supplier-specific records | Supplier/PM resolves exceptions |
| Executive BI | Narrative insights across periods | Verified analytics warehouse/views | Management decides |

## 16.5 AI Orchestrator

A single backend service controls all Gemini calls:

1. Authenticate user and resolve their permissions.
2. Identify task, project, entity scope, data sensitivity, and AI policy.
3. Retrieve only authorized data using approved query functions.
4. Build minimum necessary context and retrieve knowledge sources (RAG).
5. Select model and prompt version.
6. Invoke Gemini with structured output/function tools as applicable.
7. Validate JSON schema, source citations, numeric claims, and policy constraints.
8. If a function call is requested, authorize and execute it server-side with the same user's scope.
9. Save AI run metadata, inputs/outputs according to retention policy, and human feedback.
10. Return a draft/insight; require human approval for critical action.

## 16.6 Function calling catalogue

Read-only tools:
- `get_project_summary`
- `get_contract_details`
- `get_supplier_capacity`
- `compare_supplier_quality`
- `get_inventory_status`
- `get_truck_movements`
- `get_loading_performance`
- `get_vessel_status`
- `get_missing_documents`
- `search_export_regulations`
- `get_project_cashflow`
- `get_fx_exposure`
- `simulate_fx_scenario`
- `get_project_profitability`
- `get_supplier_performance`
- `get_project_risk_report`

Draft tools:
- `generate_buyer_report_draft`
- `generate_supplier_report_draft`
- `create_task_draft`
- `create_payment_request_draft`
- `create_document_checklist_draft`

No direct tool for Gemini to execute/approve payments, post journals, alter permissions/RLS, issue legal documents, release shipment, or close project. Human-controlled backend action is mandatory.

## 16.7 RAG knowledge base

Source collections:
- official Indonesian regulations and customs/quarantine guidance;
- official destination-country rules and SPS/TBT notices;
- internal SOP and approved policy;
- buyer/supplier contracts where access permits;
- standard document templates and examples;
- historical project lessons and anonymized performance metrics;
- product and quality specifications.

Use `gemini-embedding-2` or the selected stable embedding model plus PostgreSQL/pgvector or an approved vector service. Keep metadata filters on country, commodity, HS version, effective date, document type, project scope, and confidentiality. Embeddings from different model versions/dimensions must not be mixed without migration/re-embedding.

RAG results must preserve source, page/article/section, effective date, verification state, and access control. Regulatory answer must cite primary source, not just embedding snippets.

## 16.8 AI guardrails and validation

- No financial write/approval/execution by model.
- No self-issued regulatory classification or compliance clearance.
- No automatic acceptance/rejection of quality based only on natural language reasoning.
- No publication of internal data to buyer or supplier from AI response unless publication layer allows it.
- No user-supplied document instructions can override system prompts or application authorization.
- Treat uploaded documents and webpages as untrusted content; resist prompt injection.
- Validate numeric results using code/database functions.
- Require sources for legal/current claims; show “not verified” where source is missing or stale.
- Record model/version/prompt/schema/source IDs and AI output provenance.
- Provide feedback (accept, edit, reject, incorrect data, unsupported conclusion).
- Define retention/deletion rules for prompt logs, file copies, embeddings, and outputs.

## 16.9 AI usage and budget management

Google rate limits are tied to the Google Cloud project, not multiplied by creating several API keys. Five keys in one project do not produce five times the quota. Use separate Google Cloud projects for development/staging/production where appropriate, for access separation and environment control; manage quotas/billing per project.

Recommended key plan:
- development key/project;
- staging key/project;
- production key/project;
- break-glass/rotation reserve only if the operational process requires it.

Do not design five keys as quota multiplication. Restrict keys, store them in server secret management (e.g. Google Cloud Secret Manager), never expose them in React/Vite client bundles or repository. Rotate/revoke keys with an audit process.

AI usage dashboard:
- input/output tokens by model, endpoint, module, project, user, and date;
- request count/latency/error and 429 count;
- grounding requests and cost;
- context cache and batch use;
- estimated/actual billing, budget threshold and daily/monthly caps;
- per-feature quota and graceful fallback if Gemini is unavailable.

Cost optimization:
- call AI only on events requiring analysis or user request;
- use Lite for simple tasks, Flash for operations, Argon only for complex analysis;
- batch non-urgent historical analysis;
- cache approved stable knowledge/prompt context where supported;
- trim context to minimum authorized data;
- keep calculations in deterministic engine;
- never call Gemini once for every truck/weight event if normal validation rules can process it.

## 16.10 Paid tier and privacy decision

Production AI must use Paid Services with linked billing account. Google's published terms indicate paid prompts/responses are not used to improve Google products, but limited safety/security/legal logging can still occur. Paid tier is not a guarantee of zero retention or that all data residency requirements are automatically satisfied. Review Google DPA and terms, configure data minimization, and do not send bank account numbers, personal ID, credentials, secrets, or unnecessary personal information to Gemini.

---

# 17. API eksternal dan integrasi

All external APIs must be wrapped through provider adapters so the system can replace a source without changing core business modules.

| Integration | Purpose | Data/trigger | Notes |
|---|---|---|---|
| Gemini API | LLM reasoning/extraction/RAG/tool calls | User request/event | Paid tier, backend-only, budget/rate management |
| Google Search Grounding | Current web research | Compliance research request | Not every operation; paid quota/cost applies |
| URL Context / Files | Analyze public source URLs and uploaded references | Document/compliance task | Verify source authenticity and allowed file types |
| Bank Indonesia rates | JISDOR and reference rates | Daily scheduled job | JISDOR is daily benchmark, not live intraday quote |
| Authorized bank FX API | Actual/indicative bank rates | Rate inquiry/transaction | Requires bank authorization/credentials |
| AIS provider | Vessel position/speed/course/destination | Scheduled/poll or webhook | Provider commercial limits and coverage apply |
| Routing/geocoding provider | Distance/ETA/route | Project planning/trip | Distinguish route estimate from actual trip |
| Weather provider | Rain/wind/port weather alerts | Location/time window | Advisory; not substitute for port/agent notice |
| Official export/regulatory sources | Regulation, customs/quarantine guidance | Compliance update | Prefer official API/download; do not assume every portal has public API |
| Customs/INSW/INATRADE | Customs and export process | Authorized integration | Only if approved API/partner access exists |
| Email provider | Invitations/reports/alerts | Scheduled/event | SPF/DKIM/DMARC and delivery logs |
| Storage provider | Evidence/document files | Upload/download | Private buckets, signed links, versioning |

## 17.1 AIS semantics

AIS position is a location signal, not proof of legal arrival, berthing, start/end loading, or departure. Operational milestones require port/agent/surveyor confirmation or authoritative documents. Display provider, position timestamp, and last refresh status.

## 17.2 FX semantics

JISDOR and other reference rates are market benchmarks, not necessarily the rate applied by the user's bank. Store the rate type and source. Actual FX conversion must use actual bank statement/confirmation or permitted API record.

## 17.3 Provider outage handling

- retries/backoff and circuit breaker;
- cached last good value marked stale;
- alert operations/admin when provider is down;
- no false live status;
- manual verified override with source and reason;
- preserve raw provider response metadata where permitted.

---

# 18. Arsitektur teknis dan logical data model

## 18.1 Application layers

```text
WEB / MOBILE PWA
  ├── Admin Control Tower
  ├── PM / Finance / Operations Workspaces
  ├── Buyer Portal
  ├── Supplier & Vendor Portal
  └── Field Operations UI
          │
          ▼
APPLICATION API / BACKEND SERVICES
  ├── Auth & Access Service
  ├── Project & Workflow Service
  ├── Operational Transaction Service
  ├── Finance & Accounting Service
  ├── Document & Compliance Service
  ├── Reporting Service
  ├── External Provider Adapters
  └── Gemini AI Orchestrator
          │
          ▼
POSTGRESQL + RLS / OBJECT STORAGE / JOB QUEUE
  ├── Master & Reference Data
  ├── Contracts & Projects
  ├── Workflows & Events
  ├── Inventory & Logistics
  ├── Documents & Evidence Metadata
  ├── Accounting & FX Ledger
  ├── AI/Knowledge/Usage Metadata
  ├── Reports & Audit
  └── Private Object Storage
```

## 18.2 Stack baseline

Baseline warisan v4.1:
- React + Vite + TypeScript;
- Tailwind CSS and responsive UI;
- Neon PostgreSQL and RLS;
- Neon Auth/Better Auth integration;
- Neon Object Storage (or approved private object storage);
- Neon Functions/backend API and scheduled jobs;
- Vercel frontend deployment;
- email/report delivery provider.

Before development, run a short architecture decision record (ADR) to confirm whether to retain Neon or intentionally migrate to Supabase. Evaluate RLS semantics, Auth integration, Storage private object access, functions/jobs, backups, regional deployment, pooling, cost, observability, SDK maturity, developer workflow, and migration effort. One authoritative database/auth system must be selected.

## 18.3 Logical data domains and proposed entity catalog

Final table names, keys, constraints, normalization, indexes, partitioning, and migration order are to be designed after this document is approved. This list is the logical entity inventory, not executable SQL.

### A. Identity, access, and configuration

- `users`, `user_profiles`, `user_invites`, `user_sessions` (or provider-managed equivalent);
- `company_profile`, `company_settings`;
- `project_members`, `partner_accounts`, `partner_members`;
- `role_catalog`, `permissions`, `role_permissions`, `member_roles`;
- `record_access_scopes`, `feature_catalog`, `project_feature_flags`;
- `workflow_templates`, `workflow_template_versions`, `project_workflows`, `workflow_nodes`, `workflow_edges`, `workflow_instances`, `workflow_events`, `approval_rules`, `approval_tasks`.

### B. Commercial/contracts

- `buyers`, `buyer_parties`, `importers`, `consignees`, `notify_parties`;
- `contracts`, `contract_versions`, `contract_products`, `contract_quality_specs`, `contract_payment_terms`, `payment_milestones`, `contract_document_clauses`, `contract_amendments`;
- `supplier_contracts`, `purchase_orders`, `purchase_order_lines`, `supplier_allocations`, `procurement_receipts`.

### C. Master data

- `commodities`, `products`, `product_grades`, `product_attributes`, `product_spec_profiles`, `product_spec_limits`, `units_of_measure`;
- `suppliers`, `pks_sites`, `pks_capacities`, `pks_production_forecasts`, `pks_stock_snapshots`, `pks_certificates`, `lab_results`, `laboratories`;
- `warehouses`, `warehouse_areas`, `ports`, `terminals`, `berths`, `port_facilities`;
- `vessels`, `vessel_holds`, `voyages`, `port_calls`, `containers`, `container_types`;
- `transporters`, `vehicles`, `drivers`, `vehicle_documents`, `driver_qualifications`, `routes`, `route_legs`;
- `service_vendors`, `surveyors`, `fumigators`, `ppjk_providers`, `ship_agents`, `stevedores`, `labor_vendors`;
- `equipment`, `equipment_rates`, `vendor_rate_cards`, `cost_categories`.

### D. Project and operations

- `projects`, `project_versions`, `project_config_snapshots`, `project_allocations`, `project_work_packages`;
- `shipments`, `shipment_lines`, `shipment_allocations`, `shipment_sources`, `shipment_routes`;
- `lots`, `lot_origins`, `lot_quality_results`, `lot_genealogy`, `inventory_locations`, `inventory_movements`, `inventory_balances`, `stock_reservations`, `stock_counts`, `stock_adjustments`;
- `truck_trips`, `truck_trip_events`, `weighbridge_tickets`, `goods_receipts`, `warehouse_receipts`;
- `packing_batches`, `packing_outputs`, `packaging_material_issues`, `container_stuffings`, `container_events`, `container_inspections`, `seals`;
- `loading_operations`, `loading_shifts`, `loading_logs`, `loading_holds`, `equipment_usage`, `downtime_events`, `draft_surveys`, `vessel_events`, `ais_observations`;
- `quality_inspections`, `samples`, `lab_reports`, `quality_deviations`, `claims`, `quantity_measurements`, `quantity_loss_events`, `problem_reports`.

### E. Documents and compliance

- `document_types`, `documents`, `document_versions`, `document_links`, `document_shares`, `document_checklists`, `document_requirement_instances`, `document_reviews`;
- `regulatory_sources`, `regulations`, `regulation_versions`, `regulation_articles`, `hs_catalog_versions`, `regulatory_rules`, `regulatory_assessments`, `compliance_reviews`;
- `country_requirements`, `destination_import_requirements`, `buyer_document_profiles`, `certificate_registry`, `expiry_alerts`.

### F. Finance and accounting

- `currencies`, `fx_rate_providers`, `fx_rate_observations`, `project_currency_profiles`, `project_fx_baselines`, `fx_transaction_rates`, `fx_exposures`, `fx_scenarios`, `fx_alerts`, `fx_hedge_positions`;
- `chart_of_accounts`, `fiscal_periods`, `journals`, `journal_lines`, `accounting_postings`, `cost_centers`, `project_cost_allocations`;
- `budgets`, `budget_versions`, `budget_lines`, `cost_commitments`, `expense_accruals`;
- `cash_obligation_rules`, `cash_obligations`, `cash_forecasts`, `payment_requests`, `payment_approvals`, `cash_advances`, `advance_settlements`;
- `vendor_bills`, `ap_invoices`, `ap_invoice_lines`, `ar_invoices`, `ar_invoice_lines`, `receipts`, `disbursements`, `bank_accounts`, `bank_transactions`, `bank_reconciliations`;
- `funding_parties`, `funding_facilities`, `funding_drawdowns`, `funding_repayments`, `financing_costs`, `project_settlements`, `accounting_period_closes`.

### G. Reporting, notifications, AI, and audit

- `report_templates`, `report_sections`, `report_subscriptions`, `report_deliveries`, `report_snapshots`, `dashboard_configs`, `dashboard_widgets`;
- `tasks`, `task_assignments`, `task_evidence`, `task_verifications`, `notifications`, `notification_deliveries`, `messages`;
- `ai_model_registry`, `ai_model_routing_rules`, `ai_prompt_templates`, `ai_prompt_versions`, `ai_function_catalog`, `ai_function_execution_logs`, `ai_conversations`, `ai_usage_events`, `ai_budget_policies`, `ai_knowledge_sources`, `ai_knowledge_chunks`, `ai_embeddings`, `ai_analysis_reports`, `ai_risk_insights`, `ai_feedback`;
- `audit_logs`, `security_events`, `data_exports`, `integration_jobs`, `integration_logs`, `webhook_events`.

## 18.4 Data conventions

- UUID primary keys; stable external codes and human-readable references.
- `NUMERIC` for quantities, rates, currency amounts, percentages; avoid floating-point for financial/quantity transactions.
- Store unit and currency explicitly; never infer from screen format.
- Store original timezone-aware event timestamp, local operational date/time zone, source timestamp, and sync timestamp where relevant.
- Foreign keys, uniqueness, check constraints, idempotency keys, and transaction boundaries at database level.
- Soft delete only for master records where appropriate; transactions/documents use cancellation/reversal/superseding events rather than destructive deletion.
- All money lines preserve original currency amount, applied exchange rate, rate type/source, and functional-currency amount.
- Store raw document checksum and version so duplicate/tampered files can be detected.

## 18.5 Project configuration snapshots

Activation freezes a versioned snapshot of:
- contract/payment terms;
- commodity/quality requirements;
- selected sources and supplier terms;
- workflow and approvals;
- cost catalog/RAB/cash obligations;
- currency baseline and FX policy;
- compliance assessment and document rules;
- role/permission/visibility settings;
- reporting templates and milestones.

Change requires a new revision, reason, approver, effective date, and impact assessment. Historical transactions retain the configuration/version that applied at their time.

---

# 19. Security, privacy, audit, and governance

## 19.1 Data classification

Recommended classes:

- **Public/shareable:** approved public product/company information.
- **Partner-shared:** buyer/supplier/vendor documents or project status expressly shared.
- **Internal operational:** trips, checker reports, stock, task evidence, operational issues.
- **Confidential commercial:** purchase/sale price, vendor terms, RAB, margin, funder agreements.
- **Restricted financial/personal/security:** bank credentials/details, personal identity, secrets, payroll, authentication tokens, API keys.

Each table/field/file receives a class and retention policy.

## 19.2 Secrets and API keys

- Gemini, bank, AIS, email, and external credentials reside in server-side secret manager/environment secrets.
- Never commit to source control or expose as `VITE_*` client variables.
- Production, staging, development projects/keys separate; key restriction and rotation documented.
- Admin cannot view full secrets after creation; show masked metadata only.
- Suspected leak triggers revoke/rotate, provider audit, and incident report.

## 19.3 Object storage and documents

- Private buckets by default.
- Signed links expire quickly and are scoped to identity/share record.
- Buyer/supplier document sharing is explicit, revocable, and logged.
- Malware/file-type/size validation, checksum, retention, backup and legal hold policies.
- Do not send unnecessary PII or confidential financial attachments to AI; redaction/minimization before request.

## 19.4 Audit and immutable financial controls

Audit events include user, role, project, action, target record, before/after values for authorized changes, reason, source IP/device metadata if policy permits, timestamp, request id, approval reference, and system/AI actor flag. Financial ledger corrections should be reversal/adjustment, not silent overwrite. Keep AI-generated drafts separate from approved business facts.

## 19.5 Backup, recovery, and operational continuity

- Defined RPO/RTO targets approved by management.
- Automated database and object storage backups; restore test schedule.
- Disaster recovery runbook.
- External API outage handling.
- Basic work processes usable without AI/AIS/FX provider when external service is down.
- Queue reconciliation and duplicate prevention for offline events.

---

# 20. Non-functional requirements

| Category | Requirement |
|---|---|
| Security | DB RLS + backend authorization; least privilege; secret management; MFA policy; audit |
| Availability | Graceful degradation when Gemini/AIS/FX/other providers fail |
| Performance | Pagination, indexing, background jobs, async document processing, cached aggregates |
| Scalability | Large project history, many events/files, multi-commodity reference data |
| Accuracy | Decimal math, validated units, source/timestamp provenance, reconciled ledgers |
| Usability | Bahasa Indonesia first; English support; possible Chinese buyer language by profile |
| Mobile | Mobile-first field forms, photo upload, offline queue, retry and idempotency |
| Accessibility | Clear labels, consistent status, legible number/currency display, keyboard support |
| Auditability | Traceable changes, approvals, report snapshots, model/prompt provenance |
| Interoperability | CSV/Excel/PDF exports and documented API/webhook design where appropriate |
| Maintainability | Modular backend, schema migrations, versioned rules/templates, automated tests |
| Observability | Structured logs, metrics, traces, alerts for provider failures and data freshness |

---

# 21. Tahapan implementasi

Urutan ini menurunkan risiko perubahan arsitektur dan memisahkan fondasi dari kecanggihan AI.

## Phase 0 — Architecture lock & discovery

- Audit source repository, existing Neon branch/database, Auth, RLS, Storage, frontend, and deployment.
- Confirm Neon vs Supabase; choose one source of truth.
- Confirm accounting policy, functional currency, chart of accounts, project settlement rules.
- Confirm commodity scope and initial PKE use cases.
- Select pilot buyer contract, PKS, port, transport method, and target shipment type.
- Establish regulatory research owner and external API access requirements.
- Create architecture decision records and acceptance benchmarks.

**Exit:** approved architecture decision, current implementation inventory, approved scope and pilot scenarios.

## Phase 1 — Security and core master data

- Auth and admin-only user provisioning.
- Project membership/partner membership and permission catalog.
- RLS, backend authorization, security tests.
- Buyer, supplier, PKS, product/spec, vendor, truck/driver, warehouse, port, vessel, service provider masters.
- Document/certificate registry foundation.

**Exit:** end-to-end JWT tests pass for admin, PM, buyer, supplier, vendor, disabled user and anonymous user.

## Phase 2 — Contract and dynamic project configurator

- Buyer/supplier contract and amendments.
- Commodity and quality specification profile.
- Project wizard and config snapshots.
- Workflow builder, project roles, feature flags, reporting visibility.
- Payment milestone builder and operational task assignments.

**Exit:** all pilot project scenarios can be configured without changing code or SQL for each new project.

## Phase 3 — Procurement, operations, inventory, traceability

- PKS sourcing/capacity, purchase calls, truck/route, weighbridge.
- Warehouse receipt and inventory ledger.
- Lots and genealogy.
- Packing/stuffing/container or bulk handling.
- Port/vessel/loading events and downtime.
- Quantity reconciliation and claims.

**Exit:** goods traceability and quantity reconciliation pass scenarios A-F.

## Phase 4 — Finance, full accounting, and FX

- RAB versioning and cost commitments.
- Cash obligations and Cash Readiness Gate.
- AP/AR, cash/bank, advances, funder.
- Journal/GL and financial reports.
- Multi-currency transaction model, baseline/reference/actual rates.
- FX exposure, scenario, alerts, and gain/loss entries.

**Exit:** sample project can be reconciled from budget through journal, cash, AP/AR, FX and final project P&L.

## Phase 5 — Export compliance and document intelligence foundation

- Regulation/source registry and HS versioning.
- Rule engine and human review UI.
- Document requirements/checklist and expiry alerts.
- PEB/customs/quarantine milestone tracking.
- File extraction and document matching without auto-approval.

**Exit:** pilot country/product/route requirements verified by designated compliance reviewer.

## Phase 6 — Stakeholder portals and reporting

- Buyer Command Center and explicit publication model.
- PKS/supplier/transporter/vendor portals.
- Field PWA, offline sync, QR/lot/container scan.
- Report Center, schedules, report snapshots and distribution logs.

**Exit:** stakeholder-specific access tests pass and sample daily reports reconcile with database records.

## Phase 7 — Gemini AI Orchestrator and RAG

- Paid Gemini project/billing and secret manager.
- Model registry/routing, usage telemetry, prompt registry.
- Document extraction and structured output.
- RAG and source-grounded compliance assistance.
- Function calling with scoped read tools and draft tools.
- AI report narrative and daily Project Watchdog.
- Human feedback and model benchmark tests.

**Exit:** AI benchmark meets agreed extraction/grounding/security/latency/cost criteria; no critical AI action can bypass human approval.

## Phase 8 — External APIs, forecasting and advanced BI

- BI JISDOR and approved FX sources.
- AIS provider and port/agent event reconciliation.
- Route/geocoding/weather provider if justified.
- Supplier/route/port optimization.
- Historical forecasting and multi-project BI.
- Cost optimization and stress testing.

**Exit:** integrations have contracts, error handling, freshness monitoring, and business owners.

## Phase 9 — Production readiness

- Load/performance/security testing.
- RLS negative tests and penetration/security review.
- Financial reconciliation and audit review.
- Disaster recovery test.
- Operational training and SOP.
- Production rollout with measured pilot and controlled expansion.

---

# 22. Acceptance criteria dan skenario uji

## 22.1 Mandatory business scenarios

1. **One PKS, one warehouse, bulk direct to vessel:** no packing stage; truck and direct loading evidence; port/vessel times and tonnage reconciled.
2. **Three PKS, one warehouse, bagged container:** separate lot traceability; packing batch, bag counts, container/seal, gate-in and on-board events.
3. **Two PKS, no warehouse, bulk conveyor loading:** route bypasses warehouse; cash obligations and conveyor capacity are checked; loading rate/downtime recorded.
4. **Multiple PKS, multiple ports, two vessels:** multi-source, multi-route, multi-shipment, allocation, port call, voyage, and cost split work correctly.
5. **Funder + cash PKS + transport + labor + export documents:** funding drawdown, cash obligation triggers, approvals, disbursements, advance settlement and project P&L reconcile.
6. **Buyer milestone payment:** payment triggers from verified events and documents; partial payments and receivable ageing supported.
7. **USD contract with IDR costs, baseline Rp18,000/USD:** baseline locked; market rate movement recalculates exposure sensitivity; actual bank rate posts actual conversion; alert based on financial impact, not currency direction alone.
8. **Country-specific compliance:** correct product/HS/origin/destination/mode inputs create a checklist with source, effective date, requirement class and human verification.
9. **Document conflict:** invoice/packing list/COA/B/L mismatched data is flagged; no legal release solely based on AI.
10. **Buyer data isolation:** buyer A cannot view buyer B or confidential procurement/financial records; only explicitly published records are accessible.
11. **Supplier isolation:** PKS A and transporter A can only access their own contract/assigned activity/invoices.
12. **RLS and API failure:** unauthenticated/inactive user rejected; AI/AIS/FX API down does not corrupt project transaction or expose stale live data.
13. **Offline field submission:** offline truck/receipt entries sync exactly once, preserve event time and sync time, and conflicts require resolution.
14. **AI tool abuse:** uploaded document prompt injection cannot change permissions or invoke payment; Gemini function call is rejected if user lacks permission.
15. **Project amendment:** workflow, currency, RAB, or docs change creates new version and does not rewrite prior approved facts.

## 22.2 Numeric/accounting tests

- Gross minus tare equals net in correct unit and precision.
- Quantity conversion and rounding follow approved unit policy.
- Lot opening + receipts - issues +/- adjustments = closing stock.
- All journal entries balance.
- AP/AR subledger totals reconcile with GL control accounts.
- Cash balance reconciles with payments/receipts/transfer/advance settlements.
- Transaction currency and applied FX rate reproduce booked functional amount.
- Realized and unrealized FX are separated according to accounting policy.
- Budget variance = comparable actual/committed/forecast minus approved budget.
- Project profit and cost-per-MT reconcile to approved accounting view.

## 22.3 Security tests

- JWT role/scope enforcement on every critical table and API.
- Admin role assignment cannot be self-granted by normal users.
- Buyer publication is explicit and revocable.
- File signed URLs expire and cannot be used outside authorized scope.
- Vendor/partner IDs cannot be changed by client to access another partner's records.
- No API key, DB owner credential, service secret, or bank credential appears in frontend bundle/logs.
- All payment approval, execution, journal posting, compliance finalization and user/role changes create audit events.

## 22.4 AI quality tests

- Invoice/packing list/COA extraction exactness on a labeled sample dataset.
- Numeric/table extraction accuracy and confidence threshold.
- Legal source citation completeness and effective-date correctness.
- Hallucination tests using deliberately missing/contradictory documents.
- Tool calls obey role/record scope.
- JSON schema validation and malformed output recovery.
- Cost, latency, rate limit, 429, timeout, and provider outage fallback.
- Prompt injection and malicious document content tests.
- Buyer/supplier reports contain no data outside published scope.
- Human review reject/edit feedback retained and used for prompt/evaluation improvement.

---

# 23. Keputusan yang masih perlu dikunci sebelum coding

Berikut bukan pertanyaan untuk mengubah keputusan produk yang sudah Anda buat, melainkan daftar hal yang memang belum mempunyai dasar cukup untuk ditentukan oleh dokumen ini.

| No. | Keputusan | Rekomendasi awal | Approver |
|---:|---|---|---|
| 1 | Database/Auth platform: Neon atau Supabase | Audit Neon v4.1 dulu; pertahankan jika stabil dan memenuhi kebutuhan. Jangan hybrid. | Owner/Admin + technical lead |
| 2 | Functional currency perusahaan | Kemungkinan IDR; konfirmasi akuntan/perusahaan | Finance/management |
| 3 | Currency reporting per project | Default contract currency + functional currency dual view | Finance |
| 4 | Accounting scope | Setujui chart of accounts, revenue/inventory/tax policy, period close | Accountant/management |
| 5 | Project definition | Satu project = satu paket pemenuhan kontrak/periode; shipment dapat banyak | Management/operations |
| 6 | HS classification and PKE levy | Verifikasi tariff line, effective date, levy basis, exemption | Compliance/customs/finance |
| 7 | Initial destination countries | Pilih negara pilot berdasarkan buyer nyata | Export/compliance |
| 8 | Cash obligation defaults | Jadikan template rekomendasi; final mengikuti vendor terms | Finance/procurement |
| 9 | Payment terms incl. 5:4:1 | Definisikan milestone secara eksplisit dari kontrak | Commercial/finance |
| 10 | Approval thresholds | Nilai/risk limit per expense, payment, journal, and override | Management/finance |
| 11 | FX risk tolerance | Rate move + cash gap + margin floor + max unhedged exposure | Finance/management |
| 12 | FX provider set | BI benchmark + actual bank execution source; intraday optional | Finance |
| 13 | AIS provider | Pilih setelah evaluasi coverage, pricing, terms, update rate | Operations/management |
| 14 | Buyer publication policy | Field/document whitelist per contract/project | Commercial/PM |
| 15 | Supplier portal rollout | PKS and main transporter first, then vendors | Procurement/operations |
| 16 | Gemini model and benchmark | Verify exact stable model IDs at implementation; benchmark task set | Technical lead/owner |
| 17 | Gemini budget | Define monthly spend limit, project/user quota and alert | Owner/finance |
| 18 | Data retention and DPA | Review Google DPA/terms, retention, residency and company policy | Security/legal |
| 19 | External system integrations | API access, contracts and credentials per provider | Technical lead |
| 20 | Statutory accounting boundary | Internal project ledger vs full statutory/ERP replacement | Finance/management |

## 23.1 Review sign-off sebelum implementasi

Checklist ini digunakan pada rapat review dokumen. Item yang belum disetujui tetap berstatus open dan tidak boleh dianggap sebagai spesifikasi implementasi final.

- [ ] Business owner menyetujui cakupan multi-komoditas dan PKE sebagai pilot.
- [ ] Management menyetujui definisi contract, project, shipment, lot, voyage, dan settlement.
- [ ] Operations menyetujui skenario workflow dan tanggung jawab lapangan.
- [ ] Finance/accounting menyetujui chart of accounts, functional currency, payment milestone, cash obligation, AP/AR, dan closing policy.
- [ ] Finance menyetujui FX baseline, sumber kurs, risk threshold, exposure method, dan approval response.
- [ ] Compliance/customs menyetujui sumber regulasi, HS validation process, dan initial destination-country checklist.
- [ ] Admin/management menyetujui role catalog, permission matrix, RLS scope, dan buyer/supplier publication policy.
- [ ] Technical owner menyetujui database/Auth/Storage/backend provider (Neon atau Supabase) dan deployment architecture.
- [ ] Security/privacy owner menyetujui Gemini paid service terms, DPA review, data minimization, retention, and secret management.
- [ ] Management menyetujui batas biaya Gemini, AI model routing, dan AI use cases untuk fase pertama.
- [ ] Project owner memilih proyek pilot dengan data/kontrak yang dapat dipakai untuk acceptance testing.
- [ ] Seluruh acceptance scenarios pada Bab 22 disetujui sebagai dasar UAT.

**Catatan persetujuan:** nama approver, tanggal, versi dokumen, komentar, dan daftar perubahan harus dicatat pada revision log saat review selesai.

---

# 24. Glosarium

- **PKE / PKM:** Palm Kernel Expeller / Palm Kernel Meal; product description and applicable tariff classification must be confirmed for each shipment.
- **PKS:** Pabrik Kelapa Sawit.
- **RAB:** Rencana Anggaran Biaya.
- **AP/AR:** Accounts Payable / Accounts Receivable.
- **PEB:** Pemberitahuan Ekspor Barang.
- **NPE:** Nota Pelayanan Ekspor.
- **COA:** Certificate of Analysis.
- **B/L:** Bill of Lading.
- **AIS:** Automatic Identification System for vessel tracking.
- **ETA/ETD:** Estimated Time of Arrival / Departure.
- **ATA/ATD:** Actual Time of Arrival / Departure.
- **NOR:** Notice of Readiness.
- **VGM:** Verified Gross Mass for containers where applicable.
- **RLS:** Row Level Security.
- **RAG:** Retrieval-Augmented Generation.
- **LLM:** Large Language Model.
- **FX:** Foreign Exchange / currency exchange.
- **Baseline FX:** project budget/contract reference rate, not necessarily a guaranteed execution or hedged rate.
- **Cash Obligation:** payment obligation tied to an operational or contractual trigger.
- **Cash Readiness Gate:** control to prevent/alert an activity when prerequisite funds are unavailable.
- **Project Closeout:** verified reconciliation of operations, documents, cash, accounting, claims, and buyer/supplier settlement.

---

# 25. Referensi dan sumber verifikasi

## 25.1 Dokumen internal yang menjadi bahan desain

1. `extracted_plan_v4.1.md` — PKE Export Platform Project Plan v4.1; snapshot implementasi 28 Oktober 2026 dan rancangan schema/workflow/dashboard.
2. `extracted_Verifikasi_Alur_Sistem_PKE.pdf` — Dokumen internal verifikasi alur sistem administrasi lapangan ekspor PKE, 8 Oktober 2026.
3. `extracted_plan-v3.1.md` — Plan historis v3.1; digunakan sebagai referensi evolusi rancangan, bukan sumber status implementasi terbaru.

## 25.2 Gemini API — sumber resmi Google

- Model catalogue: https://ai.google.dev/gemini-api/docs/models
- API pricing: https://ai.google.dev/gemini-api/docs/pricing
- Rate limits and usage tiers: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini API Paid Services terms: https://ai.google.dev/gemini-api/terms
- API key security: https://ai.google.dev/gemini-api/docs/api-key
- Function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Embeddings: https://ai.google.dev/gemini-api/docs/embeddings
- Gemini Embedding 2: https://ai.google.dev/gemini-api/docs/models/gemini-embedding-2
- Google Search Grounding: https://ai.google.dev/gemini-api/docs/google-search
- Batch API: https://ai.google.dev/gemini-api/docs/batch-api
- URL Context: https://ai.google.dev/gemini-api/docs/url-context

**Catatan:** nama model, versi endpoint, harga, kuota, dan fitur dapat berubah. Model yang tercantum di Bab 16 adalah snapshot katalog pada 1 November 2026 dan harus diverifikasi ulang saat implementasi.

## 25.3 Indonesia export, customs, and FX references

- Permendag No. 16 Tahun 2026 — JDIH Kementerian Perdagangan: https://jdih.kemendag.go.id/peraturan/peraturan-menteri-perdagangan-republik-indonesia-nomor-16-tahun-2026-tentang-kebijakan-dan-pengaturan-ekspor-komoditas-sumber-daya-alam-strategis-kelapa-sawit-1
- Status and effective date Permendag 16/2026 — Database Peraturan BPK: https://peraturan.bpk.go.id/Details/351555/permendag-no-16-tahun-2026
- Mandatory upload dokumen pelengkap PEB — Direktorat Jenderal Bea dan Cukai: https://onewebfile.beacukai.go.id/preview/mandatory-upload-dokap-peb
- PMK 155/PMK.04/2022 — Ketentuan Kepabeanan di Bidang Ekspor: https://peraturan.bpk.go.id/Home/Download/247836/155_PMK.04_2022.pdf
- PMK 9 Tahun 2026 — JDIH Kementerian Keuangan (summary): https://jdih.kemenkeu.go.id/dok/pmk-9-tahun-2026/summary
- JISDOR, Kurs Acuan non-USD/IDR, and Kurs Transaksi BI: https://www.bi.go.id/id/fungsi-utama/moneter/informasi-kurs/Default.aspx

## 25.4 Reference governance

- Prefer official laws/regulator sites and official published API documentation.
- Record date accessed, effective date, source file/hash, and reviewer on every regulatory rule.
- Revalidate laws, tarif/levies, HS classification, destination-country requirements, Gemini model availability, pricing, quota, and external API access before production deployment.
- Third-party summaries can aid research, but final compliance rules must cite primary/official sources and be reviewed by authorized personnel.

---

## Penutup

Dokumen v4.2 ini menetapkan arah produk dan arsitektur yang dapat menjadi dasar pembahasan terakhir sebelum pembuatan aplikasi. Dokumen ini belum mengunci DDL/SQL, seluruh detail formulir, tarif vendor, daftar dokumen wajib untuk semua negara, atau angka financial risk threshold. Hal-hal tersebut harus diturunkan dari kontrak nyata, kebijakan perusahaan, sumber regulasi yang berlaku, dan keputusan pemilik proses.

**Prinsip final platform:** data dan perhitungan berasal dari sistem yang tervalidasi; workflow menyesuaikan project; akses mengikuti tanggung jawab; Gemini mengubah data menjadi pemahaman dan rekomendasi; manusia yang berwenang menetapkan keputusan kritis; dan setiap tindakan meninggalkan jejak audit.
