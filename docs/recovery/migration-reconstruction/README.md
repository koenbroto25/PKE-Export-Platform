# Migration 029–035 Recovery Package

Status: REVIEW-ONLY. Not an executable migration release.

This package records recovered metadata and reconstructed candidates. It must stay outside `migrations/` so migration discovery/runner cannot apply it accidentally.

## Evidence
- Production migration_history (read-only): IDs 029–035 all applied; exact names, timestamps and SHA-256 recorded in the Master Plan.
- Legacy Neon source project found: `lucky-glitter-99553107`, branch `br-calm-glade-b3nrleet`.
- Legacy branch catalog read-only: function definitions, policies, constraints, trigger-function ACLs, and reference data inspected.
- Pre-migration parent branch `br-gentle-thunder-b3z7y3bk` exists but its Neon endpoint is disabled; before/after catalog diff could not be obtained.
- Repository 033 candidate has a different checksum and is explicitly NOT APPLIED.

## File classifications
- 029, 031, 032: reconstructed from stated purpose and live catalog/data; not byte-identical source.
- 030: intended five FK validation confirmed by plan; exact original SQL not recovered. Candidate constraint names need verification against the active source files before acceptance.
- 033: BLOCKED; no executable SQL supplied.
- 034: reconstructed from live trigger-function ACL state; not byte-identical source.
- 035: inferred from live AI RLS policies; requires policy-owner review.

## Rules
1. Never apply these artifacts to active Production.
2. Never overwrite historical SHA-256 values with candidate hashes.
3. Never rename the NOT APPLIED 033 candidate to the applied migration name.
4. Do not add a migration 036 to bypass this gap.
5. Only create a separately reviewed forward-only reconciliation after exact schema/policy diff and owner approval.
