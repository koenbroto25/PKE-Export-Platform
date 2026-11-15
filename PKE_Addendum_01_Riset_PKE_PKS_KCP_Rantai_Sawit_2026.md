# ADDENDUM 01
# Riset Awal PKE, PKS, Kernel Crushing Plant, Fasilitas, dan Rantai Pasok Sawit Indonesia
**Untuk PKE Export Intelligence & Project Control Platform**  
**Tanggal riset dan penyusunan: 13 November 2026**  
**Status dokumen: RESEARCH BASELINE — PROVISIONAL, NOT A VERIFIED SUPPLIER REGISTER**

---

## 1. Tujuan dan batas penggunaan

Addendum ini menjadi dokumen pendamping riset untuk mempercepat perencanaan dan implementasi P15–P18. Isinya menggabungkan sumber perusahaan, publikasi pemerintah, traceability disclosure, dan pemberitaan industri yang ditemukan hingga 13 November 2026.

Data ini boleh dipakai sebagai:
- referensi awal untuk desain master data organisasi, fasilitas, produk, kapasitas, koordinat, port, dan hubungan rantai pasok;
- data kandidat untuk proses import-preview/staging, deduplikasi, validasi, dan verifikasi manusia;
- bahan knowledge base/RAG dengan metadata sumber dan tanggal berlaku;
- bahan untuk merancang pencarian supplier, facility matching, port corridor discovery, dan pertanyaan intelijen.

Data ini **tidak boleh langsung dianggap** sebagai:
- daftar supplier/partner yang telah menyetujui kerja sama;
- bukti kapasitas aktual, stok tersedia, penawaran harga, atau volume siap jual;
- bukti bahwa fasilitas masih beroperasi normal pada hari ini;
- bukti bahwa suatu PKS tertentu memasok kernel ke KCP tertentu, kecuali hubungan itu dinyatakan sumber;
- bukti rute jalan, jarak, waktu tempuh, terminal yang kompatibel, atau port of loading terdekat;
- data transaksi, kontrak, inventory lot, shipment, atau vessel position.

Tidak ada data yang ditulis ke Neon Production melalui riset ini. Seluruh record dalam addendum harus diperlakukan sebagai **research observations**, bukan business master records yang sudah disetujui.

## 2. Terminologi yang harus dibedakan

| Istilah | Definisi operasional untuk PKE |
|---|---|
| PKS / Palm Oil Mill (POM) | Mengolah TBS/FFB menjadi CPO dan kernel. PKS umumnya bukan fasilitas yang langsung menghasilkan PKE. |
| Palm Kernel (PK) | Inti sawit hasil pemisahan di PKS; bahan baku utama KCP. |
| KCP / Kernel Crushing Plant | Mengolah PK menjadi CPKO/PKO dan PKE. Inilah fasilitas utama yang perlu dicatat sebagai produsen PKE jika produk PKE terkonfirmasi. |
| Solvent Extraction Plant | Dapat memproses cake lanjutan untuk menghasilkan PKM; bedakan PKE dari PKM dan jangan gabungkan kapasitas keduanya. |
| Refinery / Fractionation | Mengolah minyak sawit/inti sawit; bukan otomatis produsen PKE. |
| Bulking station / warehouse | Fasilitas penyimpanan atau konsolidasi; bukan otomatis pabrik produsen. |
| Port / port terminal / berth | Entitas berbeda. Nama pelabuhan tidak membuktikan terminal, dermaga, alat bongkar, kedalaman, atau izin penanganan PKE. |

**Rantai proses konseptual:**

```text
Kebun sawit / plasma / pemasok TBS
              |
              v
       PKS / Palm Oil Mill
          |          |
          v          v
         CPO      Palm Kernel (PK)
                       |
                       v
              Kernel Crushing Plant
                  |           |
                  v           v
                CPKO         PKE
                              |
                              v
                   Warehouse / Bulking
                              |
                              v
                    Port / Terminal
                              |
                              v
                    Vessel / Export
                              |
                              v
                     Buyer / Feed mill
```

Hubungan antar-fasilitas harus dicatat hanya jika ada bukti sumber. Jangan otomatis menghubungkan semua PKS satu grup ke semua KCP grup tersebut.

## 3. Daftar fasilitas kandidat dan kekuatan bukti

### 3.1 Kandidat PKE dengan bukti produk relatif kuat

