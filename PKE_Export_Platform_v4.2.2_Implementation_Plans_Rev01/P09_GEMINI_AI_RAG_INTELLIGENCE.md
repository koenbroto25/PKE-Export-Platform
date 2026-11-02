# P09 — Gemini AI, RAG & Intelligence Orchestrator

**Kategori:** Advanced intelligence  
**Prioritas:** P1 after core controls; production paid tier only  
**Status:** Draft untuk review

## 1. Tujuan

Mengintegrasikan Gemini sebagai AI assistant dan analysis layer untuk membantu Admin, PM, Finance, Export Officer, Checker, Supplier dan Buyer dengan analisis, ekstraksi, rekomendasi dan pelaporan. AI tidak menggantikan deterministic calculation, database integrity, permission, legal approval, accounting, atau keputusan manusia.

## 2. Paid-tier policy

- Development/testing: Free tier hanya untuk data sintetis/anonim, prompt non-rahasia dan evaluasi.
- Production: paid tier sebelum kontrak, invoice, data supplier, personal data, bank/payment, margin, COA atau dokumen proyek nyata diproses.
- API keys berada di backend secrets. Jangan menaruh key pada frontend atau mobile app.
- Jangan menganggap lima API keys menggandakan kuota; rate limits dan billing harus dikelola berdasarkan project/quota/model sesuai kebijakan Google.
- Tetapkan budget cap, alert threshold, max tokens, per-user/per-project quota dan emergency disable switch.

## 3. Model routing baseline (verify at implementation)

Katalog resmi Gemini yang diperiksa 1 November 2026 mencantumkan:
- `gemini-3.8-flash`: default operational model untuk analisis dan agentic workflow.
- `gemini-3.5-flash-lite`: low-cost/high-throughput task model untuk klasifikasi sederhana dan extraction awal.
- `gemini-4-argon`: complex reasoning model untuk kasus langka/bernilai tinggi, setelah latency/cost/quality evaluation.
- `gemini-embedding-2`: multimodal embedding untuk semantic retrieval/RAG.

Model IDs adalah configuration, bukan konstanta source code. Pada environment setup/deploy, cek `models.list`, API compatibility, stable status, rate limits, data controls, pricing dan deprecation. Gunakan versioned/stable identifiers yang diuji; sediakan fallback model.

## 4. Gemini use cases

| Use case | Model routing | Output authority |
|---|---|---|
| Contract extraction/project draft | Flash; Argon for ambiguous contract clauses | Draft; Admin confirms |
| Invoice/packing list/COA OCR | Flash-Lite pre-extract, Flash review | Draft extraction; user verifies |
| Regulatory research | Flash/Argon + grounded official sources/RAG | Research note; Compliance Officer signs |
| Truck photo/plate/weighbridge assist | Flash vision | Suggested fields only |
| Operational daily summary | Flash | Narrative from verified facts |
| Cost variance explanation | Flash/Argon | Analysis; deterministic financial engine supplies numbers |
| FX risk narrative | Flash/Argon | Explain calculated exposure; no rate prediction as certainty |
| Supplier scoring explanation | Flash | Explain optimizer result; constraints computed by code |
| Buyer shipment assistant | Flash, scoped read-only tools | Buyer-safe answer only |
| Historical project BI | Batch/background Flash/Argon | Draft insights, analyst review |
| Semantic knowledge retrieval | Embedding 2 | Search vectors; RAG retrieval |

## 5. AI Orchestrator components

1. Model Registry and Router.
2. Use-case/Prompt Registry with versions.
3. Context Builder with least-data selection and redaction.
4. RAG Retrieval layer (Postgres + pgvector or equivalent).
5. Function/Tool Gateway.
6. Schema validator and business-rule validator.
7. Source/provenance capture.
8. Output safety/privacy filter.
9. Human review and feedback.
10. Usage/budget/latency/error monitor.

## 6. Function calling policy

Read-only functions include `get_project_summary`, `get_supplier_capacity`, `get_inventory_status`, `get_trip_checkpoints`, `get_loading_performance`, `get_vessel_status`, `get_missing_documents`, `get_fx_exposure`, `get_cashflow_summary`, `get_profitability_summary`.

Draft functions include `create_task_draft`, `create_payment_request_draft`, `generate_buyer_report_draft`, `generate_supplier_report_draft`, `propose_project_configuration`, `create_exception_report_draft`.

Never expose tool functions for direct payment execution, payment approval, journal posting, deleting evidence, changing role/RLS, publishing confidential documents, or changing contract terms. High-impact operations require explicit authenticated human confirmation in application UI and re-check authorization at execution time.

## 7. Interactions API and content generation

Use Gemini Interactions API as the preferred agent/conversation interface when it meets the selected model/tool requirements; retain `generateContent`/`batch` adapters if a specific capability or workflow requires it. Separate synchronous UI answers from background long-running analysis. Persist application-side conversation metadata and tool audit; do not treat model conversation state as authoritative business state.

Structured output must be parsed with strict schema and then semantically validated by application code. Valid JSON can still contain wrong numbers/IDs/logic.

## 8. RAG / corporate knowledge

- Index approved policies, contract templates, SOP, regulation sources, buyer clauses, historical reports with permission metadata.
- Chunk and embed with source, version, date, access scope and classification metadata.
- Retrieve only documents/records that current user is authorized to see.
- Keep superseded/repealed sources searchable for history but exclude from current-rule retrieval unless query is historical.
- Require source citations/links in legal/compliance answers.
- Prevent prompt injection from uploaded files: treat document text as untrusted content; never allow instructions inside documents to alter system permissions/tools.

## 9. Privacy and context minimization

Do not send entire database rows or all project files. Select only relevant fields. Redact driver personal information, bank account details, passwords, credentials and data not needed for task. Buyer assistant must use a buyer-specific context builder and read-only functions that query published data only.

## 10. AI error handling

- API unavailable/rate-limited: fallback to ordinary workflow and deterministic reports.
- Invalid schema: retry once with constrained repair or send to manual review.
- Low confidence or conflicting sources: abstain/escalate; do not invent.
- No source found: say unknown and create manual task if needed.
- Model update/deprecation: staged evaluation before production switch.

## 11. AI quality evaluation

Build benchmark sets from anonymized pilot data: COA, invoice, packing list, ticket timbang, truck photos, regulatory excerpts, cash variance cases, FX examples, buyer questions and supplier reports. Measure field extraction accuracy, citation correctness, hallucination rate, unauthorized data leakage, action correctness, latency and cost per successful task.

## 12. Acceptance criteria

- Production requests use paid Gemini project/plan and server-side key.
- User authorization is applied before context retrieval and before tool execution.
- Every answer can be traced to source data or labeled as inference/assumption.
- JSON output is schema and business-rule validated.
- Buyer cannot ask AI to retrieve internal finance/other buyer data.
- AI cannot approve/execute payment or post journal.
- All AI calls have usage/cost/latency logs and budget controls.
- AI outage does not block core truck, inventory, accounting or compliance transaction.
- Model replacement passes regression benchmark.

## 13. References

- [Gemini API models](https://ai.google.dev/gemini-api/docs/models)
- [Gemini Interactions API](https://ai.google.dev/gemini-api/docs/interactions-overview)
- [Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Context caching](https://ai.google.dev/gemini-api/docs/caching)
- [Inference optimization / Batch API](https://ai.google.dev/gemini-api/docs/optimization)
