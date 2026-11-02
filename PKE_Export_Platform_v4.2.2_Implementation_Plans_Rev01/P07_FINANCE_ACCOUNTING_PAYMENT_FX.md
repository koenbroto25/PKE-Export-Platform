# P07 — Finance, RAB, Manual Payment, Accounting & FX

**Kategori:** Financial control and accounting  
**Prioritas:** P0 — financial control required before live money  
**Plan revision:** 1.1  
**Status:** Draft untuk review — settlement-unit project model added

## 1. Tujuan

Membangun pengendalian keuangan proyek yang mampu menjawab: anggaran berapa, biaya yang sudah disepakati berapa, biaya telah terjadi berapa, telah dibayar berapa, hutang/piutang masih berapa, dana tersedia berapa, dan proyeksi laba/rugi sampai project settlement.

## 2. Rekomendasi pendekatan untuk eksportir baru

Gunakan **bottom-up operational RAB + commitment control + accrual accounting + double-entry ledger** sejak awal, tetapi jalankan chart of accounts dan policy akuntansi dalam konfigurasi awal yang sederhana dan diverifikasi akuntan.

Jangan menunggu histori lama untuk membangun kontrol. Pada project pertama, RAB berasal dari kontrak buyer, kontrak PKS, quotation transporter, warehouse, loading vendor, PPJK, surveyor, fumigator, dan biaya lain yang dapat diverifikasi. Biaya yang belum diketahui diberi `planning_assumption` atau `unconfirmed`, bukan angka seolah-olah pasti.

## 3. Project financial boundary: settlement-unit Project Instance

Project Instance mengikuti unit pemenuhan komersial yang ditentukan pada Contract Program (misalnya setiap 10.000 MT yang dibayar sebagai satu tranche). Satu instance dapat mempunyai beberapa delivery, shipment, invoice/payment milestone dan pembayaran parsial.

- Satu transfer parsial tidak otomatis menciptakan project baru.
- Project tetap open sampai settlement unit memenuhi kewajiban penerimaan buyer dan close checklist finansial yang relevan.
- Jika kontrak mengatur pembayaran per tranche 10.000 MT, setiap tranche tersebut menjadi satu settlement-unit Project Instance.
- Jika kontrak mengatur satu tranche dibayar dalam beberapa transfer, semua transfer diposting ke AR yang sama sampai lunas.
- Cycle berikutnya memakai snapshot baru: harga, FX baseline, PKS allocation, RAB, payment terms dan team dapat berubah sesuai kontrak/amendment yang berlaku.
- Amandemen hanya memengaruhi project aktif jika Admin memilih opsi revise-current-project/change order dan bukti kesepakatan komersial tersedia. Transaksi dan jurnal historis tidak ditimpa.

Project close checks: fulfillment/accepted quantity, buyer AR, vendor AP, payment instructions, cash advances, funder obligations, claims/retentions, documents needed for settlement, inventory/lot reconciliation, FX entries, GL posting and period rules. Close cannot be inferred from vessel on-board alone.

## 4. RAB structure

Setiap budget line memuat:
- cost category/code;
- vendor/payee bila diketahui;
- project/work package/transport leg/lot/shipment association;
- quantity basis (MT, trip, km, bag, shift, hour, flat fee);
- unit rate, currency, tax/charge and formula;
- source (contract, quotation, official tariff, historical, assumption);
- estimate confidence and valid date;
- planned payment method and payment trigger;
- planned cash date/due date;
- contingency flag and approval.

Budget version: draft → reviewed → approved → superseded. Perubahan setelah project aktif harus melalui budget change request.

## 5. Budget versus commitment versus actual

Pisahkan:
- **Budget/RAB:** estimasi biaya yang disetujui.
- **Commitment:** PO, kontrak vendor atau kewajiban yang sudah disepakati.
- **Accrued cost:** biaya sudah terjadi berdasarkan penerimaan/pekerjaan tetapi invoice belum diterima/dibayar.
- **Actual expense:** biaya yang diakui menurut accounting policy.
- **Cash paid:** uang benar-benar keluar.
- **Forecast at completion:** estimasi biaya akhir.

Jangan menganggap pembayaran sama dengan biaya. Uang muka dapat menjadi asset/advance sampai pekerjaan atau barang diterima.

## 6. Cash obligation engine

Admin mengonfigurasi per category/payee:
- payment method allowed: cash, bank transfer, tempo/credit, split;
- mandatory or negotiable according to signed contract;
- trigger: before dispatch, on arrival, after unload, per shift, after service, after document issuance, due date;
- basis and rate;
- requester, approver, executor and reconciler;
- required evidence;
- advance/partial/final payment logic;
- cash readiness threshold and escalation.

Status awal untuk item yang belum dikonfirmasi adalah `unconfirmed`. Contoh PKS cash, sopir cash, labor daily cash adalah template rekomendasi, bukan default fakta. Admin wajib mengonfirmasi dari kontrak/quotation sebelum project activation.

### Cash Readiness Gate

Sebelum suatu work package dimulai, sistem menghitung cash required by date against available cash/funding and approved credit. Jika defisit, sistem menandai risk dan meminta tindakan/waiver sesuai authority. Sistem tidak melakukan transfer otomatis.

## 7. Manual payment workflow