| ID riset | Entitas / fasilitas | Lokasi yang ditemukan | Produk / kapasitas yang dipublikasikan | Koordinat | Kualitas bukti dan status awal |
|---|---|---|---|---|---|
| R-PKE-001 | PT Sinar Jaya Inti Mulya (SJIM) — Lampung KCP | Banjar Sari, Metro Raya, Lampung | CPKO dan PKE; kapasitas yang dipublikasikan sampai 600 ton kernel/hari | `-5.0665, 105.3020` (traceability listing) | `SOURCE_CONFIRMED`; kapasitas adalah input kernel, bukan output PKE. Koordinat perlu dicocokkan ulang dengan titik gerbang/fasilitas. |
| R-PKE-002 | PT Sinar Jaya Inti Mulya (SJIM) — Baamang KCP | Baamang, Kabupaten Kotawaringin Timur, Kalimantan Tengah | CPKO dan PKE; company profile menyebut hingga 1.000 ton/hari, dengan frasa kapasitas kernel yang perlu dikonfirmasi basis pengukurannya | Belum terverifikasi | `SOURCE_CONFIRMED`; kapasitas perlu klarifikasi tertulis (PK input atau produk output). |
| R-PKE-003 | PT Karya Serasi Jaya Abadi (KSJA / STA Resources) — KCP | Tebing Tinggi, Sumatera Utara | CPKO dan PKE; kapasitas 600 MT/hari pada laman perusahaan | Belum terverifikasi | `SOURCE_CONFIRMED`; angka kapasitas adalah kapasitas pengolahan harian KCP menurut perusahaan. |
| R-PKE-004 | PT Rambah Sawit Mandiri — KCP | Rambah Samo, Rokan Hulu, Riau (wilayah fasilitas perlu konfirmasi alamat lengkap) | KCP 300 MT/hari; POM 45 MT TBS/jam. Sumber perusahaan mengonfirmasi KCP dan kapasitas; PKE disebut dalam sumber produk/kontak perusahaan yang perlu disimpan sebagai bukti terpisah | `0.81903, 100.43569` (koordinat daftar pihak ketiga; titik fasilitas perlu verifikasi) | `SOURCE_CONFIRMED` untuk keberadaan KCP dan kapasitas; `PKE_PRODUCT_EVIDENCE_PENDING` sampai dokumen produk resmi ditautkan pada facility record. |
| R-PKE-005 | PT Sukses Karya Mandiri (SKM) — KCP | Desa Kenawan, Kecamatan Permata Kecubung, Kabupaten Sukamara, Kalimantan Tengah | Kegiatan pengolahan palm kernel menjadi CPKO dan PKE diamati dalam field trip TKS 2026; kapasitas belum ditemukan | Belum terverifikasi | `SOURCE_CONFIRMED` untuk proses PKE berdasar laporan field trip industri; kapasitas dan alamat fasilitas rinci belum tersedia. |

### 3.2 KCP atau fasilitas kernel yang relevan, tetapi PKE harus tetap berstatus belum terkonfirmasi

