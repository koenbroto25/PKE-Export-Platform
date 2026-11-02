# P06 — Operational Workflow, Inventory & Truck Checkpoint Tracking

**Kategori:** Core operations  
**Prioritas:** P0 untuk first shipment  
**Status:** Draft untuk review — memuat tambahan tracking setelah Architecture Review v4.2.2

## 1. Tujuan

Mengendalikan pergerakan PKE dari PKS/supplier melalui kendaraan, gudang, packing/stuffing, pelabuhan dan loading kapal, dengan dukungan beberapa jalur operasional. Sistem harus dapat menelusuri asal, lot, kuantitas, kualitas, lokasi terakhir terverifikasi, penanggung jawab, bukti dan biaya.

## 2. Prinsip workflow

Jangan hard-code satu urutan kolom status. Setiap project memilih workflow template dan membuat instance berdasarkan graph stage/event yang mendukung optional, parallel dan repeated nodes.

Contoh skenario:
- PKS → truck → port stockpile → conveyor/loader → vessel hold.
- PKS → truck → warehouse → bulk handling → vessel.
- PKS → truck → warehouse → bulk container stuffing → gate-in → vessel.
- PKS → truck → warehouse → bagging → container stuffing → gate-in → vessel.
- Multi-PKS → multi-warehouse/route → multi-port → multiple vessel/voyage.

## 3. Core operation objects

- `project`: satu siklus pemenuhan/settlement.
- `shipment`: pengiriman berdasarkan kebutuhan kontrak.
- `lot`: unit traceability yang berasal dari satu sumber/produksi/penerimaan.
- `shipment_allocation`: alokasi tonase lot ke shipment.
- `transport_leg`: satu segmen perpindahan antara origin dan destination.
- `truck_trip`: satu perjalanan kendaraan pada satu transport leg.
- `tracking_event`: departure, waypoint/checkpoint, arrival, handover, exception.
- `tracking_evidence`: foto, GPS observation, weighbridge ticket, document.
- `inventory_movement`: receipt, transfer, issue, adjustment, reservation.
- `loading_operation`: bulk/container/bagged operation.
- `voyage` dan `port_call`: perjalanan dan panggilan pelabuhan kapal.

## 4. Checkpoint-Based Truck Tracking (fitur wajib)

### 4.1 Filosofi

Metode utama untuk third-party trucking adalah checkpoint-based tracking. Aplikasi tidak mewajibkan pemasangan GPS pada truk atau aktivasi GPS sopir. Sistem merekam lokasi pada saat checker melakukan verifikasi di lokasi asal, checkpoint antara (opsional) dan lokasi tujuan.

Posisi yang ditampilkan adalah **last verified checkpoint**. Aplikasi tidak boleh menggambar data ini seolah-olah live continuous GPS tracking.

### 4.2 Departure workflow — checker PKS

1. Checker membuka task/trip yang ditugaskan kepadanya.
2. Memindai QR checkpoint/lokasi bila diwajibkan.
3. Mengambil GPS perangkat checker pada saat capture, termasuk latitude, longitude, accuracy meter, provider/source dan timestamp client.
4. Mengambil foto langsung melalui kamera aplikasi/PWA: tampak depan/plat nomor, samping/muatan, dan tiket timbang atau bukti sesuai policy.
5. Mengisi/memverifikasi nomor polisi, nama sopir, transporter, PKS asal, lot, produk, quantity, gross/tare/net weight, waktu berangkat, tujuan dan catatan.
6. Server mencatat `server_received_at`, authenticated user, device/session reference, IP/security metadata yang proporsional dan correlation ID.
7. Sistem memeriksa geofence, GPS accuracy, required images, QR validity, trip assignment, vehicle assignment, quantity range, duplicate images dan incomplete fields.
8. Status menjadi `submitted` lalu `verified`, `needs_review`, `location_mismatch` atau `rejected` sesuai aturan dan reviewer.

### 4.3 Intermediate checkpoint

Opsional sesuai rute, nilai barang, risiko atau kebutuhan buyer. Petugas dapat mencatat lokasi, waktu, foto, kondisi muatan, kendala jalan, antrean, perubahan kendaraan, segel dan informasi lain. Admin dapat menetapkan checkpoint required/optional per transport leg.

### 4.4 Arrival workflow — checker gudang/tujuan

1. Checker gudang memilih trip yang sedang menuju lokasi tersebut atau memindai trip QR.
2. Capture GPS perangkat checker dan foto langsung truk saat tiba.
3. Memverifikasi nomor polisi/sopir dan kondisi muatan.
4. Mencatat arrival time, timbang masuk/keluar, gross/tare/net, kondisi barang dan lot yang diterima.
5. Memeriksa apakah kendaraan dan quantity sesuai dengan dispatch allocation.
6. Jika unloading terjadi, catat waktu mulai/selesai dan hasil timbang/stock receipt.
7. Checker gudang mengajukan konfirmasi penerimaan; warehouse supervisor melakukan review bila required.
8. Trip ditutup setelah arrival dan reconciliation memadai; variance yang belum selesai tetap menjadi exception.

### 4.5 Trust and verification model

GPS dari perangkat checker menunjukkan lokasi perangkat checker, bukan jaminan absolut lokasi truk. EXIF foto bersifat pendukung dan dapat hilang/berubah. Server timestamp adalah waktu server menerima bukti, bukan otomatis waktu foto dibuat. Karena itu sistem harus menggabungkan:
- authenticated checker identity;
- GPS coordinate + accuracy;
- geofence expected site;
- QR/site challenge bila dikonfigurasi;
- original image checksum and capture method metadata;
- server received timestamp;
- plate/vehicle assignment verification;
- weighbridge/ticket data;
- destination checker confirmation.

