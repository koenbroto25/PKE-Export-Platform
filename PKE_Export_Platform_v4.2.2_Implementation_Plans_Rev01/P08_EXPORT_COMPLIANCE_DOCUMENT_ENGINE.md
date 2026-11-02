# P08 — Export Compliance & Regulatory Document Engine

**Kategori:** Regulatory/document control  
**Prioritas:** P0 sebelum shipment ekspor  
**Status:** Draft untuk review

## 1. Tujuan

Menentukan kewajiban dokumen dan langkah ekspor untuk PKE berdasarkan produk/HS code, asal Indonesia, negara tujuan, negara transit, importer of record, intended use, packaging/shipping mode, Incoterms, buyer contract dan tanggal transaksi.

## 2. Prinsip compliance

- Jangan menyatakan seluruh dokumen selalu wajib untuk semua shipment.
- Klasifikasikan requirement sebagai `mandatory_by_law`, `conditional_by_law`, `contractual`, `buyer_requested`, `recommended` atau `not_applicable`.
- Setiap rule menyimpan sumber primer, pasal/lampiran, issuing authority, effective date, expiry/repeal, jurisdiction, commodity/HS scope, trigger condition dan reviewer.
- Peraturan yang dicabut tidak digunakan untuk assessment baru, tetapi riwayat versi tetap disimpan.
- AI membantu research/explanation; Compliance Officer/customs broker/importer mengesahkan requirement sebelum activation.

## 3. Assessment input

- PKE identity, product description, process, grade and intended use.
- HS code candidate and final classification approval.
- Exporter/supplier/manufacturer identity and facility.
- Origin Indonesia, destination China/Pakistan, transit country if any.
- Importer of Record, consignee, notify party, end user.
- Bulk vessel, breakbulk, bagged, bulk container or standard container.
- Incoterms, buyer contract document clauses and payment milestones.
- Planned export date and regulatory effective date.

## 4. Regulatory domains

Indonesia origin: exporter legality, HS/tariff/LARTAS, PEB/NPE, invoice/packing list, export restrictions/levies if applicable, quarantine/plant health, survey/inspection, certificate of origin/preferential origin if requested/eligible, port/shipping documents.

China destination: import/feed-product classification, importer and facility approval/registration where applicable, applicable inspection/quarantine requirements, product/quality/contaminant standards, label/packaging, customs documents and buyer-specific declarations. The requirement must be verified for exact PKE form and importer.

Pakistan destination: distinguish DPP and Animal Quarantine Department mandates where applicable; verify plant-origin/feed-product rules, import permit/NOC, phytosanitary/quarantine treatment, fumigation, inspection, facility/product registration if applicable, and customs requirements. Verify exact product and current notification with importer/customs broker.

Transit: transit/transshipment and document amendment requirements only when route actually includes a transit jurisdiction.

## 5. Document lifecycle

`required → requested → received → extracted → under_review → verified / rejected → issued/shared → superseded/expired/withdrawn`.

Each document stores issuer, number, issue/expiry dates, holder, product, PKS/facility, country scope, shipment/lot scope, original file/version, verification status, legal source and share scope.

## 6. Compliance rule engine

Rule record includes:
- condition expression from a controlled rule catalogue (not arbitrary executable script);
- input fields and jurisdiction;
- requirement classification;
- document/activity requirement;
- effective start/end;
- source reference and evidence date;
- reviewer/approval;
- consequence and blocker severity.

Assessment generates per-project checklist with `applicable`, `conditional_pending`, `not_applicable`, `evidence_pending`, `verified`, `expired`, `requires_confirmation`.

## 7. AI use

Gemini can locate and summarize official text, compare regulation versions, extract clauses, map source references, detect mismatched product names/quantities/parties, and draft checklist. The system must retain exact source URL/document hash and quoted passage/page/section where available. AI cannot independently mark legal rule verified or make a binding customs classification.

## 8. Activation gate

Project cannot pass compliance readiness until mandatory requirements are either verified or have an approved documented waiver/exception. Unknown importer requirement is a visible blocker for review, not silently assumed fulfilled.

## 9. Acceptance criteria

- Same product shipped to China and Pakistan can produce different country-specific checklists.
- Change in HS, importer, intended use, shipping mode or export date reruns assessment.
- Expired/repealed rule does not apply to new project assessment but remains in history.
- AI-generated requirement always displays source, date and review state.
- Buyer contractual document requirement is distinguishable from statutory requirement.
- A document may satisfy multiple rules only after reviewer confirms scope/validity.
- Project dashboard shows critical missing documents and responsible owner.

## 10. Initial research country packs

Prepare separate China PKE pack and Pakistan PKE pack from official Indonesian, destination government and recognized trade sources. Country packs are not frozen in code; they are versioned records. Specific current import conditions require validation with destination importer and authorized customs/plant-health specialist before each shipment.

## 11. Dependencies

P01 project inputs; P02 rules and document schema; P03 permission; P04 source adapters; P05 file evidence; P07 cost/fee/payment triggers; P09 AI research; P11 compliance dashboards; P12 legal review tests.

## 12. References for verification

- [Indonesia Customs / Bea Cukai](https://www.beacukai.go.id/)
- [Indonesia National Trade Repository](https://intr.insw.go.id/)
- [JDIH Ministry of Trade](https://jdih.kemendag.go.id/)
- [Badan Karantina Indonesia](https://karantinaindonesia.go.id/)
- [WTO ePing SPS/TBT](https://eping.wto.org/)
- [China GACC](http://english.customs.gov.cn/)
- [Pakistan Department of Plant Protection](https://www.dpp.gov.pk/)
- [Pakistan Animal Quarantine Department](https://aqd.gov.pk/)