| ID riset | Entitas / fasilitas | Lokasi / koordinat | Bukti yang tersedia | Batas interpretasi |
|---|---|---|---|---|
| R-KCP-006 | PT Agro Mega Perkasa — KCP | Teluk Sepang, Bengkulu; `-3.91782, 102.30228` | Daftar KCP Apical periode 2024 mencantumkan fasilitas dan koordinat terverifikasi; traceability Wilmar 2024/25 juga mencantumkan alamat | Status KCP/koordinat historis cukup kuat; kapasitas, PKE output, dan status operasi November 2026 belum dikonfirmasi langsung oleh perusahaan. |
| R-KCP-007 | PT Adhitya Serayakorita (PT ASK) — KCP | Bangsal Aceh, Sungai Sembilan, Dumai, Riau; `1.723500, 101.378889` | First Resources mencantumkan PT ASK sebagai KCP dalam traceability disclosure 2025; laporan 2024 mencantumkan alamat dan koordinat | KCP terkonfirmasi dalam disclosure grup. Jangan menganggap koordinat laporan 2024 sebagai hasil survei terbaru; kapasitas PKE saat ini perlu konfirmasi. |
| R-KCP-008 | PT Swadaya Mukti Prakarsa — KCP | Indonesia; alamat/koordinat perlu ekstraksi dari daftar fasilitas First Resources | Disebut sebagai KCP dalam traceability disclosure First Resources 2025 | `KCP_CONFIRMED`; lokasi, status terkini, produk dan kapasitas belum lengkap. |
| R-KCP-009 | PT Ketapang Agro Lestari — KCP | Indonesia; alamat/koordinat perlu ekstraksi dari daftar fasilitas First Resources | Disebut sebagai KCP dalam traceability disclosure First Resources 2025 | `KCP_CONFIRMED`; lokasi, status terkini, produk dan kapasitas belum lengkap. |
| R-KCP-010 | PT Citra Agro Kencana — KCP | Indonesia; alamat/koordinat perlu ekstraksi dari daftar fasilitas First Resources | Disebut sebagai KCP dalam traceability disclosure First Resources 2025 | `KCP_CONFIRMED`; lokasi, status terkini, produk dan kapasitas belum lengkap. |
| R-KCP-011 | DSNG KCP — Muara Wahau | Muara Wahau, Kalimantan Timur | DSNG melaporkan satu KCP pada 2025 dengan kapasitas 400 ton/hari, mengolah kernel untuk menghasilkan PKO; kernel berasal dari PKS DSNG di Kalimantan Timur | Koordinat fasilitas belum diambil dari sumber primer | `KCP_CONFIRMED`; sumber yang ditemukan menyebut PKO, bukan PKE. Jangan masukkan sebagai produsen PKE terkonfirmasi. |

### 3.3 Kandidat tambahan untuk pengembangan cakupan

- Daftar P&G Palm Oils Mill List Oktober 2026 dapat digunakan untuk memperluas direktori mill dan koordinat, tetapi klasifikasi Palm Oil/Palm Kernel Oil atau Palm Oil Derivatives tidak membuktikan bahwa setiap mill menghasilkan PKE.
- ADM PKE traceability 2023 berpotensi menyediakan daftar historis mill asal PKE. Karena periode 2023, gunakan sebagai historical observation dan jangan menyatakan status aktif 2026.
- Daftar KCP Apical 2024 berguna sebagai direktori fasilitas kernel crushing dan koordinat, bukan sebagai bukti kapasitas/produksi terkini.
- Laman First Resources 2025 merupakan sumber penting untuk daftar KCP grup dan traceability kernel, tetapi hubungan supplier mill ke KCP harus diambil dari lampiran/tabel sumber, bukan diasumsikan dari kepemilikan grup.

## 4. Pelabuhan, koridor, dan bukti logistik

| Fasilitas / wilayah asal | Port / corridor yang dapat diteliti | Bukti saat ini | Status yang boleh dipakai |
|---|---|---|---|
| SJIM Lampung | Pelabuhan Panjang, Lampung | Informasi grup SJAI menyebut fasilitas bulking di Panjang; belum membuktikan rute langsung pabrik ke terminal atau terminal PKE yang digunakan | `PORT_CANDIDATE`; bukan nearest-port verified |
| SJIM Baamang | Pelabuhan Sampit sebagai kandidat regional | Belum ditemukan bukti primer yang cukup untuk mengunci terminal, rute, dan fasilitas ekspor saat ini | `PORT_CANDIDATE` saja |
| KSJA, Tebing Tinggi | Belawan atau pelabuhan lain di Sumatera Utara | Belum ada rute/terminal PKE yang terverifikasi dari sumber yang ditelusuri | `PORT_CANDIDATE` setelah kajian rute |
| Rambah Sawit Mandiri, Rokan Hulu | Dumai sebagai kandidat koridor | Kedekatan regional tidak membuktikan rute terpendek, akses truk, atau kesesuaian terminal | `PORT_CANDIDATE` |
| Agro Mega Perkasa, Teluk Sepang | Pulau Baai, Bengkulu | Pemerintah mengonfirmasi pengiriman 7.800 ton PKE dari Pulau Baai pada Juli 2026; tidak menyebut Agro Mega Perkasa sebagai pemasok | Port PKE export activity `SOURCE_CONFIRMED`; hubungan supplier–shipment tidak diketahui |
| PT Adhitya Serayakorita, Dumai | Port Dumai | Fasilitas berada di Dumai; terminal dan rute yang dipakai untuk PKE belum dikonfirmasi dalam sumber ini | `PORT_CANDIDATE` |
| PT Agrojaya Perdana, Martubung | Belawan | Website perusahaan menyebut sekitar 30 menit ke Belawan; berita melaporkan kebakaran di pabrik KCP pada 25 April 2026 | Kedekatan historis saja; status operasi pascakebakaran `OPERATIONAL_STATUS_UNVERIFIED` |

