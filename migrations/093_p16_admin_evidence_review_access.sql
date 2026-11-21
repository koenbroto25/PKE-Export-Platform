-- Migration 093: grant Platform Admin controlled global access to Project evidence review queues.
-- Neon UAT only. Upload/review triggers remain authoritative and independent-review guarded.
CREATE SCHEMA IF NOT EXISTS p2b_backup_092_20261121;
CREATE TABLE p2b_backup_092_20261121.p16_admin_document_policies_pre_093 AS
 SELECT * FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('project_export_documents','project_export_document_requirements');

DROP POLICY IF EXISTS p16_admin_document_read ON public.project_export_documents;
CREATE POLICY p16_admin_document_read ON public.project_export_documents FOR SELECT TO app_runtime_secure
 USING (public.pke_is_platform_admin());
DROP POLICY IF EXISTS p16_admin_document_insert ON public.project_export_documents;
CREATE POLICY p16_admin_document_insert ON public.project_export_documents FOR INSERT TO app_runtime_secure
 WITH CHECK (public.pke_is_platform_admin());
DROP POLICY IF EXISTS p16_admin_document_update ON public.project_export_documents;
CREATE POLICY p16_admin_document_update ON public.project_export_documents FOR UPDATE TO app_runtime_secure
 USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
DROP POLICY IF EXISTS p16_admin_requirement_read ON public.project_export_document_requirements;
CREATE POLICY p16_admin_requirement_read ON public.project_export_document_requirements FOR SELECT TO app_runtime_secure
 USING (public.pke_is_platform_admin());
