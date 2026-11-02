# PKE Export Platform v4.2.2 — Implementation Plan Package

Paket revisi 1.1 ini memecah **Master System Architecture Review v4.2.2 Revision 02** menjadi 14 dokumen Markdown yang dapat direview dan diimplementasikan per domain. Paket juga memasukkan tambahan keputusan **Checkpoint-Based Truck Tracking & Geotagged Evidence System** setelah review v4.2.2.

## Urutan baca

1. `00_MASTER_IMPLEMENTATION_PLAN.md` — peta semua plan, urutan dependensi, gate dan aturan governance.
2. P01 — contract program, recurring project, konfigurasi Admin.
3. P02 — backend dan domain database Neon.
4. P03 — authentication, permission, role, RLS.
5. P04 — API dan integrasi eksternal.
6. P05 — Neon Buckets dan file evidence.
7. P06 — operational workflows, inventory dan tracking truk checkpoint.
8. P07 — RAB, cash obligation, instruksi pembayaran manual, accounting dan FX.
9. P08 — compliance dan dokumen ekspor.
10. P09 — Gemini paid, RAG dan intelligence.
11. P10 — frontend, UX, app routing dan stakeholder portals.
12. P11 — reports, dashboards, notifications dan BI.
13. P12 — QA, UAT, DevOps, production readiness.
14. P13 — change control dan traceability.

## Keputusan pengguna yang ditambahkan pada Revision 1.1

- Hanya satu Admin Aplikasi principal/login aktif; hanya Admin membuat/menyetujui/mengaktifkan Contract Program dan konfigurasi otoritatif. Tidak ada alternate approver.
- Recurring cycle diatur Admin pada awal Contract Program dan dapat diubah saat project berjalan melalui versioned change control.
- Project Instance mewakili satu unit pemenuhan/settlement komersial (misalnya 10.000 MT per tranche). Pembayaran parsial tidak otomatis membuat project baru.
- Admin diberi opsi penanganan amendment: record only/future cycle, revise active project, successor project, split, supplemental scope, temporary variation atau custom review.
- First-cycle readiness mensyaratkan seluruh plan P01–P13 dalam scope pilot sudah berjalan dan lulus kriteria P12.
- Rekomendasi default recurring generation adalah `scheduled_draft`; draft tidak pernah aktif otomatis dan tetap memerlukan persetujuan Admin.

## Catatan penting

- Ini adalah implementation planning documents, bukan executable code atau SQL final.
- Setiap plan perlu direview dan disetujui sebelum coding domain terkait.
- P02/P03 adalah fondasi teknis; P06/P07/P08 adalah fondasi operasional, keuangan dan compliance.
- P06 memasukkan truck checkpoint tracking: foto dari kamera aplikasi, GPS perangkat checker, timestamp, geofence/QR opsional, checker departure dan checker arrival, weighbridge reconciliation, exception review, dan buyer view yang menampilkan last verified checkpoint — tidak diklaim sebagai live GPS.
- Admin tunggal mengatur konfigurasi bisnis yang tersedia melalui katalog fitur; jika tidak tersedia, Admin-only action menunggu. Admin tidak mengubah SQL/RLS, schema, secret atau executable code melalui UI.
- Asumsi yang belum diverifikasi harus diberi source/status; jangan mengubah rekomendasi menjadi fakta operasional.

## Sumber baseline

`PKE_Export_Platform_v4.2.2_Master_System_Architecture_Review_Rev02.md` dan keputusan lanjutan pengguna tentang truck checkpoint tracking.