**Penting:** pada 15 Juli 2026, 7.800 ton PKE diberangkatkan melalui Pelabuhan Pulau Baai. Berita Karantina menyatakan kapal menuju Pelabuhan Panjang terlebih dahulu dan selanjutnya ekspor ke Selandia Baru melalui pelabuhan ekspor di Lampung. Ini adalah bukti koridor logistik PKE yang benar-benar digunakan pada satu pengiriman, tetapi tidak mengungkap identitas produsen/pemasok. Jangan menghubungkan shipment itu ke PT Agro Mega Perkasa atau fasilitas lain tanpa dokumen manifest/supplier.

## 5. Sumber data dan bobot evidensinya

### Sumber primer / resmi perusahaan dan pemerintah

1. **SJIM — company profile**  
   https://sjai.co.id/sinar-jaya-inti-mulya/  
   Menyebut dua fasilitas Lampung dan Baamang, kapasitas kernel yang dipublikasikan, CPKO dan PKE, serta pasar ekspor. Sumber perusahaan; kapasitas dan status operasi tetap perlu konfirmasi langsung.

2. **STA Resources — Kernel Crushing Plant (KSJA)**  
   https://www.sta.co.id/page/kernel-crushing-plant/en  
   Menyebut PT Karya Serasi Jaya Abadi, Tebing Tinggi, kapasitas 600 MT/hari, produk CPKO dan PKE.

3. **STA Resources — Solvent Extraction Plant**  
   https://www.sta.co.id/page/solvent-extraction-plant/id  
   Menyebut kapasitas hingga 500 MT/hari dan produksi PKM dari proses ekstraksi lanjutan. Jangan menyatukan kapasitas ini dengan kapasitas KCP 600 MT/hari.

4. **PT Rambah Sawit Mandiri — official facilities page**  
   https://www.rambahsawitmandiri.com/index.html  
   Menyebut POM 45 MT/jam dan KCP 300 MT/hari. Produk PKE perlu ditautkan ke bukti katalog/produk resmi yang spesifik.

5. **First Resources — Traceability**  
   https://www.first-resources.com/sustainability/supply-chain-management/tracebility/  
   Disclosure 2025 menyebut PT Adhitya Serayakorita, PT Swadaya Mukti Prakarsa, PT Ketapang Agro Lestari dan PT Citra Agro Kencana sebagai KCP. Menjelaskan persyaratan traceability mill dan kernel supply.

6. **DSNG — FFB Supplier Traceability**  
   https://dsn.co.id/esg/our-supply-chain-and-landscapes/ffb-supplier-traceability/  
   Disclosure 2025 menyebut KCP Muara Wahau kapasitas 400 ton/hari untuk PKO, dengan kernel berasal dari mill DSNG di Kalimantan Timur. Tidak menyebut PKE sebagai output dalam halaman tersebut.

7. **BPS — Direktori Perusahaan Perkebunan Kelapa Sawit Indonesia 2025**  
   https://www.bps.go.id/id/publication/2026/09/30/e895d1a25bd8b51c4136ae1a/direktori-perusahaan-perkebunan-kelapa-sawit-indonesia-2025.html  
   Rilis 30 September 2026. Memuat nama perusahaan, status badan hukum, alamat, telepon/faksimile, alamat kantor pusat, dan email, disusun menurut provinsi. Gunakan untuk organisasi/PKS legal directory, bukan bukti bahwa perusahaan memiliki KCP/PKE.

8. **P&G — Palm Oil Mill List Global October 2026**  
   https://s204.q4cdn.com/332108499/files/doc_downloads/2026/10/P-G-PALM-OIL-MILL-LIST_GLOBAL_OCT2026.pdf  
   Memuat UML ID, mill, parent company, RSPO, koordinat, negara dan kategori rantai produk. Berguna untuk mill directory dan traceability cross-reference. Kategori grup tidak membuktikan produk PKE per fasilitas.

