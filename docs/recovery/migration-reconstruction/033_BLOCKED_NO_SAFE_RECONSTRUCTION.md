# Migration 033 — reconstructed evidence, still blocked for execution

Historical Production filename:
`033_candidate_tenant_scoped_relations_rls_gps_reports.sql`

Historical Production SHA-256:
`bc759884315ecf3b0716f04581b7677e3ca4ec1dec2c683fab777ca848523029`

## What is now known

A read-only parent/child comparison was completed:

- Parent branch `br-gentle-thunder-b3z7y3bk`: 80 public tables, all RLS enabled, 0 FORCE RLS.
- Child branch `br-calm-glade-b3nrleet`: 152 public tables, all RLS enabled, 71 FORCE RLS.
- 72 tables exist in child but not parent.
- Cumulative object delta includes 1,259 added constraints, 225 added policies, 392 non-constraint indexes, 80 trigger definitions, 63 added public functions and 1 changed public function.
- Five pre-existing NOT VALID FKs became VALID; two CHECK constraints were expanded; 137 columns were added to existing tables; one existing policy changed; 278 table privileges and 7 runtime function EXECUTE grants were added.

The exact 72-table and object definitions are captured in `029_035_CATALOG_RECONSTRUCTION_SNAPSHOT.sql`.

## Why it remains blocked

This comparison covers the entire parent→child interval, not an isolated 033 migration boundary. The same interval also contains observable effects associated with 029, 030, 031, 032, 034 and possibly 035. It is therefore unsafe to label the cumulative SQL snapshot as the authentic 033 migration or execute it as a single migration.

The repository's candidate `033_candidate_truck_trip_gps_and_fk_indexes.sql` has a different checksum and is NOT APPLIED. It must not be promoted.

The snapshot is a reconstruction/evidence artifact only. It has not been run through PostgreSQL parser or rehearsed on an isolated database branch. This project is constrained to one Production branch and no temporary DB branch has been authorized.

## Closure requirements

1. Recover the authentic 033 source or a point-in-time catalog snapshot immediately before and after 033.
2. Separate 033 changes from 029–032 and 034–035 using migration timestamps/LSNs or narrower branch snapshots.
3. Review all tenant RLS USING/WITH CHECK expressions, grants, GPS constraints, report views/functions, triggers and FK dependencies.
4. Run the isolated rehearsal and tenant-isolation/GPS/report tests.
5. Only then promote a verified migration source into the ordered migration release.

No executable 033 SQL is provided here. This is intentional fail-closed behavior.