1. Operational user membuat payment request dengan alasan, related project/activity, payee, amount, currency, due date, method dan evidence.
2. Sistem memeriksa budget line, commitment, duplicate invoice/trip, quantity/work verification, beneficiary dan available funds.
3. Approver menyetujui/menolak/minta revisi sesuai limit dan segregation of duties.
4. Sistem membuat **Payment Instruction**: siapa harus membayar, kepada siapa, nominal/currency, alasan, due date, metode, rekening yang telah diverifikasi melalui prosedur internal, dan bukti yang harus dikembalikan.
5. Pelaksana menerima notifikasi in-app/email/SMS/WhatsApp (channel ditentukan) dan mengakui penerimaan instruksi.
6. Pelaksana melakukan transfer/cash secara manual di luar aplikasi.
7. Pelaksana mengunggah bukti pembayaran/receipt; sistem mencatat client/server timestamps.
8. Finance memeriksa bukti dan merekonsiliasi dengan invoice/obligation/bank statement/cash count.
9. Accounting mem-post jurnal sesuai policy.

Payment instruction **bukan bukti bahwa pembayaran sudah terjadi**. Status `issued`, `acknowledged`, `executed_claimed`, `evidence_submitted`, `finance_verified`, `reconciled` harus dibedakan.

## 8. Cash advances and petty cash

- Kasir/pelaksana menerima advance dengan limit, purpose, project, time window dan custodian.
- Penggunaan dicatat per bukti pengeluaran.
- Sisa dana dikembalikan dan dicatat.
- Advance tidak menjadi biaya sebelum evidence/expense recognition sesuai policy.
- Settlement harus ditutup sebelum advance baru atau wajib melalui exception approval.
- Cash count dan petty cash reconciliation tersedia.

## 9. AP/AR and buyer payment milestones

AP: vendor bill, due date, partial payment, debit note, withholding/tax where applicable, dispute, reconciliation.

AR: invoice buyer, contract milestone trigger, amount basis, currency, document prerequisites, due date, partial/advance/retention, receipt, bank reconciliation, overdue alerts.

Payment milestone builder mendukung percentage/fixed amount/quantity-based, trigger event, required document, grace period dan evidence. Jangan menyimpulkan payment term dari Incoterms; keduanya terpisah.

## 10. Full accounting recommendation

- Double-entry general ledger with chart of accounts.
- Project subledger and cost centers/work packages.
- AP, AR, cash/bank, inventory, advance, fixed asset if needed, financing and FX accounts.
- Journal posting through controlled accounting service.
- Period close, reversal, accrual, prepayment, reconciliation and audit.
- Bank statement import/manual reconciliation initially; bank payment execution integration out of scope first release.
- Inventory costing: recommend specific lot traceability with cost allocation by lot; accountant validates accounting treatment and method for financial reporting.
- Revenue recognition, tax, withholding, VAT, export charges, inventory accounting and functional currency policy must be confirmed by qualified accountant/tax professional before live ledger.

No update/delete to posted journals. Corrections use reversing/replacement journals.

## 11. Funder management

Record funding facility, principal, currency, drawdown, repayment, maturity, fees/interest/profit-sharing method, security/guarantee if relevant, project allocation and settlement. Funder portal receives only agreed reporting scope. Funding source must not automatically receive unrestricted project access.

## 12. FX architecture

- Company functional currency IDR.
- Project reporting currency configurable.
- Transaction currency explicit per AP/AR/cost/funding.
- Project FX baseline snapshot set when project cycle agreed.
- Market reference rate has provider/source timestamp and freshness.
- Actual execution rate comes from bank/transaction proof.
- Net exposure groups receivables/payables/commitments/forecast and approved hedge positions by due-date bucket.
- Risk alert assesses both percentage movement and estimated IDR impact/margin/cash shortfall.
- Store realized/unrealized FX gain/loss according to policy.
- Do not treat USD increase as universally bad: net receivable USD can benefit, payable USD can hurt.

## 13. Finance reports

RAB vs commitment vs accrued vs paid; cash position; cash obligation calendar; payment instruction ageing; AP ageing; AR ageing; advances outstanding; project gross margin/forecast margin; cost per MT; cost per trip; cost per warehouse day; loading cost per MT; FX exposure and scenarios; project settlement checklist.

## 14. Acceptance criteria

- A project budget can be built bottom-up and versioned.
- No expense starts as confirmed without source/confirmation status.
- Work trigger can create a payment request draft but never bank transfer.
- Payment instruction cannot become paid without executor evidence and Finance verification/reconciliation.
- Duplicate invoice, duplicate truck trip or duplicate payment proof is flagged.
- Cash advance settlement and return of unused cash are supported.
- AP/AR, cash, GL and project cost totals reconcile.
- Every posted journal balances debits/credits.
- FX baseline, market reference and actual rate remain separate.
- Project close checks receivable, payable, advance, funding, claims, document and ledger conditions.
- Project close follows the Contract Program settlement unit; partial AR receipts do not prematurely close or create a new project.
- A new cycle receives a separate FX baseline, RAB version and project snapshot.
- Amendment options preserve historical journals and financial evidence; revised project version or successor project is selected through Admin-approved change control.

## 15. Dependencies

P01 budget and payment configuration; P02 accounting schema; P03 maker-checker scopes; P04 FX/bank data providers; P05 evidence storage; P06 verified quantities/work; P08 compliance fees/document milestones; P11 reports; P12 accounting UAT.

## 16. Open accounting decisions

Final COA, fiscal year, accounting standard, inventory valuation, revenue recognition, export charges/taxes, FX revaluation timing, impairment/provision, bank reconciliation and tax treatment must be signed off by company accountant.