9. **Badan Karantina Indonesia — pengiriman 7.800 ton PKE melalui Pulau Baai**  
   https://karantinaindonesia.go.id/kalimantan-barat/berita/penuhi-permintaan-selandia-baru-7800-ton-pke-bengkulu-dikirim-melalui-pelabuhan-pulau-baai  
   Publikasi 17 Juli 2026 tentang pengiriman 7.800 ton PKE melalui Pulau Baai, tujuan awal Panjang, lalu ekspor ke Selandia Baru.

10. **Apical — KCP supplier traceability list (2024)**  
    https://www.apicalgroup.com/wp-content/uploads/2021/09/TDD-AAJ-Marunda-Q4_2024.pdf  
    Lampiran periode Oktober–Desember 2024 mencantumkan Agro Mega Perkasa KCP di Bengkulu dengan koordinat `-3.91782, 102.30228`, status koordinat `VERIFIED` menurut dokumen tersebut. Ini verifikasi koordinat pada saat laporan, bukan verifikasi operasi November 2026.

11. **Wilmar — traceability list WINA Pelintung**  
    https://www.wilmar-international.com/docs/default-source/default-document-library/sustainability/supply-chain/traceability-report--q3%272024---q2%272025/indonesia/wina-pelintung_251024.pdf  
    Mencantumkan Agro Mega Perkasa (Kernel Crushing Plant), alamat Teluk Sepang dan koordinat `-3.916990, 102.302241`.

12. **RSPO / laporan industri — PT Sukses Karya Mandiri**  
    https://bisnissawit.com/tks-2026-pt-skm-tunjukkan-integrasi-biogas-dan-hilirisasi-sawit-untuk-energi-mandiri/  
    Laporan field trip TKS 2026 di Desa Kenawan, Permata Kecubung, Sukamara; menyatakan peserta melihat proses palm kernel menjadi CPKO dan PKE di KCP PT SKM. Sumber industri, bukan pengganti konfirmasi kapasitas resmi perusahaan.

13. **PT Agrojaya Perdana — company website**  
    https://agrojayaperdana.com/  
    Informasi perusahaan untuk profil produk/fasilitas. Catatan risiko: berita lokal melaporkan kebakaran pada fasilitas KCP di Martubung pada 25 April 2026.  
    https://www.posmetromedan.id/peristiwa/8924/pabrik-pengolahan-inti-sawit-di-martubung-digasak-api/  
    Jangan tandai `OPERATIONAL_VERIFIED` sebelum konfirmasi pascakejadian.

### Sumber historis / sekunder yang perlu diperlakukan hati-hati

- ADM PKE Traceability 2023: berguna untuk historical origin mill PKE, bukan status 2026.
- P&G, Apical, Wilmar, First Resources traceability disclosures: tiap daftar memiliki periode dan definisi berbeda; jangan menggabungkan seolah satu daftar lengkap nasional.
- Berita industri/field trip: dapat membuktikan kegiatan yang dilaporkan pada tanggal tertentu, tetapi tidak selalu memberi kapasitas, izin, atau kondisi operasi terkini.
- Koordinat dari daftar pihak ketiga/traceability harus menyimpan publisher, periode, status koordinat, dan metode verifikasi; bukan dianggap hasil survei lapangan PKE.

## 6. Rekomendasi struktur data untuk P15

Gunakan schema Production yang sudah ada sebagai sumber kebenaran. Nama tabel di bawah adalah **logical concepts**, bukan perintah membuat tabel baru. Pemetaan wajib dilakukan terhadap schema aktual sebelum implementasi.

