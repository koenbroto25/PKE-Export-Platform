# PKE Neon Legacy Branch Forensics — 17 November 2026

## Scope and safety
Six disabled compute endpoints in legacy Neon project `lucky-glitter-99553107` were temporarily enabled for SELECT-only inspection. No DDL, DML, migration execution, restore, branch creation, or Production changes were performed. All six endpoints were re-disabled and suspended after inspection.

## Branches inspected

| Branch | Branch ID | Tables | RLS tables | FORCE RLS | FKs | Policies | migration_history |
|---|---|---:|---:|---:|---:|---:|---|
| production-pre-promotion-20261107 | br-still-flower-b3z7p6fv | — | — | — | — | — | relation absent |
| staging | br-empty-cherry-b3ldvfyy | 64 | 29 | 0 | 101 | 36 | no migration IDs 29–35 |
| rehearsal | br-lively-frog-b3om6oqr | 64 | 29 | 0 | 101 | 36 | no migration IDs 29–35 |
| p03-backend-hardening-test | br-gentle-thunder-b3z7y3bk | 80 | 80 | 0 | 151 | 282 | no migration IDs 29–35 |
| pke-admin-project-foundation-20261108 | br-solitary-credit-b3imfofv | 81 | 81 | 0 | 153 | 284 | no migration IDs 29–35 |
| production-pre-project-foundation-028-20261109 | br-wispy-band-b3doookb | 80 | 80 | 0 | 151 | 282 | no migration IDs 29–35 |

The pre-promotion branch returned `relation public.migration_history does not exist`. The five other inspected branches had no migration IDs 29–35. No AI-named policies or AI-named public functions were found in these pre-migration snapshots.

## Cross-check against migration-bearing branches
Legacy production (`br-calm-glade-b3nrleet`), `revision3-production-validation-20261114` (`br-billowing-math-b31f4wos`), and active Production (`br-damp-shape-b3xlh4nr`) all have migration history through ID 35 with matching names, SHA-256 values, timestamps, and statuses. These rows establish application metadata, not original SQL text.

## Finding
The six older branches are pre-029 snapshots and cannot supply the original SQL for 033 or 035. The Neon branch inventory therefore does not contain a recoverable source copy of those migrations.

## Safe resolution
1. Do not rerun 029–035 on current Production; all are already recorded applied.
2. Do not fabricate files under historical names/checksums; SHA-256 is not reversible.
3. Keep 029, 030, 031, 032, and 034 as review-only reconstructions; keep 033 and 035 marked BLOCKED as historical source files.
4. For clean future installations, build a new explicitly versioned canonical bootstrap from a complete schema-only export of current Production, covering extensions, types, domains, enums, sequences, defaults, tables, constraints, indexes, policies, functions, triggers, views, grants, and ownership. Validate on an isolated disposable PostgreSQL environment. This is a new canonical baseline, not recovery of original 033/035.
5. Preserve historical 029–035 checksums in an immutable manifest. For actual Production drift, use a new forward-only migration ID after measured comparison.
6. Continue searching Git object storage, CI artifacts, deployment bundles, and backups only for exact source text.

## Endpoint cleanup
All six temporarily enabled legacy endpoints were set `disabled=true` and suspended. Neon returned `current_state=idle` and `disabled=true` for each:
- ep-delicate-water-b3k40amq
- ep-green-king-b3qgunq5
- ep-divine-morning-b3urh4xg
- ep-wispy-leaf-b3u0ipph
- ep-old-surf-b3qzy45x
- ep-mute-voice-b3abqeyh

## Plan update
`D:\PKE\PKE_P03_PLAN.md` is not mounted in this runtime. This report is the evidence artifact and does not claim the local Windows plan was modified.