Jangan mengklaim bukti 100% anti-fraud. Sediakan `verified`, `verified_with_warning`, `manual_review`, `location_unverified`, `mismatch` dan alasan yang tercatat. Lokasi GPS/EXIF tidak boleh diubah oleh Gemini.

### 4.6 Offline and mobile capture

PWA/mobile UX menyimpan draft evidence terenkripsi/aman di perangkat sementara ketika jaringan tidak tersedia. Saat sinkronisasi, simpan client capture time dan server receive time terpisah, checksum, sequence number dan sync state. Offline submission tidak langsung dianggap verified; perlu sinkronisasi dan validasi server. Uji permission GPS, browser camera, file picker limitations, device settings dan kehilangan jaringan di lokasi PKS/gudang.

### 4.7 QR and geofence

- Master coordinate untuk PKS, gudang, terminal, port, dan approved checkpoints.
- Geofence radius/configurable polygon sesuai site layout.
- QR checkpoint dapat berupa static identifier atau dynamic short-lived challenge; dynamic lebih baik untuk kontrol check-in, tetapi tetap bukan bukti tunggal.
- Geofence mismatch menghasilkan review, bukan auto-accusation.
- Admin dapat menentukan lokasi wajib/opsional per project workflow.

### 4.8 Gemini support

Gemini vision/OCR dapat membantu membaca plat nomor dan tiket timbang, menilai kelengkapan foto, membuat deskripsi kondisi visual, mencari indikasi foto duplikat dan menandai mismatch. AI tidak menetapkan lokasi, tidak mengubah tonase, dan tidak menyetujui trip. Hasil AI adalah suggested extraction dengan confidence dan human confirmation.

## 5. Quantity and inventory control

- Simpan measurement source: scale/bridge, manual reading, survey, draft survey, lab/COA.
- Rekam gross, tare, net dengan satuan, alat timbang, calibration/verification evidence bila tersedia.
- Lot genealogy mempertahankan sumber PKS dan setiap merge/split/transfer.
- Semua stock movement harus berpasangan (source/destination) atau mengikuti adjustment reason yang disetujui.
- Bedakan selisih timbang, moisture change, spillage, damage, rejection, sampling, dan unexplained variance.
- Tidak ada toleransi universal; project policy mengikuti kontrak dan measurement method.

## 6. Warehouse, packing and loading

Warehouse: capacity, area/bin, receipt, issue, stock balance, reservation, lot, moisture/quality, storage time, handling cost.

Packing: bag type, bag weight, number of bags, gross/net, batch, material issue, shift, rework, rejected bags.

Container: container number/type, tare/payload, stuffing method, load weight, seal, inspection, gate-in/out, terminal event, on-board event.

Bulk vessel: hold allocation, equipment, loading shift, target/actual rate, downtime reason, stoppage, timesheet, draft survey, statement of facts reference, laytime/demurrage contract inputs.

## 7. Core entities for this plan

`transport_legs`, `truck_trips`, `truck_trip_assignments`, `tracking_events`, `tracking_evidence`, `tracking_locations`, `tracking_checkpoints`, `tracking_geofences`, `tracking_qr_tokens`, `weighbridge_transactions`, `trip_load_allocations`, `trip_reconciliations`, `tracking_exceptions`, `lots`, `lot_genealogy`, `inventory_movements`, `inventory_balances`, `goods_receipts`, `warehouse_receipts`, `packing_batches`, `container_stuffings`, `container_events`, `loading_operations`, `loading_shifts`, `loading_logs`, `downtime_events`, `vessel_events`, `ais_observations`.

## 8. Payment linkage

Verified arrival/quantity can feed transport vendor bill validation or a payment request draft. This is **not** an automatic payment. Finance checks rate card/contract, trip completion, weight basis, duplicates, exception, approval and supporting evidence before manual payment instruction is issued.

## 9. Buyer visibility

Buyer sees shipment quantity status, origin/destination at permitted granularity, verified departure/checkpoint/arrival timestamp, last verified location, proof status, weight milestones and exceptions selected for publication. Buyer does not see driver personal details or exact live GPS. Do not imply truck location is current between checkpoints.

## 10. Acceptance criteria

- One shipment can contain multiple PKS lots and many truck trips.
- One trip can have departure, multiple optional checkpoints and arrival.
- No truck GPS tracker is required.
- GPS accuracy and geofence status are visible to authorized reviewer.
- EXIF absent does not block evidence if app GPS and evidence policy pass.
- Unavailable GPS can enter manual review with reason and approval.
- Server and client timestamps remain distinguishable.
- Arrival checker cannot close a different trip without permission.
- Actual received weight reconciles with dispatched quantity and exceptions.
- Reused/duplicate evidence is flagged.
- Payment request draft uses verified trip data and does not execute a transfer.
- Buyer sees last verified checkpoint only, with freshness timestamp and no false live route.

## 11. Field test cases

1. Good GPS at PKS, strong photo and geofence match.
2. GPS accuracy poor in industrial building.
3. Location permission denied.
4. Photo taken offline and synced later.
5. Duplicate photo re-uploaded.
6. Wrong truck plate.
7. Vehicle change at transfer point.
8. Multiple trips by same truck on one day.
9. One shipment split across multiple trucks.
10. Weight difference above configured tolerance.
11. Truck arrives outside approved geofence.
12. Checker role revoked while trip is open.
13. Buyer portal access cannot reveal driver private data.

## 12. Dependencies

P01 workflow/config; P02 schema/event/outbox; P03 identity/RLS; P04 geocoding/map/provider; P05 object storage; P07 payment reconciliation; P09 vision/OCR assist; P10 PWA/mobile camera/location; P11 reporting; P12 field UAT.