| Logical entity | Field minimum yang perlu tersedia | Aturan |
|---|---|---|
| Organization | legal_name, aliases, parent_org_id, registration identifiers, address, contact, country, source | Pisahkan legal entity, parent group, owner dan operator. |
| Facility | facility_name, facility_type (`PKS`, `KCP`, `REFINERY`, `SOLVENT_EXTRACTION`, `WAREHOUSE`, `BULKING`, `PORT_TERMINAL`), organization, address, province, regency, coordinates, coordinate_accuracy, operating_status | Satu organisasi dapat memiliki banyak fasilitas; satu fasilitas jangan diduplikasi hanya karena alias. |
| Facility product | product code, role (`INPUT`, `OUTPUT`, `BYPRODUCT`), evidence, valid_from/to | Bedakan PK, CPO, CPKO, PKE, PKM, shell. |
| Capacity observation | metric, value, unit, basis, period, source | Unit wajib spesifik: `MT_KERNEL_INPUT_PER_DAY`, `MT_PKE_OUTPUT_PER_DAY`, `MT_FFB_PER_HOUR`, `MT_PKM_OUTPUT_PER_DAY`. Jangan konversi input kernel menjadi output PKE tanpa yield evidence. |
| Facility relationship | from_facility, to_facility, relationship type, product, evidence, period | Contoh `PKS_SUPPLIES_KERNEL_TO_KCP`; jangan infer hanya dari parent group. |
| Facility-port route | facility, port, terminal, route mode, distance, duration, route provider, timestamp, constraints | Simpan `PORT_CANDIDATE` sampai route dan terminal suitability terverifikasi. |
| Source observation | publisher, title, URL, publication date, retrieval date, source period, source type, exact excerpt, page/section, checksum, confidence, reviewer, verification status | Setiap klaim penting harus punya source observation sendiri. |
| Product quality | parameter, value, unit, method, lab, sample date, batch/lot, certificate | Jangan memasukkan spesifikasi atau hasil uji yang tidak tersedia. |

### 6.1 Status verifikasi yang disarankan

- `DISCOVERED` — ditemukan dalam sumber, belum ditinjau.
- `SOURCE_CONFIRMED` — sumber dapat diakses dan secara eksplisit mendukung klaim.
- `COORDINATE_CONFIRMED` — koordinat dikonfirmasi sumber; simpan tanggal dan penerbit.
- `PKE_PRODUCT_CONFIRMED` — sumber secara eksplisit menyebut fasilitas menghasilkan PKE.
- `KCP_CONFIRMED` — fasilitas KCP teridentifikasi, tetapi PKE output belum tentu terkonfirmasi.
- `CAPACITY_CONFIRMED` — kapasitas dan basis satuan eksplisit.
- `PORT_CANDIDATE` — pelabuhan kandidat saja.
- `ROUTE_VERIFIED` — rute/jarak/waktu dihitung dengan sumber, timestamp dan moda.
- `TERMINAL_COMPATIBILITY_VERIFIED` — terminal memiliki layanan, izin dan fasilitas sesuai cargo.
- `OPERATIONAL_VERIFIED` — status operasi dikonfirmasi baru-baru ini oleh sumber layak.
- `PARTNER_CONFIRMED` — partner telah diverifikasi dan disetujui owner.
- `SUPERSEDED` — observasi lama diganti bukti yang lebih baru.

Status di atas tidak saling menggantikan. Contoh: `KCP_CONFIRMED` bukan `PKE_PRODUCT_CONFIRMED`, dan `COORDINATE_CONFIRMED` bukan `ROUTE_VERIFIED`.

## 7. Strategi seed data: staging dahulu, bukan direct insert

1. Ambil dokumen sumber resmi dan simpan sebagai source records dengan tanggal retrieval dan checksum.
2. Ekstrak organisasi dan fasilitas ke staging import, satu baris per fasilitas, bukan satu baris per perusahaan.
3. Normalisasi nama legal, alias, parent group, provinsi/kabupaten, koordinat, produk dan unit kapasitas.
4. Deduplikasi berdasarkan legal entity + facility identity + coordinates/address; jangan merge dua lokasi satu grup.
5. Validasi koordinat dan alamat. Simpan koordinat sumber apa adanya; jangan menggeser atau menebak titik.
6. Validasi produk: hanya PKE yang dinyatakan eksplisit boleh mendapat `PKE_PRODUCT_CONFIRMED`.
7. Validasi kapasitas: catat basis pengukuran persis sebagaimana sumber; jangan mengonversi.
8. Hubungkan mill–KCP hanya jika traceability report menyebut hubungan supplier.
9. Tambahkan port candidate secara terpisah; route engine dan verifikasi terminal menjadi tugas berikutnya.
10. Tampilkan import preview: new / update / duplicate / conflict / low-confidence / needs-review.
11. Owner/reviewer menyetujui sebelum data masuk master production.
12. Simpan source lineage sehingga perubahan data dapat direkonsiliasi tanpa menghapus sejarah observasi.

Tidak ada dummy business rows. Data riset publik dapat dimasukkan ke staging/research catalog hanya setelah mekanisme tersebut tersedia dan mendapat persetujuan pemilik sistem.

