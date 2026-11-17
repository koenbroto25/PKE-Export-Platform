-- RECONSTRUCTED FROM VERIFIED PRE/POST CATALOG DIFF; NOT BYTE-IDENTICAL SOURCE
-- Historical migration: 030_validate_production_foreign_keys.sql
-- Historical SHA-256 (from migration_history): 2bb2f8fcc9f947669b1712214d425679e9b6385269d4e471f77f09a028b6b499
-- Verified: each named FK existed as NOT VALID on parent branch br-gentle-thunder-b3z7y3bk
-- and exists VALID on legacy production branch br-calm-glade-b3nrleet.
-- Production already records migration 030 as applied. NEVER rerun on Production.
-- This candidate is retained under docs/recovery, not migrations/.

ALTER TABLE public.buyers
  VALIDATE CONSTRAINT buyers_country_code_fkey;

ALTER TABLE public.pks_sites
  VALIDATE CONSTRAINT pks_sites_country_code_fkey;

ALTER TABLE public.ports
  VALIDATE CONSTRAINT ports_country_code_fkey;

ALTER TABLE public.project_members
  VALIDATE CONSTRAINT project_members_project_role_same_project_fkey;

ALTER TABLE public.projects
  VALIDATE CONSTRAINT projects_export_country_code_fkey;
