# Migration 033 — blocked

Historical filename: `033_candidate_tenant_scoped_relations_rls_gps_reports.sql`

Historical Production SHA-256:
`bc759884315ecf3b0716f04581b7677e3ca4ec1dec2c683fab777ca848523029`

Rev1.7 describes the scope only as tenant-scoped relations, RLS, GPS constraints and reports. The repository's `033_candidate_truck_trip_gps_and_fk_indexes.sql` has a different SHA-256 and is explicitly NOT APPLIED. It is not the historical source.

The live legacy catalog exposes the resulting state but not the complete migration delta. The pre-migration parent branch exists but its endpoint is disabled, so a reliable before/after diff could not be performed.

No executable SQL is supplied. Guessing RLS USING/WITH CHECK expressions or tenant relationships can expose cross-project data or block valid workflows.

Required evidence: original SQL bytes, or a verified pre/post catalog diff that enumerates every changed policy, constraint, index, trigger and grant.