## 8. P16 — rencana pengembangan port dan logistik

Prioritas implementasi:
1. Direktori port authority, port, terminal, berth, warehouse, bulking station dan service provider sebagai entitas berbeda.
2. Master layanan: dry bulk, bagged cargo, container, loading/unloading, weighing, fumigation/quarantine, sampling, storage, truck access, vessel draft restrictions.
3. Geocoding dan routing provider adapter; semua hasil menyimpan provider, timestamp, mode, distance, duration dan confidence.
4. Facility-to-port corridor matching dengan multi-criteria: jarak jalan, akses truk, kapasitas jalan/jembatan, terminal capability, cargo handling, draft, storage, quarantine, biaya dan jadwal.
5. Status rekomendasi: candidate → route checked → terminal checked → commercial confirmed.
6. Jangan mengklaim nearest port hanya dari jarak garis lurus atau kedekatan administratif.

## 9. P17 — rencana maritime dan export control tower

- Vessel master: IMO sebagai identitas utama bila tersedia, MMSI/call sign sebagai identifier yang dapat berubah, flag, type, dimensions, deadweight, draft, owner/operator/manager.
- Voyage: origin, destination, ETA/ETD, port calls, status dan source.
- AIS: hanya provider observation bertimestamp; jangan membuat posisi kapal dari jadwal atau nama kapal.
- Shipment: project, buyer, product, quantity, packing, warehouse, port/terminal, voyage, vessel, documents, loading operations.
- Loading evidence: weighbridge, loading ticket, survey, draft survey, photos, timestamps, actor dan exception.
- Buyer portal: tampilkan milestone dan bukti yang boleh diakses sesuai project scope.
- Data provider/credential yang belum tersedia menjadi blocker aktivasi eksternal, bukan alasan tidak membangun schema adapter, UI, mock contracts dan workflow.

## 10. P18 — RAG dan Regulatory Knowledge Graph

### 10.1 Koleksi pengetahuan

| Collection | Isi | Contoh |
|---|---|---|
| `KB_SUPPLY_NETWORK` | organisasi, PKS, KCP, produk, kapasitas, hubungan kernel | SJIM, KSJA, SKM, mill supplier relationships |
| `KB_FACILITY_INTELLIGENCE` | lokasi, proses, status, sertifikasi, fasilitas | KCP, refinery, extraction plant, warehouse |
| `KB_PORT_LOGISTICS` | port, terminal, berth, layanan, route, restriction | Pulau Baai, Panjang, Belawan, Dumai sebagai kandidat |
| `KB_VESSEL_MARITIME` | vessel particulars, AIS observations, voyage | IMO/MMSI dan provider snapshots |
| `KB_EXPORT_REGULATIONS` | regulasi resmi, HS, karantina, dokumen negara tujuan | sumber pemerintah, rule versions |
| `KB_MARKET_TRADE` | shipment historis, negara tujuan, volume | pengiriman PKE Bengkulu 7.800 ton Juli 2026 |

### 10.2 Metadata wajib setiap dokumen/chunk

`source_id`, `publisher`, `source_title`, `source_url`, `publication_date`, `retrieved_at`, `effective_from`, `effective_to`, `jurisdiction`, `facility_id` (nullable), `organization_id` (nullable), `product_code`, `claim_type`, `confidence`, `verification_status`, `page_or_section`, `content_hash`, `access_scope`, `supersedes_source_id`.

### 10.3 Aturan jawaban AI

- Jawaban harus mengutip sumber yang mendukung setiap klaim fasilitas, kapasitas, produk, status, rute dan regulasi.
- Jika sumber hanya menyebut KCP dan PKO, AI tidak boleh menyimpulkan PKE.
- Jika kapasitas tidak jelas basisnya, AI harus mengatakan “basis kapasitas belum terverifikasi”.
- Jika sumber sudah lama, AI harus menyebut tanggal/periode sumber.
- Jika port hanya kandidat, AI harus menyebut “kandidat, belum terverifikasi sebagai port terdekat/terminal yang digunakan”.
- Jangan mengarang stok, kontrak, harga, supplier relationship, posisi AIS, ETA, compliance status, atau availability.
- Pisahkan fakta sumber, kalkulasi sistem, estimasi, dan hipotesis AI.
- Setiap AI run menyimpan citations, prompt/model version, retrieval set, timestamp dan feedback.

## 11. Rencana kerja agresif dan terukur P15–P18

Pekerjaan dapat berjalan paralel; jangan menunggu business data Production. Target berikut adalah urutan acceptance, bukan klaim bahwa semua sudah selesai.

| Gelombang | Fokus | Deliverable yang dapat dikerjakan tanpa business rows | Acceptance evidence |
|---|---|---|---|
| W0 — schema mapping | Audit schema aktual dan endpoint existing | mapping logical entities → existing tables/columns; gap list dalam Master Plan | query/read-only schema evidence, tidak ada asumsi tabel baru |
| W1 — P15 foundation | Organization/facility/product/capacity/source model | DTO, validation, repositories, CRUD/search APIs, source lineage, dedupe, import preview | typecheck, unit/contract tests, route tests, UI empty/loading/error states |
| W2 — P16 logistics | port/terminal/warehouse/service/route | API, adapter contracts, candidate matching, route evidence model | provider mocks, deterministic tests, UI corridor comparison |
| W3 — P17 maritime | vessel/voyage/AIS/shipment milestones | vessel registry, provider adapter, event timeline, role-scoped visibility | no fabricated AIS; provider-unavailable behavior; API/UI tests |
| W4 — P18 knowledge | source registry, ingestion, chunking, retrieval, citations | RAG pipeline, policy filters, provenance, answer evaluator | citation coverage tests, stale-source tests, no-answer-on-no-evidence tests |
| W5 — integration | cross-domain workflows | P15 → P16 → P17 → P18 links; project-level permissions; audit | full contract and browser tests; real DB E2E only when permitted |
| W6 — owner data onboarding | real partner/facility validation | reviewed seed import, owner approval, change history | signed/recorded approval and source verification |

### Ukuran keberhasilan awal

- 100% seed observations memiliki source URL, publisher, retrieval date, source period, confidence dan verification status.
- 0 fasilitas PKE diklasifikasikan `PKE_PRODUCT_CONFIRMED` tanpa bukti produk eksplisit.
- 0 kapasitas tercatat tanpa unit dan basis kapasitas.
- 0 hubungan PKS→KCP dibuat hanya dari kesamaan parent group.
- 0 port diberi label nearest/verified tanpa route dan terminal suitability evidence.
- 0 stok, kontrak, shipment, atau posisi kapal dibuat dari data publik.
- Semua P15–P18 memiliki API contract, permission map, frontend state dan tests sebelum integrasi data riil.
- Semua unresolved external dependencies dipisahkan dari code-resolvable work.

## 12. Sumber riset yang belum cukup untuk klaim lebih tinggi

- Kapasitas SJIM Baamang perlu klarifikasi basis ukur dan konfirmasi terbaru.
- Rambah Sawit Mandiri: KCP dan kapasitas 300 MT/hari terkonfirmasi pada laman perusahaan; bukti PKE output perlu sumber primer spesifik yang terhubung ke facility record.
- Agro Mega Perkasa: koordinat KCP historis terverifikasi pada traceability reports, tetapi kapasitas, PKE product output dan status operasi 2026 belum terkonfirmasi.
- PT Adhitya Serayakorita: KCP terdaftar di First Resources; koordinat yang tersedia dari laporan 2024 dan perlu pembaruan.
- DSNG Muara Wahau: KCP 400 MT/hari menghasilkan PKO menurut sumber 2025; PKE tidak boleh diasumsikan.
- PT Agrojaya Perdana: laporan kebakaran 25 April 2026 membuat status operasi perlu konfirmasi.
- Port untuk setiap fasilitas kecuali bukti pengiriman Pulau Baai/Panjang belum dihubungkan secara langsung dengan pemasok tertentu.
- Tidak ada data publik yang cukup untuk mengisi stock availability, monthly output, open capacity, current offer, payment terms atau supplier willingness.

---

**Kesimpulan operasional:** addendum ini cukup untuk memulai desain P15–P18, source registry, import preview, RAG taxonomy, port candidate analysis dan partner verification workflow. Addendum ini belum cukup untuk membuat supplier master production yang dianggap sah atau mengklaim kesiapan pasokan. Implementasi software harus berjalan sekarang; verifikasi komersial dan onboarding partner berjalan paralel.
